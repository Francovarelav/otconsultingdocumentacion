// Utilidades compartidas por funciones, rutina, lector de CVs y servidor MCP.
import { GoogleGenAI } from "@google/genai";
import { FieldValue } from "firebase-admin/firestore";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

// Gemini Flash en Vertex AI: rápido y económico, bueno con herramientas. Se cambia con OTC_MODELO.
export const MODELO = process.env.OTC_MODELO || "gemini-3.8-flash";
export const PROYECTO = process.env.GCLOUD_PROJECT || process.env.OTC_PROYECTO || "otc-rh-agentes";

// ------------------------------------------------------------------ tope de gasto
// Tarifa conservadora (la más alta publicada para Gemini 3.8 Flash en Vertex): USD por 1M tokens.
// El pensamiento se cobra como salida. Todo editable en config/gasto.
export const TARIFA_DEF = { entrada_usd_m: 1.5, salida_usd_m: 7.5, tipo_cambio: 20, limite_mxn: 200 };

export class LimiteGasto extends Error {
  constructor(g, pausa = false) {
    super(pausa
      ? "La IA está en pausa por decisión del admin. Los datos, tareas y aprobaciones siguen funcionando."
      : `Se alcanzó el límite mensual de IA (${g.limite_mxn} MXN). Pide a un admin que lo revise.`);
    this.codigo = "limite-gasto";
  }
}

const mesActual = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Monterrey", year: "numeric", month: "2-digit" }).format(new Date());

export async function revisarGasto(db) {
  const snap = await db.collection("config").doc("gasto").get();
  const g = { ...TARIFA_DEF, ...(snap.data() ?? {}) };
  if (g.pausado === true) throw new LimiteGasto(g, true);
  if (g.mes === mesActual() && (g.gastado_mxn ?? 0) >= g.limite_mxn) throw new LimiteGasto(g);
  return g;
}

export async function registrarGasto(db, uso) {
  const ref = db.collection("config").doc("gasto");
  const mes = mesActual();
  await db.runTransaction(async (tx) => {
    const g = { ...TARIFA_DEF, ...((await tx.get(ref)).data() ?? {}) };
    const costo = ((uso.entrada * g.entrada_usd_m + uso.salida * g.salida_usd_m) / 1e6) * g.tipo_cambio;
    const base = g.mes === mes ? g : { ...g, mes, gastado_mxn: 0, llamadas: 0, tokens_entrada: 0, tokens_salida: 0 };
    tx.set(ref, {
      ...base,
      gastado_mxn: Math.round(((base.gastado_mxn ?? 0) + costo) * 10000) / 10000,
      llamadas: (base.llamadas ?? 0) + 1,
      tokens_entrada: (base.tokens_entrada ?? 0) + uso.entrada,
      tokens_salida: (base.tokens_salida ?? 0) + uso.salida,
      modelo: MODELO,
      actualizado: FieldValue.serverTimestamp(),
    });
  });
}

// ------------------------------------------------------------------ cliente Vertex AI
let _cliente = null;
/**
 * En la nube usa la cuenta de servicio de la función. En local (emulador / MCP) usa la sesión de
 * gcloud con la copia de google-auth-library que trae @google/genai.
 */
export function clienteIA({ local = false } = {}) {
  if (_cliente) return _cliente;
  const opciones = { vertexai: true, project: PROYECTO, location: "global" };
  if (local) {
    const requerir = createRequire(import.meta.url);
    const { OAuth2Client } = requerir(requerir.resolve("google-auth-library", { paths: [requerir.resolve("@google/genai").replace(/dist.*$/, "")] }));
    const auth = new OAuth2Client();
    auth.refreshHandler = async () => ({
      access_token: execFileSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8" }).trim(),
      expiry_date: Date.now() + 45 * 60 * 1000,
    });
    opciones.googleAuthOptions = { authClient: auth };
  }
  _cliente = new GoogleGenAI(opciones);
  return _cliente;
}

/**
 * Una llamada a Gemini con tope de gasto: revisa el presupuesto antes y registra el costo después.
 * `pensamiento`: MINIMAL | LOW | MEDIUM | HIGH.
 */
export async function generar(cliente, { db, system, contents, tools, pensamiento = "LOW", esquema, maxTokens = 8192 }) {
  if (db) await revisarGasto(db);
  const r = await cliente.models.generateContent({
    model: MODELO,
    contents,
    config: {
      systemInstruction: system,
      tools,
      thinkingConfig: { thinkingLevel: pensamiento },
      maxOutputTokens: maxTokens,
      ...(esquema ? { responseMimeType: "application/json", responseJsonSchema: esquema } : {}),
    },
  });
  const u = r.usageMetadata ?? {};
  r.uso = { entrada: u.promptTokenCount ?? 0, salida: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) };
  if (db) await registrarGasto(db, r.uso).catch((e) => console.error("registrarGasto", e));
  return r;
}

export function textoDe(r) {
  return (r.text ?? "").trim();
}

/** Motivo de bloqueo o corte, si lo hay. */
export function bloqueo(r) {
  if (r.promptFeedback?.blockReason) return r.promptFeedback.blockReason;
  const f = r.candidates?.[0]?.finishReason;
  return f && !["STOP", "MAX_TOKENS", "FINISH_REASON_UNSPECIFIED"].includes(f) ? f : null;
}

// Caché en memoria de colecciones pequeñas (la instancia de Cloud Functions se reutiliza).
const cache = new Map();
const TTL_MS = 3 * 60 * 1000;

export async function coleccion(db, nombre, { fresco = false } = {}) {
  const hit = cache.get(nombre);
  if (!fresco && hit && Date.now() - hit.t < TTL_MS) return hit.datos;
  const snap = await db.collection(nombre).get();
  const datos = snap.docs.map((d) => ({ _id: d.id, ...d.data() }));
  cache.set(nombre, { t: Date.now(), datos });
  return datos;
}

export function invalidar(nombre) {
  if (nombre) cache.delete(nombre);
  else cache.clear();
}

export function hoyMonterrey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Monterrey" }).format(new Date());
}

export function serializar(valor) {
  // Timestamps de Firestore → ISO; recorta strings enormes.
  return JSON.parse(
    JSON.stringify(valor, (_k, v) => {
      if (v && typeof v === "object" && typeof v.toDate === "function") return v.toDate().toISOString();
      if (v && typeof v === "object" && "_seconds" in v && "_nanoseconds" in v)
        return new Date(v._seconds * 1000).toISOString();
      return v;
    }),
  );
}

export function recortar(obj, max = 14000) {
  const s = JSON.stringify(obj);
  if (s.length <= max) return s;
  return s.slice(0, max) + `… [recortado: ${s.length - max} caracteres más; pide un filtro o un límite menor]`;
}
