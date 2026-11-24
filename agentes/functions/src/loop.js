// Loop agéntico con Gemini: el modelo decide qué herramientas usar; las ejecutamos y devolvemos
// los resultados hasta que responde. Cada paso queda registrado para mostrarlo en la interfaz.
import { AGENTES, promptSistema } from "./agentes.js";
import { crearHerramientas } from "./herramientas.js";
import { bloqueo, generar, hoyMonterrey, textoDe } from "./comun.js";

const MAX_VUELTAS = 12;
// El rol lector solo consulta: sus agentes no crean tareas, propuestas ni notas.
const SOLO_ESCRITURA = new Set(["crear_tarea", "proponer_cambio", "recordar", "solicitar_vacaciones", "calcular_prenomina", "crear_borrador_encuesta"]);
const MAX_RESULTADO = 14000;

async function memoriaFija(db) {
  const snap = await db.collection("memoria").orderBy("creada", "desc").limit(25).get();
  if (snap.empty) return "Memoria de contexto: vacía por ahora.";
  const lineas = snap.docs.map((d) => {
    const n = d.data();
    return `- [${n.tema}${n.entidad ? ` · ${n.entidad}` : ""}] ${n.texto}`;
  });
  return `Memoria de contexto (lo más reciente; busca más con buscar_memoria):\n${lineas.join("\n")}`;
}

function paraModelo(datos) {
  const s = JSON.stringify(datos);
  if (s.length <= MAX_RESULTADO) return datos;
  return { recortado: true, nota: "Resultado largo; pide un filtro o un límite menor.", inicio: s.slice(0, MAX_RESULTADO) };
}

/**
 * @param {object} p
 * @param {import('@google/genai').GoogleGenAI} p.cliente
 * @param {import('firebase-admin/firestore').Firestore} p.db
 * @param {string} p.agenteId
 * @param {{rol: string, texto: string}[]} p.historial  turnos previos (solo texto)
 * @param {string} p.mensaje
 * @param {{rol: 'admin'|'rh', autor: string}} p.ctx
 */
export async function correrAgente({ cliente, db, agenteId, historial = [], mensaje, ctx }) {
  const agente = AGENTES[agenteId];
  if (!agente) throw new Error(`Agente desconocido: ${agenteId}`);
  const { definiciones, ejecutar } = crearHerramientas(db, { ...ctx, agente: agenteId });
  const tools = [{
    functionDeclarations: definiciones
      .filter((d) => agente.herramientas.includes(d.name))
      .filter((d) => ctx.rol !== "lector" || !SOLO_ESCRITURA.has(d.name))
      .map((d) => ({ name: d.name, description: d.description, parametersJsonSchema: d.input_schema })),
  }];

  const system = `${promptSistema(agenteId)}\n\nHoy es ${hoyMonterrey()}. Usuario: ${ctx.autor} (rol ${ctx.rol}).\n\n${await memoriaFija(db)}`;

  const contents = [
    ...historial.slice(-16).map((t) => ({ role: t.rol === "usuario" ? "user" : "model", parts: [{ text: t.texto }] })),
    { role: "user", parts: [{ text: mensaje }] },
  ];

  const pasos = [];
  const uso = { entrada: 0, salida: 0 };

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const r = await generar(cliente, { db, system, contents, tools, pensamiento: "MEDIUM" });
    uso.entrada += r.uso.entrada;
    uso.salida += r.uso.salida;

    const motivo = bloqueo(r);
    if (motivo) return { respuesta: `No puedo responder esa solicitud (${motivo}). Si es una consulta de RH, intenta reformularla.`, pasos, uso };

    const llamadas = r.functionCalls ?? [];
    if (!llamadas.length) {
      const texto = textoDe(r) || "(sin respuesta)";
      const cortada = r.candidates?.[0]?.finishReason === "MAX_TOKENS";
      return { respuesta: cortada ? `${texto}\n\n_(La respuesta se cortó por longitud.)_` : texto, pasos, uso };
    }

    // Se conserva el contenido completo del modelo (incluye las firmas de pensamiento).
    contents.push(r.candidates[0].content);
    const respuestas = await Promise.all(
      llamadas.map(async (c) => {
        try {
          const { datos, resumen } = await ejecutar(c.name, c.args);
          pasos.push({ herramienta: c.name, entrada: c.args ?? {}, resumen });
          return { functionResponse: { id: c.id, name: c.name, response: { resultado: paraModelo(datos) } } };
        } catch (e) {
          pasos.push({ herramienta: c.name, entrada: c.args ?? {}, resumen: `Error: ${e.message}`, error: true });
          return { functionResponse: { id: c.id, name: c.name, response: { error: e.message } } };
        }
      }),
    );
    contents.push({ role: "user", parts: respuestas });
  }
  return { respuesta: "Llegué al límite de pasos para esta pregunta. Intenta dividirla en partes más concretas.", pasos, uso };
}
