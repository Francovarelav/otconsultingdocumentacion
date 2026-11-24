// Lector de CVs (SOP-05): PDF → perfil estructurado mapeado al catálogo de 71 habilidades → cobertura.
import { FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { bloqueo, coleccion, generar } from "./comun.js";

const nul = (t) => ({ type: [t, "null"] });

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["nombre", "puesto_objetivo", "anios_experiencia", "resumen", "ubicacion", "idiomas", "habilidades", "certificaciones", "experiencia"],
  properties: {
    nombre: nul("string"),
    puesto_objetivo: nul("string"),
    anios_experiencia: nul("number"),
    resumen: { type: "string", description: "2–3 líneas del perfil profesional" },
    ubicacion: nul("string"),
    idiomas: { type: "array", items: { type: "string" } },
    habilidades: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["cod_habilidad", "nombre", "nivel_estimado", "evidencia"],
        properties: {
          cod_habilidad: { ...nul("string"), description: "Código del catálogo si coincide; null si no existe en el catálogo" },
          nombre: { type: "string" },
          nivel_estimado: { type: "integer", enum: [1, 2, 3, 4], description: "1 Básico, 2 Intermedio, 3 Avanzado, 4 Experto" },
          evidencia: { type: "string", description: "Qué dice el CV que lo sustenta" },
        },
      },
    },
    certificaciones: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["nombre", "emisor", "fecha_obtencion", "fecha_vencimiento"],
        properties: { nombre: { type: "string" }, emisor: nul("string"), fecha_obtencion: nul("string"), fecha_vencimiento: nul("string") },
      },
    },
    experiencia: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["empresa", "puesto", "periodo", "logros"],
        properties: { empresa: nul("string"), puesto: nul("string"), periodo: nul("string"), logros: { type: "string" } },
      },
    },
  },
};

export async function procesarCv({ db, cliente, cvId, ruta, bucket }) {
  const ref = db.collection("cvs").doc(cvId);
  try {
    const [buf] = await (bucket ?? getStorage().bucket()).file(ruta).download();
    const habs = await coleccion(db, "habilidades");
    const catalogo = habs.map((h) => `${h.cod_habilidad} | ${h.tecnologia ?? ""} | ${h.tipo ?? ""} | ${h.descripcion ?? h.habilidad}`).join("\n");

    const r = await generar(cliente, {
      db,
      pensamiento: "MEDIUM",
      esquema: ESQUEMA,
      system:
        "Eres el Reclutador del sistema de RH de OT Consulting (consultora Oracle EBS / Oracle Cloud / NetSuite / IA). " +
        "Extraes del CV solo lo que dice; si un dato no aparece, va null. No incluyas teléfono, correo, domicilio, RFC, CURP ni NSS. " +
        "Mapea cada habilidad al catálogo por código; EBS y Cloud son habilidades distintas aunque se llamen igual. " +
        "Estima el nivel 1–4 solo con evidencia (años, proyectos, certificaciones). Responde en español.",
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType: "application/pdf", data: buf.toString("base64") } },
          { text: `Catálogo de habilidades (código | tecnología | tipo | descripción):\n${catalogo}\n\nExtrae el perfil del CV.` },
        ],
      }],
    });
    const motivo = bloqueo(r);
    if (motivo) throw new Error(`El modelo no procesó el documento (${motivo})`);
    const perfil = JSON.parse(r.text);

    // Cobertura contra la plantilla activa
    const [mat, cols] = await Promise.all([coleccion(db, "matriz"), coleccion(db, "colaboradores")]);
    const activos = new Set(cols.filter((c) => c.estatus === "Activo" && c.es_plantilla !== 0).map((c) => c.id_colaborador));
    const enBanca = new Set(cols.filter((c) => c.en_banca === 1).map((c) => c.id_colaborador));
    const habPorCod = Object.fromEntries(habs.map((h) => [h.cod_habilidad, h]));
    const cobertura = perfil.habilidades
      .filter((h) => h.cod_habilidad && habPorCod[h.cod_habilidad])
      .map((h) => {
        const expertos = mat.filter((m) => m.cod_habilidad === h.cod_habilidad && m.nivel_num >= 3 && activos.has(m.id_colaborador));
        return {
          cod_habilidad: h.cod_habilidad,
          habilidad: habPorCod[h.cod_habilidad].descripcion ?? habPorCod[h.cod_habilidad].habilidad,
          tecnologia: habPorCod[h.cod_habilidad].tecnologia ?? null,
          nivel_candidato: h.nivel_estimado,
          expertos_actuales: expertos.length,
          expertos_en_banca: expertos.filter((m) => enBanca.has(m.id_colaborador)).length,
          riesgo_persona_clave: expertos.length <= 1,
        };
      })
      .sort((a, b) => a.expertos_actuales - b.expertos_actuales);

    const huecos = cobertura.filter((c) => c.riesgo_persona_clave && c.nivel_candidato >= 3);
    const cubiertasPorBanca = cobertura.filter((c) => c.expertos_en_banca > 0);
    const recomendacion = huecos.length
      ? `Entrevistar: cubre ${huecos.length} habilidad(es) con ≤ 1 experto activo (${huecos.slice(0, 3).map((h) => h.habilidad).join(", ")}).`
      : cubiertasPorBanca.length >= Math.max(1, cobertura.length / 2)
        ? "Guardar en cartera: la mayoría de sus habilidades ya están cubiertas por gente en banca."
        : "Guardar en cartera: no cubre huecos de persona clave hoy; revisar contra los proyectos que vienen.";

    await ref.set({ estado: "listo", perfil, cobertura, recomendacion, procesado: FieldValue.serverTimestamp() }, { merge: true });
    return { perfil, cobertura, recomendacion };
  } catch (e) {
    await ref.set({ estado: "error", error: e.message, procesado: FieldValue.serverTimestamp() }, { merge: true });
    throw e;
  }
}
