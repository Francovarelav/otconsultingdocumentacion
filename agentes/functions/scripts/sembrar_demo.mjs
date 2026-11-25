// Siembra datos de demostración en Firestore con la sesión de gcloud del operador.
// Todo lo que escribe lleva `demo: true`; `node scripts/sembrar_demo.mjs --borrar` lo quita.
// Se liga siempre por id_colaborador a los colaboradores que ya existen (regla 1); no toca sus fichas.
import { Timestamp, FieldValue } from "@google-cloud/firestore";
import { firestoreGcloud } from "../src/local.js";
import { JORNADA_DEF, esLaborable, diasHabiles, sumarDias, fechaLocal, horaLocal } from "../src/operacion.js";

const db = firestoreGcloud("otc-rh-agentes");
const BORRAR = process.argv.includes("--borrar");
const HOY = fechaLocal();
const DESDE = sumarDias(HOY, -42); // seis semanas de reloj checador

// PRNG determinista: la misma siembra produce los mismos datos.
let semilla = 20261125;
const azar = () => ((semilla = (semilla * 1664525 + 1013904223) % 4294967296) / 4294967296);
const entre = (a, b) => a + Math.floor(azar() * (b - a + 1));
const elegir = (arr) => arr[Math.floor(azar() * arr.length)];
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
// Monterrey es UTC-6 todo el año (sin horario de verano desde 2022).
const instante = (fecha, min) => Timestamp.fromDate(new Date(`${fecha}T${hhmm(min)}:00-06:00`));

async function escribirLotes(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const lote = db.batch();
    ops.slice(i, i + 400).forEach(([ref, datos]) => lote.set(ref, datos));
    await lote.commit();
  }
}

async function borrarDemo() {
  for (const col of ["asistencia", "vacaciones", "reconocimientos", "comunicados", "memoria"]) {
    const snap = await db.collection(col).where("demo", "==", true).get();
    for (let i = 0; i < snap.docs.length; i += 400) {
      const lote = db.batch();
      snap.docs.slice(i, i + 400).forEach((d) => lote.delete(d.ref));
      await lote.commit();
    }
    console.log(`  ${col}: ${snap.size} borrados`);
  }
  for (const e of (await db.collection("encuestas").get()).docs) {
    const r = await e.ref.collection("respuestas").where("demo", "==", true).get();
    const lote = db.batch();
    r.docs.forEach((d) => lote.delete(d.ref));
    await lote.commit();
    if (r.size) console.log(`  encuestas/${e.id}/respuestas: ${r.size} borradas (recalcula resultados desde la app)`);
  }
}

if (BORRAR) {
  await borrarDemo();
  process.exit(0);
}

// Antes de sembrar se quita lo demo anterior para que el script se pueda correr varias veces.
await borrarDemo();

// ------------------------------------------------------------ usuario demo (las Cloud Functions leen este doc)
await db.doc("usuarios/demo_rh_user").set({ rol: "admin", nombre: "Demo RH", email: "demo@otconsulting.com.mx", activo: true, demo: true }, { merge: true });
console.log("usuarios/demo_rh_user listo");

// ------------------------------------------------------------ plantilla
const cols = (await db.collection("colaboradores").get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const activos = cols.filter((c) => c.estatus === "Activo" && c.es_plantilla !== 0);
const bajas = cols.filter((c) => c.estatus === "Baja" && c.es_plantilla !== 0);
console.log(`plantilla: ${activos.length} activos, ${bajas.length} bajas`);
const jornada = { ...JORNADA_DEF, ...((await db.doc("config/jornada").get()).data() ?? {}) };

// ------------------------------------------------------------ vacaciones y permisos
const existentes = (await db.collection("vacaciones").get()).docs.map((d) => d.data());
const ocupado = {}; // id_colaborador -> [[inicio, fin]] aprobados
existentes.filter((v) => v.estado === "aprobada").forEach((v) => (ocupado[v.id_colaborador] ??= []).push([v.inicio, v.fin]));
const choca = (id, a, b) => (ocupado[id] ?? []).some(([i, f]) => i <= b && f >= a) || existentes.some((v) => v.id_colaborador === id && ["pendiente", "aprobada"].includes(v.estado) && v.inicio <= b && v.fin >= a);

const MOTIVOS = { vacaciones: ["Viaje familiar", "Descanso", "Puente de fin de año", null], permiso_con_goce: ["Trámite personal", "Cita médica", "Mudanza"], incapacidad: ["Incapacidad IMSS por enfermedad general"], permiso_sin_goce: ["Asunto personal"] };
const opsVac = [];
const conVac = [...activos].sort(() => azar() - 0.5).slice(0, 18);
conVac.forEach((c, i) => {
  const tipo = i < 11 ? "vacaciones" : i < 14 ? "permiso_con_goce" : i < 16 ? "incapacidad" : "permiso_sin_goce";
  const pasado = i % 3 !== 0;
  const inicio = sumarDias(HOY, pasado ? -entre(5, 38) : entre(6, 40));
  const fin = sumarDias(inicio, tipo === "vacaciones" ? entre(2, 6) : entre(0, 2));
  const dias = diasHabiles(inicio, fin, jornada);
  if (!dias || choca(c.id, inicio, fin)) return;
  const estado = pasado ? (i === 7 ? "rechazada" : "aprobada") : i % 2 ? "pendiente" : "aprobada";
  if (estado === "aprobada") (ocupado[c.id] ??= []).push([inicio, fin]);
  const creada = instante(sumarDias(inicio, -entre(4, 15)), entre(9 * 60, 17 * 60));
  opsVac.push([db.collection("vacaciones").doc(), {
    id_colaborador: c.id, nombre: c.nombre ?? null, tipo, inicio, fin, dias_habiles: dias,
    motivo: elegir(MOTIVOS[tipo]), estado, aviso: null, solicitada_por: c.nombre ?? c.id, creada,
    ...(estado !== "pendiente" ? { resuelta: Timestamp.fromMillis(creada.toMillis() + 86400000), resuelta_por: "Demo RH" } : {}),
    ...(estado === "rechazada" ? { motivo_rechazo: "Se cruza con el cierre del proyecto" } : {}),
    demo: true,
  }]);
});
await escribirLotes(opsVac);
console.log(`vacaciones: ${opsVac.length}`);

// ------------------------------------------------------------ reloj checador
// Cada persona tiene su propio patrón: casi todos puntuales, algunos con retardos frecuentes.
const yaChecado = new Set((await db.collection("asistencia").get()).docs.map((d) => d.id));
const entradaBase = aMin(jornada.hora_entrada), salidaBase = aMin(jornada.hora_salida);
function aMin(h) { const [a, b] = h.split(":").map(Number); return a * 60 + b; }
const perfil = Object.fromEntries(activos.map((c) => [c.id, { tarde: azar() < 0.18 ? 0.35 : 0.06, falta: azar() < 0.1 ? 0.07 : 0.015, remoto: azar() < 0.4 }]));
const opsAsis = [];
for (let f = DESDE; f <= HOY; f = sumarDias(f, 1)) {
  if (!esLaborable(f, jornada)) continue;
  for (const c of activos) {
    const id = `${c.id}__${f}`;
    if (yaChecado.has(id)) continue;
    if ((ocupado[c.id] ?? []).some(([i, fin]) => i <= f && fin >= f)) continue; // de vacaciones o permiso
    const p = perfil[c.id];
    if (azar() < p.falta) continue; // falta: no hay registro
    const entra = azar() < p.tarde ? entradaBase + entre(jornada.tolerancia_min + 1, 55) : entradaBase + entre(-25, jornada.tolerancia_min);
    const retardo = entra - entradaBase > jornada.tolerancia_min ? entra - entradaBase : 0;
    const esHoy = f === HOY;
    if (esHoy && entra > aMin(horaLocal())) continue; // hoy solo lo que ya pasó
    const olvido = !esHoy && azar() < 0.02; // olvidó checar la salida
    const sale = esHoy || olvido ? null : Math.max(entra + 8 * 60, salidaBase + entre(-10, 75));
    opsAsis.push([db.collection("asistencia").doc(id), {
      id_colaborador: c.id, nombre: c.nombre ?? null, fecha: f,
      entrada: instante(f, entra), salida: sale == null ? null : instante(f, sale),
      hora_entrada: hhmm(entra), hora_salida: sale == null ? null : hhmm(sale), retardo_min: retardo,
      minutos_trabajados: sale == null ? null : sale - entra, estado: sale == null ? "abierta" : "cerrada",
      origen: p.remoto ? "remoto" : "qr", registrado_por: c.nombre ?? c.id, nota: null, dia_laborable: true,
      actualizado: FieldValue.serverTimestamp(), demo: true,
    }]);
  }
}
await escribirLotes(opsAsis);
// El registro "empieza" en DESDE para que la prenómina cuente faltas solo a partir de ahí.
await db.doc("config/jornada").set({ inicio_registro: DESDE }, { merge: true });
console.log(`asistencia: ${opsAsis.length} checadas desde ${DESDE}`);

// ------------------------------------------------------------ encuestas (respuestas anónimas + resultados)
const TEXTOS = {
  porque: ["Buen ambiente con el equipo", "Los proyectos Oracle son retadores", "Falta claridad en el plan de carrera", "La carga de trabajo es alta en cierres", "Me gusta la flexibilidad del trabajo remoto", "Quisiera más capacitación en IA", "Buen liderazgo en mi proyecto", "Sueldos por debajo del mercado"],
  comentario: ["Mejor plan de crecimiento", "Más seguimiento del líder", "Ofertas más competitivas", "Nada, fue buena experiencia"],
};
function respuesta(p, sesgo) {
  if (p.tipo === "nps") return Math.min(10, Math.max(0, Math.round(7.2 + sesgo * 2 + (azar() - 0.5) * 6)));
  if (p.tipo === "escala") return Math.min(p.max, Math.max(p.min, Math.round(3.5 + sesgo + (azar() - 0.5) * 2.6)));
  if (p.tipo === "si_no") return azar() < 0.55 + sesgo * 0.2;
  if (p.tipo === "opcion") return elegir(p.opciones.slice(0, Math.min(6, p.opciones.length)));
  if (p.tipo === "multiple") return [elegir(p.opciones)];
  return azar() < 0.6 ? elegir(TEXTOS[p.id] ?? TEXTOS.porque) : null;
}
for (const e of (await db.collection("encuestas").get()).docs) {
  const enc = e.data();
  const universo = enc.tipo === "salida" ? bajas : activos;
  const n = enc.tipo === "salida" ? Math.min(12, universo.length) : Math.round(universo.length * (enc.tipo === "enps" ? 0.68 : 0.58));
  const quienes = [...universo].sort(() => azar() - 0.5).slice(0, n);
  const lote = db.batch();
  quienes.forEach((c) => {
    const sesgo = enc.tipo === "salida" ? -0.6 : (azar() - 0.4) * 0.8;
    const r = {};
    enc.preguntas.forEach((p) => { const v = respuesta(p, sesgo); if (v != null) r[p.id] = v; });
    lote.set(e.ref.collection("respuestas").doc(), {
      respuestas: r, id_colaborador: enc.anonima === false || enc.tipo === "salida" ? c.id : null,
      creada: instante(sumarDias(HOY, -entre(1, 20)), entre(9 * 60, 19 * 60)), demo: true,
    });
  });
  await lote.commit();
  await recalcular(e.ref, enc);
  await e.ref.update({ estado: "abierta", publica: true });
  console.log(`encuesta ${enc.tipo}: ${n} respuestas, abierta`);
}

// Misma lógica que recalcularResultados() de src/encuestas.js, con el cliente de gcloud.
async function recalcular(ref, e) {
  const resp = (await ref.collection("respuestas").get()).docs.map((d) => d.data().respuestas ?? {});
  const por = {};
  for (const p of e.preguntas) {
    const vals = resp.map((r) => r[p.id]).filter((v) => v != null && v !== "");
    const r = { tipo: p.tipo, texto: p.texto, n: vals.length };
    if (p.tipo === "nps") {
      const pro = vals.filter((v) => v >= 9).length, det = vals.filter((v) => v <= 6).length;
      r.nps = { promotores: pro, pasivos: vals.length - pro - det, detractores: det, score: vals.length ? Math.round(((pro - det) / vals.length) * 100) : null };
      r.promedio = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
    }
    if (["nps", "escala", "opcion", "si_no", "multiple"].includes(p.tipo)) {
      const dist = {};
      vals.flat().forEach((v) => { const k = typeof v === "boolean" ? (v ? "Sí" : "No") : String(v); dist[k] = (dist[k] ?? 0) + 1; });
      r.distribucion = dist;
    }
    if (p.tipo === "escala") r.promedio = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
    if (p.tipo === "texto") r.textos = vals.slice(-200).map(String);
    por[p.id] = r;
  }
  await db.collection("encuestas_resultados").doc(ref.id).set({ total: resp.length, por_pregunta: por, actualizado: FieldValue.serverTimestamp() }, { merge: true });
  await ref.update({ total_respuestas: resp.length });
}

// ------------------------------------------------------------ cultura: reconocimientos y comunicados
const valoresCfg = (await db.doc("config/cultura").get()).data()?.valores?.map((v) => v.nombre).filter(Boolean);
const VALORES = valoresCfg?.length ? valoresCfg : ["Servicio al cliente", "Trabajo en equipo", "Excelencia técnica", "Innovación"];
const MENSAJES = [
  "Gracias por sacar el cierre de mes del cliente a tiempo.",
  "Tu apoyo en la migración a Oracle Cloud fue clave.",
  "Excelente capacitación de NetSuite para el equipo nuevo.",
  "Resolviste la incidencia de producción en tiempo récord.",
  "Siempre dispuesto a ayudar a los que van llegando.",
  "Muy buena presentación con el cliente, quedaron encantados.",
  "Gracias por documentar todo el proceso, nos ahorraste horas.",
];
const opsRec = [];
for (let i = 0; i < 22; i++) {
  const de = elegir(activos), para = elegir(activos.filter((c) => c.id !== de.id));
  opsRec.push([db.collection("reconocimientos").doc(), {
    de_uid: "demo", de_nombre: de.nombre ?? de.id, para_id_colaborador: para.id, para_nombre: para.nombre ?? null,
    valor: elegir(VALORES), mensaje: elegir(MENSAJES), creada: instante(sumarDias(HOY, -entre(0, 35)), entre(9 * 60, 19 * 60)), demo: true,
  }]);
}
const COMUNICADOS = [
  ["Registro de asistencia obligatorio", "A partir de esta quincena, la prenómina toma las checadas del reloj. Checa entrada y salida con tu QR o desde Mi espacio.", true],
  ["Encuesta de clima abierta", "Tus respuestas son anónimas. Nos ayudan a decidir capacitación, cargas de trabajo y plan de carrera.", false],
  ["Periodo vacacional de fin de año", "Las solicitudes para el 22 de diciembre al 2 de enero se reciben hasta el 5 de diciembre.", false],
  ["Actualiza tu expediente", "RH necesita tu contrato firmado y comprobante de domicilio vigente. Revisa qué te falta en Mi espacio.", false],
];
COMUNICADOS.forEach(([titulo, cuerpo, fijado], i) => {
  const t = instante(sumarDias(HOY, -i * 6), 10 * 60);
  opsRec.push([db.collection("comunicados").doc(), { titulo, cuerpo, fijado, autor: "Demo RH", creada: t, actualizado: t, demo: true }]);
});
await escribirLotes(opsRec);
console.log(`cultura: 22 reconocimientos, ${COMUNICADOS.length} comunicados`);
// ------------------------------------------------------------ memoria de los agentes
const NOTAS = [
  ["decisión", null, "La causa de baja se captura con el catálogo CB01–CB10; nunca en texto libre."],
  ["decisión", null, "El costo por hora se calcula como Sueldo Total Integrado / 160 (regla 10)."],
  ["preferencia", null, "RH prefiere los reportes de rotación por cohorte de ingreso, no por mes calendario."],
  ["contexto", null, "Las cifras de Etapa 4 son al corte del 20 de noviembre de 2026."],
  ["hecho", null, "Los 2 registros de familiares de seguros no cuentan como plantilla (regla 8)."],
  ["preferencia", null, "Para staffing, priorizar consultores en banca con nivel Avanzado o Experto en Oracle Cloud."],
  ["contexto", null, "El reloj checador empezó a usarse el ${DESDE}; antes de esa fecha no hay faltas medibles."],
];
const conEntidad = [...activos].sort(() => azar() - 0.5).slice(0, 3);
NOTAS.push(
  ["hecho", conEntidad[0].id, "Pidió cambio a un proyecto de NetSuite al terminar su asignación actual."],
  ["acuerdo", conEntidad[1].id, "Acordó con RH entregar su contrato firmado antes del cierre de mes."],
  ["preferencia", conEntidad[2].id, "Prefiere trabajo remoto los viernes; ya lo aprobó su líder."],
);
await escribirLotes(NOTAS.map(([tema, entidad, texto], i) => [db.collection("memoria").doc(), {
  texto, tema, entidad, autor: i % 3 ? "Demo RH" : "Asistente RH", fuente: i % 3 ? "usuario" : "agente",
  creada: instante(sumarDias(HOY, -entre(0, 30)), entre(9 * 60, 19 * 60)), demo: true,
}]));
console.log(`memoria: ${NOTAS.length} notas`);

console.log("\nListo. Para quitar todo: node scripts/sembrar_demo.mjs --borrar");
