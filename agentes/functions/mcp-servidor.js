#!/usr/bin/env node
// Servidor MCP (stdio) del sistema de RH de OT Consulting.
// Expone las MISMAS herramientas que usan los agentes en Cloud Functions, más la rutina diaria,
// para operar el sistema desde Claude Code o Claude Desktop.
// Credenciales: Application Default Credentials de Google (gcloud auth application-default login)
// con acceso al proyecto otc-rh-agentes. Rol por defecto: admin (operador local); OTC_ROL=rh lo limita.
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { crearHerramientas } from "./src/herramientas.js";
import { firestoreGcloud, hayGcloud } from "./src/local.js";
import { ejecutarRutina } from "./src/rutina.js";
import { clienteIA, recortar } from "./src/comun.js";

const PROYECTO = process.env.OTC_PROYECTO || "otc-rh-agentes";
process.env.GOOGLE_CLOUD_QUOTA_PROJECT = PROYECTO;

// Credencial: la sesión de gcloud del operador (no requiere llaves de cuenta de servicio, que la
// organización bloquea). Con OTC_CRED=adc, o sin gcloud, usa Application Default Credentials.
let db;
if (process.env.OTC_CRED !== "adc" && hayGcloud()) {
  db = firestoreGcloud(PROYECTO);
} else {
  initializeApp({ credential: applicationDefault(), projectId: PROYECTO });
  db = getFirestore();
}

const ctx = { rol: process.env.OTC_ROL === "rh" ? "rh" : "admin", autor: process.env.OTC_AUTOR || "MCP (Claude)", agente: "mcp" };
const { definiciones, ejecutar } = crearHerramientas(db, ctx);

const EXTRA = [
  {
    name: "ejecutar_rutina",
    description:
      "Corre la rutina diaria (SOP-08): recorre las reglas de negocio, crea/actualiza la bandeja de tareas sin duplicar y cierra lo ya corregido. Además Gemini (Vertex AI) redacta el resumen del día, dentro del tope de gasto.",
    inputSchema: { type: "object", properties: {} },
  },
];

const server = new Server(
  { name: "otc-rh", version: "1.0.0" },
  {
    capabilities: { tools: {} },
    instructions:
      "Sistema de RH de OT Consulting (datos acondicionados, corte 2026-11-20). Une siempre por ID, nunca por nombre. " +
      "No imputes datos faltantes: crea tareas de captura. Las correcciones se proponen con proponer_cambio y RH las aprueba en la app. " +
      "Lee el SOP que corresponda (listar_sops / leer_sop) antes de un proceso. Responde en español de México.",
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    ...definiciones.map((d) => ({ name: d.name, description: d.description, inputSchema: d.input_schema })),
    ...EXTRA,
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    if (name === "ejecutar_rutina") {
      const cliente = clienteIA({ local: true });
      const r = await ejecutarRutina({ db, cliente, origen: "mcp" });
      return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
    }
    const { datos, resumen } = await ejecutar(name, args ?? {});
    return { content: [{ type: "text", text: `${resumen}\n${recortar(datos, 60000)}` }] };
  } catch (e) {
    return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
  }
});

await server.connect(new StdioServerTransport());
