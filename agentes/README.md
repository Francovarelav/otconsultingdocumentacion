# Sistema agéntico de RH · OT Consulting (Etapa 4)

Firebase `otc-rh-agentes` (plan Blaze) · Gemini 3.8 Flash en Vertex AI con tope de **$200 MXN/mes** ·
App Check (reCAPTCHA Enterprise) · roles `admin`, `rh`, `lector`, `colaborador`.
Diseño y contrato completo: `docs/superpowers/specs/2026-11-24-sistema-agentico-rh-design.md`.

## Qué hay
- **7 agentes** con 26 herramientas sobre los datos acondicionados: Asistente RH, Rotación, Staffing, Reclutador (CVs),
  Nómina y asistencia, Clima y cultura, Auditor. Ninguno escribe datos: proponen y RH aprueba (`log_correcciones`, M15).
- **Rutina diaria** 07:00 (Monterrey): convierte las 20 reglas en tareas sin duplicar y cierra lo corregido.
- **Operación**: asistencia (clock in/out), vacaciones LFT 2023, prenómina quincenal de control (no timbra CFDI).
- **Personas**: encuestas (eNPS, clima, pulso, salida) con formularios públicos `/f/:id`, cultura y reconocimientos.
- **Conocimiento**: 11 SOPs, memoria de contexto, lector de CVs.
- **MCP** `otc-rh` (`.mcp.json` en la raíz): las mismas herramientas desde Claude Code / Desktop.

## Correr local
```bash
cd agentes && firebase emulators:start --only functions     # funciones en 127.0.0.1:5001 (usa tu sesión de gcloud)
cd agentes/web && npm run dev -- --port 5180                 # app en http://localhost:5180
```
Firestore, Auth y Storage son los de producción. Requiere `gcloud auth login` con acceso al proyecto.

## Recargar datos del pipeline
```bash
.venv/bin/python src/acondicionamiento_rh.py && .venv/bin/python agentes/scripts/cargar_firestore.py
```

## Publicar
```bash
cd agentes && firebase deploy --only functions,hosting,firestore,storage
```
Las funciones necesitan invocación pública (`allUsers`); la política de la organización varelta.com
(`iam.allowedPolicyMemberDomains`) la bloquea hasta que se haga una excepción para este proyecto.

## Costo
`config/gasto` lleva el gasto del mes con tarifa conservadora (US$1.50 / US$7.50 por millón, TC 20).
Al llegar a `limite_mxn` (200) las funciones de IA responden «límite alcanzado». Además hay un presupuesto
de Google Cloud de 200 MXN con alertas al 50/90/100 %.
