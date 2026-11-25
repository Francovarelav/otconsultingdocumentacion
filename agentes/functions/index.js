// Cloud Functions del sistema agéntico de RH de OT Consulting.
// IA: Gemini en Vertex AI (cuenta de servicio del proyecto, sin llaves) con tope mensual de gasto.
// Seguridad: App Check obligatorio en la nube + usuario dado de alta + permisos por rol.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { setGlobalOptions } from "firebase-functions/v2";

import { clienteIA, invalidar, PROYECTO } from "./src/comun.js";
import { correrAgente } from "./src/loop.js";
import { ejecutarRutina as correrRutina } from "./src/rutina.js";
import { procesarCv } from "./src/cv.js";
import { AGENTES } from "./src/agentes.js";
import { bucketGcloud, firestoreGcloud, hayGcloud } from "./src/local.js";
import { calcularPrenomina as correrPrenomina, checar as registrarChecada, esFecha, JORNADA_DEF, saldoVacaciones as calcularSaldo, solicitarVacaciones as crearSolicitud } from "./src/operacion.js";
import { analizarEncuesta as analizarConIA, guardarEncuesta as guardarEnc, obtenerFormulario as formularioPublico, responderEncuesta as registrarRespuesta } from "./src/encuestas.js";

// ---------------------------------------------------------------- inicialización
// En el emulador local se usa la sesión de gcloud del operador (la organización bloquea llaves de
// cuentas de servicio y la credencial ADC caduca). En la nube, la cuenta de servicio de la función.
const enLocal = process.env.FUNCTIONS_EMULATOR === "true" && hayGcloud();
const credencialGcloud = {
  async getAccessToken() {
    return { access_token: execFileSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8" }).trim(), expires_in: 2700 };
  },
};
initializeApp(enLocal ? { credential: credencialGcloud, projectId: PROYECTO } : undefined);
const db = enLocal ? firestoreGcloud(PROYECTO) : getFirestore();
const BUCKET = `${PROYECTO}.firebasestorage.app`;
const bucket = () => (enLocal ? bucketGcloud(PROYECTO, BUCKET) : getStorage().bucket(BUCKET));
const ia = () => clienteIA({ local: enLocal });

setGlobalOptions({ region: "us-central1", maxInstances: 10 });
// App Check se exige en la nube; en el emulador local no hay verificación de tokens.
const BASE = { enforceAppCheck: !enLocal, cors: true };
const IA = { ...BASE, timeoutSeconds: 300, memory: "512MiB" };

// ---------------------------------------------------------------- roles
// admin: todo (sueldos, usuarios, SOPs) · rh: opera (aprueba, tareas, CVs) · lector: solo consulta.
const ROLES = ["admin", "rh", "lector", "colaborador"];
const STAFF = ["admin", "rh", "lector"];
const OPERA = ["admin", "rh"];

async function usuario(req, permitidos = STAFF) {
  if (!req.auth) throw new HttpsError("unauthenticated", "Inicia sesión.");
  const ref = db.collection("usuarios").doc(req.auth.uid);
  const snap = await ref.get();
  const u = snap.data();
  if (!snap.exists || u.activo === false) throw new HttpsError("permission-denied", "Tu cuenta no tiene acceso; pide alta a RH.");
  const rol = ROLES.includes(u.rol) ? u.rol : "lector";
  if (!permitidos.includes(rol)) throw new HttpsError("permission-denied", `Tu rol (${rol}) no permite esta acción.`);
  const ultimo = u.ultimoAcceso?.toMillis?.() ?? 0;
  if (Date.now() - ultimo > 15 * 60 * 1000) await ref.update({ ultimoAcceso: FieldValue.serverTimestamp() });
  if (rol === "colaborador" && !u.id_colaborador) throw new HttpsError("failed-precondition", "Tu usuario no está ligado a un colaborador; pide a RH que lo ligue.");
  return { uid: req.auth.uid, rol, autor: u.nombre || u.email || req.auth.token.email, id_colaborador: u.id_colaborador ?? null };
}

// La cuenta demo tiene credenciales públicas: su uso de IA lleva un cupo diario propio, aparte del
// tope mensual y de la pausa de config/gasto. Protege el billing aunque alguien abuse del demo.
const DEMO_UID = "demo_rh_user";
const CUPO_DEMO_DIA = 25;
async function cupoIA(uid) {
  if (uid !== DEMO_UID) return;
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Monterrey" }).format(new Date());
  const ref = db.collection("config").doc("gasto_demo");
  await db.runTransaction(async (tx) => {
    const g = (await tx.get(ref)).data() ?? {};
    const n = g.fecha === hoy ? g.llamadas ?? 0 : 0;
    if (n >= CUPO_DEMO_DIA) throw new HttpsError("resource-exhausted", `La cuenta demo llegó a su límite de ${CUPO_DEMO_DIA} consultas de IA por día. Vuelve mañana.`);
    tx.set(ref, { fecha: hoy, llamadas: n + 1, limite: CUPO_DEMO_DIA });
  });
}

const texto = (v, max = 4000) => {
  if (typeof v !== "string" || !v.trim()) throw new HttpsError("invalid-argument", "Falta texto.");
  return v.trim().slice(0, max);
};

function errorIA(e, contexto) {
  if (e?.codigo === "limite-gasto") return new HttpsError("resource-exhausted", e.message);
  if (e instanceof HttpsError) return e;
  console.error(contexto, e);
  return new HttpsError("internal", "El agente no pudo responder. Intenta de nuevo en un momento.");
}

// ---------------------------------------------------------------- chat con un agente
export const chatAgente = onCall(IA, async (req) => {
  const u = await usuario(req, STAFF);
  await cupoIA(u.uid);
  const { agente, conversacionId } = req.data ?? {};
  const mensaje = texto(req.data?.mensaje);
  if (!AGENTES[agente]) throw new HttpsError("invalid-argument", "Agente desconocido.");

  let ref, historial = [];
  if (conversacionId) {
    ref = db.collection("conversaciones").doc(String(conversacionId));
    const snap = await ref.get();
    if (!snap.exists || snap.data().uid !== u.uid) throw new HttpsError("not-found", "Conversación no encontrada.");
    historial = snap.data().mensajes ?? [];
  } else {
    ref = db.collection("conversaciones").doc();
  }

  let r;
  try {
    r = await correrAgente({ cliente: ia(), db, agenteId: agente, historial, mensaje, ctx: { rol: u.rol, autor: u.autor } });
  } catch (e) {
    throw errorIA(e, "chatAgente");
  }

  const ahora = new Date();
  await ref.set({
    agente, uid: u.uid, autor: u.autor,
    ...(historial.length ? {} : { titulo: mensaje.slice(0, 80), creada: FieldValue.serverTimestamp() }),
    mensajes: [...historial,
      { rol: "usuario", texto: mensaje, fecha: ahora },
      { rol: "agente", texto: r.respuesta, pasos: r.pasos, fecha: ahora }],
    uso: { entrada: FieldValue.increment(r.uso.entrada), salida: FieldValue.increment(r.uso.salida) },
    actualizada: FieldValue.serverTimestamp(),
  }, { merge: true });

  return { conversacionId: ref.id, respuesta: r.respuesta, pasos: r.pasos };
});

// ---------------------------------------------------------------- lector de CVs
export const leerCv = onCall(IA, async (req) => {
  const u = await usuario(req, ["admin", "rh"]);
  await cupoIA(u.uid);
  const ruta = texto(req.data?.ruta, 500);
  if (!ruta.startsWith(`cvs/${u.uid}/`) || !ruta.toLowerCase().endsWith(".pdf"))
    throw new HttpsError("invalid-argument", "Ruta de CV inválida.");
  const ref = await db.collection("cvs").add({
    archivo: String(req.data?.archivo || ruta.split("/").pop()).slice(0, 200), ruta, uid: u.uid, autor: u.autor,
    estado: enLocal ? "procesando-local" : "procesando", creada: FieldValue.serverTimestamp(),
  });
  // En la nube lo procesa el disparador; en local (sin emulador de Firestore) se procesa aquí mismo.
  if (enLocal) {
    await ref.update({ estado: "procesando" });
    await procesarCv({ db, cliente: ia(), cvId: ref.id, ruta, bucket: bucket() }).catch((e) => console.error("procesarCv", e));
  }
  return { id: ref.id };
});

export const procesarCvCreado = onDocumentCreated({ document: "cvs/{id}", timeoutSeconds: 300, memory: "512MiB" }, async (event) => {
  const d = event.data?.data();
  if (!d || d.estado !== "procesando") return;
  await procesarCv({ db, cliente: ia(), cvId: event.params.id, ruta: d.ruta, bucket: bucket() })
    .catch((e) => console.error("procesarCv", e));
});

// ---------------------------------------------------------------- aprobaciones (M15)
export const resolverPropuesta = onCall(BASE, async (req) => {
  const u = await usuario(req, ["admin", "rh"]);
  const { id, decision } = req.data ?? {};
  if (!["aprobar", "rechazar"].includes(decision)) throw new HttpsError("invalid-argument", "Decisión inválida.");
  const ref = db.collection("propuestas").doc(String(id));

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Propuesta no encontrada.");
    const p = snap.data();
    if (p.estado !== "pendiente") throw new HttpsError("failed-precondition", "La propuesta ya fue resuelta.");
    const ahora = FieldValue.serverTimestamp();
    if (decision === "aprobar") {
      const destino = db.collection(p.coleccion).doc(p.id_doc);
      if (!(await tx.get(destino)).exists) throw new HttpsError("not-found", "El registro ya no existe.");
      const banderas = {
        "colaboradores.id_causa_baja": { falta_causa_baja: 0 }, "colaboradores.fecha_baja": { falta_fecha_baja: 0 },
        "colaboradores.puesto": { falta_puesto: 0 }, "colaboradores.departamento": { falta_departamento: 0 },
        "colaboradores.esquema_nomina": { falta_esquema_nomina: 0 }, "activos.costo": { falta_costo: 0 },
      }[`${p.coleccion}.${p.campo}`] ?? {};
      tx.set(destino, { ...p.cambios, ...banderas, actualizado: ahora }, { merge: true });
      tx.set(db.collection("log_correcciones").doc(`M15-${ref.id}`), {
        id_correccion: `M15-${ref.id}`, tabla: p.coleccion, columna: p.campo, id_registro: p.id_doc,
        valor_original: p.valor_actual == null ? null : String(p.valor_actual), valor_corregido: String(p.valor_propuesto),
        metodo: "M15", nota: `Agente IA (${p.agente}) · aprobado por ${u.autor} · ${p.motivo}`,
        fecha_correccion: new Date().toISOString().slice(0, 10),
      });
    }
    tx.update(ref, { estado: decision === "aprobar" ? "aprobada" : "rechazada", resuelta_por: u.autor, resuelta: ahora });
  });
  invalidar();
  return { ok: true };
});

// ---------------------------------------------------------------- bandeja
export const actualizarTarea = onCall(BASE, async (req) => {
  const u = await usuario(req, ["admin", "rh"]);
  const { id, estado } = req.data ?? {};
  if (!["abierta", "hecha", "descartada"].includes(estado)) throw new HttpsError("invalid-argument", "Estado inválido.");
  const ref = db.collection("tareas").doc(String(id));
  if (!(await ref.get()).exists) throw new HttpsError("not-found", "Tarea no encontrada.");
  await ref.update({ estado, resuelta_por: u.autor, actualizada: FieldValue.serverTimestamp() });
  return { ok: true };
});

// ---------------------------------------------------------------- rutina diaria (trabajo repetitivo)
export const rutinaDiaria = onSchedule(
  { schedule: "0 7 * * *", timeZone: "America/Monterrey", timeoutSeconds: 300, memory: "512MiB" },
  async () => { await correrRutina({ db, cliente: ia(), origen: "programada" }); },
);

export const ejecutarRutina = onCall(IA, async (req) => {
  const u = await usuario(req, ["admin", "rh"]);
  await cupoIA(u.uid);
  try {
    return await correrRutina({ db, cliente: ia(), origen: `manual · ${u.autor}` });
  } catch (e) {
    throw errorIA(e, "ejecutarRutina");
  }
});

// ---------------------------------------------------------------- conocimiento: SOPs y memoria
export const guardarSop = onCall(BASE, async (req) => {
  const u = await usuario(req, ["admin"]);
  const d = req.data ?? {};
  const id = texto(d.id, 20).toUpperCase();
  if (!/^SOP-\d{2,3}$/.test(id)) throw new HttpsError("invalid-argument", "El ID debe tener la forma SOP-09.");
  const ref = db.collection("sops").doc(id);
  const previo = await ref.get();
  const pasos = Array.isArray(d.pasos) ? d.pasos.map((p) => String(p).trim()).filter(Boolean).slice(0, 30) : [];
  if (!pasos.length) throw new HttpsError("invalid-argument", "El SOP necesita al menos un paso.");
  await ref.set({
    id, titulo: texto(d.titulo, 200), objetivo: String(d.objetivo ?? "").slice(0, 1000), disparador: String(d.disparador ?? "").slice(0, 1000),
    pasos, reglas: (Array.isArray(d.reglas) ? d.reglas : []).map(Number).filter((n) => n >= 1 && n <= 20),
    agente: AGENTES[d.agente] ? d.agente : "asistente",
    version: (previo.data()?.version ?? 0) + 1, actualizada: FieldValue.serverTimestamp(), editado_por: u.autor,
  }, { merge: true });
  return { ok: true };
});

export const guardarMemoria = onCall(BASE, async (req) => {
  const u = await usuario(req, ["admin", "rh"]);
  const ref = await db.collection("memoria").add({
    texto: texto(req.data?.texto, 2000), tema: String(req.data?.tema || "general").slice(0, 40),
    entidad: req.data?.entidad ? String(req.data.entidad).trim().slice(0, 40) : null,
    autor: u.autor, fuente: "usuario", creada: FieldValue.serverTimestamp(),
  });
  return { id: ref.id };
});

export const borrarMemoria = onCall(BASE, async (req) => {
  await usuario(req, ["admin", "rh"]);
  await db.collection("memoria").doc(String(req.data?.id)).delete();
  return { ok: true };
});

// ---------------------------------------------------------------- usuarios y roles (solo admin)
const passwordTemporal = () => `OTC-${randomBytes(9).toString("base64url")}`;

export const listarUsuarios = onCall(BASE, async (req) => {
  await usuario(req, ["admin"]);
  const snap = await db.collection("usuarios").get();
  const lista = snap.docs.map((d) => {
    const u = d.data();
    return {
      uid: d.id, email: u.email, nombre: u.nombre ?? null, rol: u.rol, activo: u.activo !== false, id_colaborador: u.id_colaborador ?? null,
      creado: u.creado?.toDate?.().toISOString() ?? null, ultimoAcceso: u.ultimoAcceso?.toDate?.().toISOString() ?? null,
    };
  });
  return lista.sort((a, b) => (a.nombre ?? a.email).localeCompare(b.nombre ?? b.email));
});

export const guardarUsuario = onCall(BASE, async (req) => {
  const admin = await usuario(req, ["admin"]);
  const d = req.data ?? {};
  const rol = ROLES.includes(d.rol) ? d.rol : null;
  if (!rol) throw new HttpsError("invalid-argument", "Rol inválido (admin, rh, lector o colaborador).");
  const nombre = texto(d.nombre, 120);
  const activo = d.activo !== false;
  let idColab = d.id_colaborador ? String(d.id_colaborador).trim().toUpperCase() : null;
  if (rol === "colaborador") {
    if (!idColab) throw new HttpsError("invalid-argument", "El rol colaborador necesita el ID del colaborador.");
    const c = await db.collection("colaboradores").doc(idColab).get();
    if (!c.exists || c.data().estatus !== "Activo") throw new HttpsError("invalid-argument", "Ese ID no es de un colaborador activo.");
    const dup = await db.collection("usuarios").where("id_colaborador", "==", idColab).get();
    if (dup.docs.some((x) => x.id !== d.uid)) throw new HttpsError("already-exists", "Ese colaborador ya tiene usuario.");
  }

  if (d.uid) {
    if (d.uid === admin.uid && (rol !== "admin" || !activo))
      throw new HttpsError("failed-precondition", "No puedes quitarte el rol de admin ni desactivarte a ti mismo.");
    const ref = db.collection("usuarios").doc(String(d.uid));
    if (!(await ref.get()).exists) throw new HttpsError("not-found", "Usuario no encontrado.");
    await ref.update({ nombre, rol, activo, id_colaborador: idColab, actualizado: FieldValue.serverTimestamp(), actualizado_por: admin.autor });
    await getAuth().updateUser(String(d.uid), { displayName: nombre, disabled: !activo });
    return { uid: d.uid };
  }

  const email = texto(d.email, 200).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpsError("invalid-argument", "Correo inválido.");
  const pass = passwordTemporal();
  let user;
  try {
    user = await getAuth().createUser({ email, password: pass, displayName: nombre, emailVerified: false });
  } catch (e) {
    if (e.code === "auth/email-already-exists") throw new HttpsError("already-exists", "Ya existe una cuenta con ese correo.");
    throw e;
  }
  await db.collection("usuarios").doc(user.uid).set({
    email, nombre, rol, activo: true, id_colaborador: idColab, creado: FieldValue.serverTimestamp(), creado_por: admin.autor,
  });
  return { uid: user.uid, passwordTemporal: pass };
});

export const restablecerAcceso = onCall(BASE, async (req) => {
  await usuario(req, ["admin"]);
  const uid = String(req.data?.uid ?? "");
  if (!(await db.collection("usuarios").doc(uid).get()).exists) throw new HttpsError("not-found", "Usuario no encontrado.");
  const pass = passwordTemporal();
  await getAuth().updateUser(uid, { password: pass });
  await getAuth().revokeRefreshTokens(uid);
  return { passwordTemporal: pass };
});

// ---------------------------------------------------------------- helpers de operación
async function colaboradorObjetivo(u, idPedido) {
  const id = u.rol === "colaborador" ? u.id_colaborador : String(idPedido ?? "").trim().toUpperCase();
  if (!id) throw new HttpsError("invalid-argument", "Falta el colaborador.");
  if (u.rol === "colaborador" && idPedido && String(idPedido).toUpperCase() !== u.id_colaborador)
    throw new HttpsError("permission-denied", "Solo puedes hacerlo para ti.");
  const s = await db.collection("colaboradores").doc(id).get();
  if (!s.exists) throw new HttpsError("not-found", `No existe el colaborador ${id}.`);
  return { id_colaborador: id, ...s.data() };
}
const negocio = (e) => (e instanceof HttpsError ? e : new HttpsError("failed-precondition", e.message));

// ---------------------------------------------------------------- asistencia (clock in / clock out)
export const checar = onCall(BASE, async (req) => {
  const u = await usuario(req, ["admin", "rh", "colaborador"]);
  const tipo = req.data?.tipo;
  if (!["entrada", "salida"].includes(tipo)) throw new HttpsError("invalid-argument", "Tipo inválido.");
  const c = await colaboradorObjetivo(u, req.data?.id_colaborador);
  if (c.estatus !== "Activo") throw new HttpsError("failed-precondition", "Solo los activos checan.");
  try {
    return await registrarChecada(db, { colaborador: c, tipo, origen: u.rol === "colaborador" ? "portal" : "rh", registradoPor: u.autor, nota: req.data?.nota ? String(req.data.nota).slice(0, 300) : null });
  } catch (e) { throw negocio(e); }
});

export const guardarJornada = onCall(BASE, async (req) => {
  const u = await usuario(req, ["admin"]);
  const d = req.data ?? {};
  const hhmm = (v, def) => (/^\d{2}:\d{2}$/.test(String(v)) ? String(v) : def);
  const jornada = {
    hora_entrada: hhmm(d.hora_entrada, JORNADA_DEF.hora_entrada), hora_salida: hhmm(d.hora_salida, JORNADA_DEF.hora_salida),
    tolerancia_min: Math.min(60, Math.max(0, Number(d.tolerancia_min ?? JORNADA_DEF.tolerancia_min))),
    dias_laborales: (Array.isArray(d.dias_laborales) ? d.dias_laborales : JORNADA_DEF.dias_laborales).map(Number).filter((n) => n >= 1 && n <= 7),
    horas_jornada: Math.min(12, Math.max(1, Number(d.horas_jornada ?? 8))), zona: JORNADA_DEF.zona,
    inicio_registro: d.inicio_registro && esFecha(d.inicio_registro) ? d.inicio_registro : null,
    actualizado: FieldValue.serverTimestamp(), actualizado_por: u.autor,
  };
  await db.collection("config").doc("jornada").set(jornada, { merge: true });
  return { ok: true };
});

// ---------------------------------------------------------------- vacaciones y permisos
export const solicitarVacaciones = onCall(BASE, async (req) => {
  const u = await usuario(req, ["admin", "rh", "colaborador"]);
  const c = await colaboradorObjetivo(u, req.data?.id_colaborador);
  if (c.estatus !== "Activo") throw new HttpsError("failed-precondition", "Solo los activos solicitan vacaciones.");
  const d = req.data ?? {};
  try {
    return await crearSolicitud(db, { colaborador: c, tipo: d.tipo, inicio: d.inicio, fin: d.fin, motivo: d.motivo ? String(d.motivo).slice(0, 500) : null, solicitadaPor: u.autor });
  } catch (e) { throw negocio(e); }
});

export const resolverVacaciones = onCall(BASE, async (req) => {
  const u = await usuario(req, ["admin", "rh", "colaborador"]);
  const { id, decision } = req.data ?? {};
  const estados = { aprobar: "aprobada", rechazar: "rechazada", cancelar: "cancelada" };
  if (!estados[decision]) throw new HttpsError("invalid-argument", "Decisión inválida.");
  const ref = db.collection("vacaciones").doc(String(id));
  const s = await ref.get();
  if (!s.exists) throw new HttpsError("not-found", "Solicitud no encontrada.");
  const v = s.data();
  if (u.rol === "colaborador" && (decision !== "cancelar" || v.id_colaborador !== u.id_colaborador || v.estado !== "pendiente"))
    throw new HttpsError("permission-denied", "Solo puedes cancelar tus solicitudes pendientes.");
  if (decision !== "cancelar" && v.estado !== "pendiente") throw new HttpsError("failed-precondition", "La solicitud ya fue resuelta.");
  if (decision === "cancelar" && !["pendiente", "aprobada"].includes(v.estado)) throw new HttpsError("failed-precondition", "No se puede cancelar.");
  await ref.update({ estado: estados[decision], resuelta_por: u.autor, resuelta: FieldValue.serverTimestamp() });
  return { ok: true };
});

export const saldoVacaciones = onCall(BASE, async (req) => {
  const u = await usuario(req, ROLES);
  const c = await colaboradorObjetivo(u, req.data?.id_colaborador);
  try { return await calcularSaldo(db, c.id_colaborador); } catch (e) { throw negocio(e); }
});

// ---------------------------------------------------------------- nómina (prenómina de control)
export const calcularPrenomina = onCall({ ...BASE, timeoutSeconds: 300, memory: "512MiB" }, async (req) => {
  const u = await usuario(req, ["admin"]);
  try { return await correrPrenomina(db, { periodo: String(req.data?.periodo ?? ""), autor: u.autor }); } catch (e) { throw negocio(e); }
});

export const cerrarPeriodo = onCall(BASE, async (req) => {
  const u = await usuario(req, ["admin"]);
  const ref = db.collection("nomina_periodos").doc(String(req.data?.periodo ?? ""));
  const s = await ref.get();
  if (!s.exists) throw new HttpsError("not-found", "Primero calcula la prenómina del periodo.");
  if (s.data().estado === "cerrado") throw new HttpsError("failed-precondition", "El periodo ya está cerrado.");
  await ref.update({ estado: "cerrado", cerrado_por: u.autor, cerrado: FieldValue.serverTimestamp() });
  return { ok: true };
});

// ---------------------------------------------------------------- encuestas y formularios públicos
export const guardarEncuesta = onCall(BASE, async (req) => {
  const u = await usuario(req, OPERA);
  const { id, plantilla, ...datos } = req.data ?? {};
  try { return await guardarEnc(db, { id, plantilla, datos: Object.keys(datos).length ? datos : undefined, autor: u.autor }); } catch (e) { throw negocio(e); }
});

export const cambiarEstadoEncuesta = onCall(BASE, async (req) => {
  const u = await usuario(req, OPERA);
  const { id, estado } = req.data ?? {};
  if (!["borrador", "abierta", "cerrada"].includes(estado)) throw new HttpsError("invalid-argument", "Estado inválido.");
  const ref = db.collection("encuestas").doc(String(id));
  if (!(await ref.get()).exists) throw new HttpsError("not-found", "Encuesta no encontrada.");
  await ref.update({ estado, [`${estado}_por`]: u.autor, actualizada: FieldValue.serverTimestamp() });
  return { ok: true };
});

export const analizarEncuesta = onCall(IA, async (req) => {
  const u = await usuario(req, OPERA);
  await cupoIA(u.uid);
  try { return await analizarConIA(db, ia(), String(req.data?.id ?? "")); } catch (e) { throw e?.codigo ? errorIA(e) : negocio(e); }
});

// Públicos: sin sesión; App Check los protege en la nube.
export const obtenerFormulario = onCall(BASE, async (req) => {
  try { return await formularioPublico(db, String(req.data?.id ?? "")); } catch (e) { throw new HttpsError("not-found", e.message); }
});

export const responderEncuesta = onCall(BASE, async (req) => {
  const { id, respuestas, id_colaborador } = req.data ?? {};
  try { return await registrarRespuesta(db, { id: String(id ?? ""), respuestas, id_colaborador }); } catch (e) { throw negocio(e); }
});

// ---------------------------------------------------------------- cultura
export const crearReconocimiento = onCall(BASE, async (req) => {
  const u = await usuario(req, ROLES);
  const d = req.data ?? {};
  const para = await db.collection("colaboradores").doc(String(d.para_id_colaborador ?? "").toUpperCase()).get();
  if (!para.exists) throw new HttpsError("not-found", "Colaborador no encontrado.");
  if (u.id_colaborador && para.id === u.id_colaborador) throw new HttpsError("invalid-argument", "No puedes reconocerte a ti mismo.");
  const ref = await db.collection("reconocimientos").add({
    de_uid: u.uid, de_nombre: u.autor, para_id_colaborador: para.id, para_nombre: para.data().nombre,
    valor: String(d.valor ?? "").slice(0, 80) || null, mensaje: texto(d.mensaje, 600), creada: FieldValue.serverTimestamp(),
  });
  return { id: ref.id };
});

export const publicarComunicado = onCall(BASE, async (req) => {
  const u = await usuario(req, OPERA);
  const d = req.data ?? {};
  const datos = { titulo: texto(d.titulo, 160), cuerpo: texto(d.cuerpo, 8000), fijado: d.fijado === true, autor: u.autor, actualizado: FieldValue.serverTimestamp() };
  if (d.id) { await db.collection("comunicados").doc(String(d.id)).set(datos, { merge: true }); return { id: d.id }; }
  const ref = await db.collection("comunicados").add({ ...datos, creada: FieldValue.serverTimestamp() });
  return { id: ref.id };
});

export const guardarCultura = onCall(BASE, async (req) => {
  const u = await usuario(req, OPERA);
  const d = req.data ?? {};
  const valores = (Array.isArray(d.valores) ? d.valores : []).slice(0, 12).map((v) => ({ nombre: String(v.nombre ?? "").slice(0, 60), descripcion: String(v.descripcion ?? "").slice(0, 400) })).filter((v) => v.nombre);
  await db.collection("config").doc("cultura").set({ mision: String(d.mision ?? "").slice(0, 1000), vision: String(d.vision ?? "").slice(0, 1000), valores, actualizado: FieldValue.serverTimestamp(), actualizado_por: u.autor }, { merge: true });
  return { ok: true };
});

