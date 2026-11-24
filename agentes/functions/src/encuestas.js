// Encuestas (eNPS, clima, pulso, salida, formularios) y formularios públicos.
// Anonimato: las respuestas crudas no se leen desde el cliente; RH ve solo los agregados.
import { FieldValue } from "firebase-admin/firestore";
import { generar, textoDe } from "./comun.js";
import { crearHerramientas } from "./herramientas.js";

const TIPOS_PREGUNTA = ["escala", "nps", "opcion", "multiple", "texto", "si_no"];
const TIPOS_ENCUESTA = ["enps", "clima", "pulso", "salida", "formulario"];

const escala = (id, texto) => ({ id, tipo: "escala", texto, min: 1, max: 5, requerida: true });

export const PLANTILLAS = {
  enps: {
    titulo: "eNPS · ¿Recomendarías OT Consulting?", tipo: "enps", anonima: true, publica: true,
    descripcion: "Dos preguntas, un minuto. Es anónima.",
    preguntas: [
      { id: "nps", tipo: "nps", texto: "Del 0 al 10, ¿qué tan probable es que recomiendes OT Consulting como lugar para trabajar?", requerida: true },
      { id: "porque", tipo: "texto", texto: "¿Cuál es la razón principal de tu calificación?", requerida: false },
    ],
  },
  clima: {
    titulo: "Clima laboral", tipo: "clima", anonima: true, publica: true,
    descripcion: "Califica del 1 (totalmente en desacuerdo) al 5 (totalmente de acuerdo). Es anónima.",
    preguntas: [
      escala("claridad", "Tengo claro qué se espera de mí en mi rol."),
      escala("herramientas", "Cuento con las herramientas y el equipo para hacer bien mi trabajo."),
      escala("lider", "Mi líder me da retroalimentación útil y frecuente."),
      escala("reconocimiento", "Mi trabajo se reconoce cuando lo hago bien."),
      escala("crecimiento", "Veo un camino de crecimiento profesional en OT Consulting."),
      escala("capacitacion", "Recibo la capacitación que necesito (Oracle, NetSuite, IA)."),
      escala("carga", "Mi carga de trabajo es razonable."),
      escala("balance", "Puedo equilibrar mi vida personal y laboral."),
      escala("compensacion", "Mi compensación es justa para mi rol y mi mercado."),
      escala("equipo", "En mi equipo hay colaboración y confianza."),
      escala("comunicacion", "La comunicación de la dirección es clara."),
      escala("permanencia", "Me veo trabajando aquí dentro de un año."),
      { id: "mejorar", tipo: "texto", texto: "¿Qué cambiarías primero?", requerida: false },
    ],
  },
  pulso: {
    titulo: "Pulso de la semana", tipo: "pulso", anonima: true, publica: true, descripcion: "Tres preguntas rápidas.",
    preguntas: [
      escala("animo", "¿Cómo te sentiste esta semana en el trabajo?"),
      escala("carga", "¿Qué tan manejable fue tu carga de trabajo?"),
      { id: "bloqueo", tipo: "texto", texto: "¿Algo te está frenando?", requerida: false },
    ],
  },
  salida: {
    titulo: "Encuesta de salida", tipo: "salida", anonima: false, publica: true,
    descripcion: "Gracias por tu tiempo en OT Consulting. Tus respuestas nos ayudan a mejorar.",
    preguntas: [
      { id: "causa", tipo: "opcion", texto: "¿Cuál fue la razón principal de tu salida?", requerida: true, opciones: [] }, // se llena con el catálogo
      escala("experiencia", "¿Cómo calificas tu experiencia general en OT Consulting?"),
      { id: "regresaria", tipo: "si_no", texto: "¿Regresarías a trabajar con nosotros?", requerida: true },
      { id: "comentario", tipo: "texto", texto: "¿Qué pudimos hacer diferente?", requerida: false },
    ],
  },
};

async function plantilla(db, tipo) {
  const p = structuredClone(PLANTILLAS[tipo]);
  if (tipo === "salida") {
    const cat = (await db.collection("catalogos").doc("causa_baja").get()).data()?.valores ?? [];
    p.preguntas[0].opciones = cat.map((c) => `${c.id_causa_baja} · ${c.causa_baja}`);
  }
  return p;
}

function limpiarPreguntas(preguntas) {
  if (!Array.isArray(preguntas) || !preguntas.length) throw new Error("La encuesta necesita al menos una pregunta.");
  if (preguntas.length > 40) throw new Error("Máximo 40 preguntas.");
  const ids = new Set();
  return preguntas.map((p, i) => {
    const tipo = TIPOS_PREGUNTA.includes(p.tipo) ? p.tipo : null;
    if (!tipo) throw new Error(`Pregunta ${i + 1}: tipo inválido.`);
    let id = String(p.id || `p${i + 1}`).replace(/[^a-zA-Z0-9_]/g, "").slice(0, 30) || `p${i + 1}`;
    while (ids.has(id)) id = `${id}_${i}`;
    ids.add(id);
    const texto = String(p.texto ?? "").trim().slice(0, 300);
    if (!texto) throw new Error(`Pregunta ${i + 1}: falta el texto.`);
    const q = { id, tipo, texto, requerida: p.requerida !== false };
    if (tipo === "opcion" || tipo === "multiple") {
      q.opciones = (p.opciones ?? []).map((o) => String(o).trim().slice(0, 120)).filter(Boolean).slice(0, 20);
      if (q.opciones.length < 2) throw new Error(`Pregunta ${i + 1}: necesita al menos 2 opciones.`);
    }
    if (tipo === "escala") { q.min = 1; q.max = Math.min(10, Math.max(3, Number(p.max) || 5)); }
    return q;
  });
}

export async function guardarEncuesta(db, { id, plantilla: tipoPlantilla, datos, autor }) {
  let base = {};
  if (tipoPlantilla) {
    if (!PLANTILLAS[tipoPlantilla]) throw new Error("Plantilla desconocida.");
    base = await plantilla(db, tipoPlantilla);
  }
  const d = { ...base, ...(datos ?? {}) };
  const tipo = TIPOS_ENCUESTA.includes(d.tipo) ? d.tipo : "formulario";
  const encuesta = {
    titulo: String(d.titulo ?? "").trim().slice(0, 160) || "Encuesta sin título",
    descripcion: String(d.descripcion ?? "").slice(0, 1000), tipo,
    anonima: tipo === "salida" ? false : d.anonima !== false, publica: d.publica !== false,
    preguntas: limpiarPreguntas(d.preguntas), cierra: d.cierra ?? null,
    actualizada: FieldValue.serverTimestamp(),
  };
  if (id) {
    const ref = db.collection("encuestas").doc(id);
    const prev = await ref.get();
    if (!prev.exists) throw new Error("Encuesta no encontrada.");
    if ((prev.data().total_respuestas ?? 0) > 0) delete encuesta.preguntas; // no se cambian preguntas con respuestas
    await ref.update(encuesta);
    return { id };
  }
  const ref = await db.collection("encuestas").add({ ...encuesta, estado: "borrador", total_respuestas: 0, creada_por: autor, creada: FieldValue.serverTimestamp() });
  return { id: ref.id };
}

/** Versión pública: sin datos internos. */
export async function obtenerFormulario(db, id) {
  const s = await db.collection("encuestas").doc(String(id)).get();
  const e = s.data();
  if (!s.exists || !e.publica) throw new Error("Este formulario no existe.");
  if (e.estado !== "abierta") throw new Error(e.estado === "cerrada" ? "Este formulario ya cerró." : "Este formulario aún no está abierto.");
  if (e.cierra && e.cierra < new Date().toISOString().slice(0, 10)) throw new Error("Este formulario ya cerró.");
  return { id: s.id, titulo: e.titulo, descripcion: e.descripcion, tipo: e.tipo, anonima: e.anonima, preguntas: e.preguntas, pide_id: e.tipo === "salida" };
}

function validarRespuestas(preguntas, respuestas) {
  const limpio = {};
  for (const p of preguntas) {
    const v = respuestas?.[p.id];
    const vacio = v == null || v === "" || (Array.isArray(v) && !v.length);
    if (vacio) { if (p.requerida) throw new Error(`Falta responder: «${p.texto}»`); continue; }
    switch (p.tipo) {
      case "nps": { const n = Number(v); if (!Number.isInteger(n) || n < 0 || n > 10) throw new Error("NPS fuera de rango."); limpio[p.id] = n; break; }
      case "escala": { const n = Number(v); if (!Number.isInteger(n) || n < p.min || n > p.max) throw new Error("Escala fuera de rango."); limpio[p.id] = n; break; }
      case "si_no": limpio[p.id] = v === true || v === "si" || v === "sí"; break;
      case "opcion": if (!p.opciones.includes(v)) throw new Error("Opción inválida."); limpio[p.id] = v; break;
      case "multiple": { const arr = (Array.isArray(v) ? v : [v]).filter((x) => p.opciones.includes(x)); if (!arr.length && p.requerida) throw new Error("Opción inválida."); limpio[p.id] = arr; break; }
      default: limpio[p.id] = String(v).slice(0, 2000);
    }
  }
  return limpio;
}

export async function recalcularResultados(db, id) {
  const e = (await db.collection("encuestas").doc(id).get()).data();
  const snap = await db.collection("encuestas").doc(id).collection("respuestas").get();
  const resp = snap.docs.map((d) => d.data().respuestas ?? {});
  const por = {};
  for (const p of e.preguntas) {
    const vals = resp.map((r) => r[p.id]).filter((v) => v != null && v !== "");
    const r = { tipo: p.tipo, texto: p.texto, n: vals.length };
    if (p.tipo === "nps") {
      const pro = vals.filter((v) => v >= 9).length, det = vals.filter((v) => v <= 6).length;
      r.nps = { promotores: pro, pasivos: vals.length - pro - det, detractores: det, score: vals.length ? Math.round(((pro - det) / vals.length) * 100) : null };
      r.promedio = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
    }
    if (p.tipo === "nps" || p.tipo === "escala" || p.tipo === "opcion" || p.tipo === "si_no" || p.tipo === "multiple") {
      const dist = {};
      vals.flat().forEach((v) => { const k = typeof v === "boolean" ? (v ? "Sí" : "No") : String(v); dist[k] = (dist[k] ?? 0) + 1; });
      r.distribucion = dist;
    }
    if (p.tipo === "escala") r.promedio = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
    if (p.tipo === "texto") r.textos = vals.slice(-200).map(String);
    por[p.id] = r;
  }
  await db.collection("encuestas_resultados").doc(id).set({ total: resp.length, por_pregunta: por, actualizado: FieldValue.serverTimestamp() }, { merge: true });
  await db.collection("encuestas").doc(id).update({ total_respuestas: resp.length });
  return { total: resp.length };
}

export async function responderEncuesta(db, { id, respuestas, id_colaborador }) {
  const f = await obtenerFormulario(db, id);
  const limpio = validarRespuestas(f.preguntas, respuestas);
  let idc = null;
  if (f.pide_id && id_colaborador) {
    idc = String(id_colaborador).trim().toUpperCase().slice(0, 20);
    if (!(await db.collection("colaboradores").doc(idc).get()).exists) throw new Error("No encontramos ese número de colaborador; revísalo o déjalo vacío.");
  }
  await db.collection("encuestas").doc(id).collection("respuestas").add({
    respuestas: limpio, id_colaborador: f.anonima ? null : idc, creada: FieldValue.serverTimestamp(),
  });
  await recalcularResultados(db, id);

  // Encuesta de salida → propuesta de causa de baja para RH (nunca escribe directo).
  let propuesta = null;
  if (f.tipo === "salida" && idc && limpio.causa) {
    const cod = String(limpio.causa).split(" · ")[0];
    try {
      const { ejecutar } = crearHerramientas(db, { rol: "rh", autor: "Encuesta de salida", agente: "encuesta_salida" });
      const r = await ejecutar("proponer_cambio", { coleccion: "colaboradores", id_doc: idc, campo: "id_causa_baja", valor_propuesto: cod, motivo: `Respuesta del colaborador en la encuesta de salida «${f.titulo}».` });
      propuesta = r.datos.id;
    } catch (e) {
      console.warn("propuesta desde encuesta de salida:", e.message);
    }
  }
  return { ok: true, propuesta: Boolean(propuesta) };
}

const ESQUEMA_ANALISIS = {
  type: "object", additionalProperties: false, required: ["resumen", "temas", "acciones"],
  properties: {
    resumen: { type: "string" },
    temas: { type: "array", items: { type: "object", additionalProperties: false, required: ["tema", "menciones", "sentimiento"],
      properties: { tema: { type: "string" }, menciones: { type: "integer" }, sentimiento: { type: "string", enum: ["positivo", "neutral", "negativo"] } } } },
    acciones: { type: "array", items: { type: "string" } },
  },
};

export async function analizarEncuesta(db, cliente, id) {
  const e = (await db.collection("encuestas").doc(id).get()).data();
  const res = (await db.collection("encuestas_resultados").doc(id).get()).data();
  if (!e || !res?.total) throw new Error("La encuesta aún no tiene respuestas.");
  const r = await generar(cliente, {
    db, pensamiento: "LOW", esquema: ESQUEMA_ANALISIS, maxTokens: 4000,
    system: "Eres el agente de Clima y cultura de RH de OT Consulting. Analizas resultados de encuestas: resumen de 3–4 líneas con las cifras, temas recurrentes de los comentarios (cuenta menciones reales, no inventes) y 3–5 acciones concretas para RH. Español de México, sin emojis.",
    contents: [{ role: "user", parts: [{ text: JSON.stringify({ titulo: e.titulo, tipo: e.tipo, total: res.total, resultados: res.por_pregunta }) }] }],
  });
  const analisis = { ...JSON.parse(textoDe(r)), generado: FieldValue.serverTimestamp() };
  await db.collection("encuestas_resultados").doc(id).set({ analisis }, { merge: true });
  return { ...analisis, generado: new Date().toISOString() };
}
