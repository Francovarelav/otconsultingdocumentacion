# Sistema agéntico de RH — OT Consulting (Etapa 4)

## Intención
RH de OT Consulting no puede responder con datos por qué se va la gente, cuánta plantilla genera
ingreso ni si tiene el talento para los proyectos. El pipeline de la Etapa 3 dejó los datos limpios
(9 tablas, 20 reglas, M1–M14). Este sistema pone **agentes de IA a hacer el trabajo repetitivo**
sobre ese modelo: detectar lo que falta, proponer correcciones, leer CVs contra la matriz de
habilidades y recordar el contexto, siguiendo **SOPs** escritos a partir de las 20 reglas.

Público: RH de OT (socio formador) y los evaluadores del reto.

## Metas
- Agentes con herramientas sobre los datos reales (Firestore) que consultan, explican y proponen.
- Rutina diaria automática que convierte las reglas de negocio en una **bandeja de tareas**.
- Lector de CVs: PDF → perfil estructurado mapeado al catálogo de 71 habilidades → a quién cubre
  (riesgo de persona clave, banca, proyectos).
- Memoria de contexto persistente (hechos, decisiones, preferencias) que los agentes leen y escriben.
- SOPs versionados que los agentes siguen paso a paso.
- Servidor MCP con las mismas herramientas para operar el sistema desde Claude Code / Desktop.
- Interfaz clara estilo «Forma» con la marca de OT Consulting.

## No-metas
- No reemplaza el sistema de nómina ni el ERP. No manda correos ni contacta candidatos.
- No calcula indicadores nuevos en la nube: los indicadores vienen de las vistas `v_*` del pipeline.

## Anti-metas (sería un fracaso aunque funcione)
- Un agente que **escribe datos sin aprobación humana**, inventa una causa de baja o imputa un sueldo
  (regla 3, M11).
- Unir por nombre en vez de por ID (regla 1).
- Datos del socio formador expuestos sin login.

## Enfoques considerados
1. **Firebase + Claude, loop de herramientas propio en Cloud Functions (elegido).** Las herramientas
   leen Firestore directo, cada paso del agente se guarda y se muestra, la aprobación humana vive en
   el código. Mismas herramientas reusadas por el servidor MCP.
2. Firebase + Gemini (Genkit): todo dentro de Google, más flojo en agentes con muchas herramientas y en
   seguir SOPs al pie de la letra.
3. Claude Managed Agents: Anthropic hospeda el loop; descartado porque todas las herramientas son
   consultas a nuestro Firestore (habría que devolverlas como herramientas propias de todos modos) y
   el reto pide un proyecto en Firebase.

Franco eligió el 1.

## Arquitectura

```
agentes/
├── firebase.json · .firebaserc · firestore.rules · storage.rules · firestore.indexes.json
├── functions/            Node 20 (ESM) · Cloud Functions v2 · @anthropic-ai/sdk
│   ├── index.js          callables + rutina programada
│   └── src/ herramientas.js · agentes.js · loop.js · rutina.js · cv.js · comun.js
├── mcp/servidor.js       MCP stdio; importa functions/src/herramientas.js
├── scripts/cargar_firestore.py   otc_rh.db → Firestore (+ SOPs semilla)
└── web/                  React + Vite + Tailwind · Firebase Auth/Firestore/Storage/Functions
```

Proyecto Firebase: `otc-rh-agentes` (Blaze). Firestore `nam5`. Modelo: `claude-opus-5-5`, pensamiento
adaptativo, `effort` medium en chat y low en la rutina, respaldo `fallbacks: "default"`.
Llave en Secret Manager (`ANTHROPIC_API_KEY`).

### Seguridad
- Login con correo y contraseña; solo entran usuarios con documento en `usuarios/{uid}` (`rol`: `admin` | `rh`).
- El cliente **solo lee**. Toda escritura pasa por funciones (Admin SDK).
- Sueldos y costos individuales en `colaboradores_privado/{id}`: solo `admin`.

## Modelo de datos en Firestore (llaves = IDs del pipeline, regla 1)

| Colección | ID del doc | Origen |
|---|---|---|
| `colaboradores` | `id_colaborador` | `colaborador_acondicionado` sin campos de sueldo |
| `colaboradores_privado` | `id_colaborador` | sueldos, `costo_mensual`, `costo_hora`, `inversion_equipo` |
| `asignaciones` | `id_asignacion` | `asignacion_acondicionada` |
| `proyectos` / `clientes` / `departamentos` | IDs | tablas acondicionadas |
| `activos` | `cod_activo` | `activo_acondicionado` |
| `habilidades` | `cod_habilidad` | `habilidad_acondicionada` |
| `matriz` | `{id_colaborador}__{cod_habilidad}` | `matriz_habilidad_long` |
| `catalogos` | nombre del catálogo | `cat_*` → `{valores:[…]}` |
| `indicadores` | nombre de vista `v_*` | `{filas:[…], columnas:[…], total}` |
| `calidad_datos` | `{tabla}__{columna}` | tabla `calidad_datos` |
| `log_correcciones` | `id_correccion` | pipeline + aprobaciones (método `M15`) |
| `tareas` | determinista `{tipo}__{id}` | rutina / agentes |
| `propuestas` | auto | agentes |
| `memoria` | auto | agentes / usuarios |
| `sops` | `SOP-01…` | semilla, editable por admin |
| `conversaciones` | auto | chat |
| `cvs` | auto | lector de CVs |
| `rutinas` | `YYYY-MM-DD` | rutina diaria (resumen) |
| `usuarios` | uid | alta manual |

`tareas`: `{tipo, titulo, detalle, regla, prioridad: alta|media|baja, estado: abierta|hecha|descartada,
id_colaborador?, id_ref?, origen: rutina|agente, creada, actualizada}`.
`propuestas`: `{coleccion, id_doc, campo, valor_actual, valor_propuesto, motivo, agente, estado:
pendiente|aprobada|rechazada, creada, resuelta_por?, resuelta?}`.
`memoria`: `{texto, tema, entidad?, autor, fuente: agente|usuario, creada}`.
`sops`: `{titulo, objetivo, disparador, pasos:[str], reglas:[int], agente, version, actualizada}`.
`conversaciones`: `{agente, uid, titulo, mensajes:[{rol: usuario|agente, texto, pasos?:[{herramienta, entrada, resumen}]}], actualizada}`.
`cvs`: `{archivo, ruta, estado: procesando|listo|error, perfil:{nombre, puesto_objetivo, anios_experiencia,
resumen, habilidades:[{cod_habilidad?, nombre, nivel_estimado 1–4, evidencia}], certificaciones:[{nombre, emisor, fecha_obtencion?, fecha_vencimiento?}]},
cobertura:[{cod_habilidad, habilidad, expertos_actuales, riesgo_persona_clave}], recomendacion, creada}`.

## Agentes (personas)
| id | Nombre | Enfoque | SOPs |
|---|---|---|---|
| `asistente` | Asistente RH | general, todas las herramientas | todos |
| `rotacion` | Analista de rotación | bajas, causa, permanencia, costo | SOP-01 |
| `staffing` | Staffing | banca, asignaciones, habilidades, proyectos | SOP-03, SOP-04 |
| `reclutador` | Reclutador (CVs) | CVs contra la matriz | SOP-05 |
| `auditor` | Auditor de datos | calidad, propuestas de corrección | SOP-06, SOP-07 |

Reglas fijas en todos los prompts: responder en español de México; citar sobre cuántos registros
confiables se calculó; nunca inventar dato faltante (nulo + bandera); nunca escribir datos: usar
`proponer_cambio`; guardar con `recordar` hechos durables que diga el usuario.

## Herramientas (compartidas por funciones y MCP)
`consultar_indicador`, `buscar_colaboradores`, `ver_colaborador`, `buscar_por_habilidad`,
`ver_proyectos`, `listar_tareas`, `crear_tarea`, `proponer_cambio` (valida colección/campo permitidos
y valor contra catálogo), `recordar`, `buscar_memoria`, `listar_sops`, `leer_sop`, `ver_cvs`,
`calidad_datos`. Costos individuales solo si el rol es `admin`.

## Rutina diaria (trabajo repetitivo)
Programada 07:00 America/Monterrey y ejecutable a mano. Detectores deterministas → tareas con ID
determinista (no duplica, no reabre descartadas):
baja sin causa (r6) · baja sin fecha (r6) · asignación que vence ≤ 60 días (r12) · activo en banca
(r14) · equipo por recuperar (r18) · activo sin puesto/departamento/sueldo (r5) · sobreasignado (r11)
· activo sin matriz o evaluación sin fecha (r19) · expediente incompleto (r9).
Después Claude redacta el resumen del día en `rutinas/{fecha}`.

## Flujo de aprobación
Agente → `propuestas` (pendiente) → RH aprueba en la UI → función escribe el campo y agrega
`log_correcciones` con método `M15 — Agente IA (aprobado por …)`. Rechazar solo cambia el estado.

## Interfaz (referencia: Forma)
Barra lateral clara con logo de OT, búsqueda, Inicio · Colaboradores · Indicadores · Bandeja ·
Aprobaciones; sección «Agentes IA» (5 agentes); sección «Conocimiento» (SOPs, Memoria, Lector de CVs).
Inicio: saludo, tarjetas «Ayúdame a…», resumen de la rutina, KPIs, tareas recientes. Chat con pasos
del agente plegables. Rayado = dato faltante o estimado (convención del tablero).

## Llamadas del cliente (Firebase callable, región us-central1)
- `chatAgente({agente, conversacionId?, mensaje})` → `{conversacionId, respuesta, pasos}`
- `leerCv({ruta, archivo})` → `{id}` (PDF ya subido a Storage `cvs/{uid}/…`)
- `resolverPropuesta({id, decision: "aprobar"|"rechazar"})`
- `actualizarTarea({id, estado})`
- `ejecutarRutina()` → `{creadas, total, resumen}`
- `guardarSop({id, …campos})` (admin) · `guardarMemoria({texto, tema, entidad?})` · `borrarMemoria({id})`

## Lo que queda al constructor
Diseño visual fino, textos de la UI, orden de columnas, umbrales de prioridad de tareas.

---

# Ampliación (24-nov): módulos operativos de RH

Pedido de Franco: asistencia (clock in/out), vacaciones, ficha de cada colaborador, control de nómina,
acciones por agentes y analítica. Principio: **no se inventan datos**; la exportación no trae historial
de asistencia ni vacaciones, así que esos módulos arrancan vacíos y se llenan con el uso.

## Roles (actualizado)
`admin` (todo) · `rh` (opera) · `lector` (consulta) · **`colaborador`** (autoservicio: solo lo suyo).
`usuarios/{uid}` agrega `id_colaborador` (obligatorio para rol colaborador).

## Colecciones nuevas
| Colección | ID | Campos |
|---|---|---|
| `config/jornada` | doc | `hora_entrada:"09:00"`, `hora_salida:"18:00"`, `tolerancia_min:10`, `dias_laborales:[1,2,3,4,5]` (1=lunes), `horas_jornada:8`, `zona:"America/Monterrey"` |
| `asistencia` | `{id_colaborador}__{AAAA-MM-DD}` | `id_colaborador, nombre, fecha, entrada (Timestamp), salida (Timestamp\|null), hora_entrada:"HH:MM", hora_salida:"HH:MM"\|null, retardo_min, minutos_trabajados\|null, estado: abierta\|cerrada, origen: portal\|rh, registrado_por, nota` |
| `vacaciones` | auto | `id_colaborador, nombre, tipo: vacaciones\|permiso_con_goce\|permiso_sin_goce\|incapacidad, inicio, fin (AAAA-MM-DD), dias_habiles, motivo, estado: pendiente\|aprobada\|rechazada\|cancelada, solicitada_por, resuelta_por, creada, resuelta` |
| `nomina_periodos` | `AAAA-MM-Q1\|Q2` | `periodo, inicio, fin, estado: calculado\|cerrado, totales:{colaboradores, con_sueldo, percepciones, deducciones, neto, costo_empresa, faltas, dias_vacaciones}, calculado_por, calculado, cerrado_por` |
| `nomina_periodos/{p}/recibos` | `id_colaborador` | `id_colaborador, nombre, esquema_nomina, sueldo_mensual, salario_diario, dias_periodo, dias_laborables, faltas, retardos, dias_vacaciones, dias_permiso_con_goce, dias_sin_goce, dias_incapacidad, percepciones:{sueldo, prima_vacacional}, deducciones:{faltas, sin_goce, incapacidad}, neto_estimado, costo_empresa, banderas:[...]` |

Reglas de cálculo (prenómina de control; no timbra CFDI ni recalcula ISR/IMSS):
- Sueldo mensual = `sueldo_neto_total`; costo empresa = `sueldo_total_integrado` prorrateado. Sin sueldo → recibo con bandera `falta_sueldo`, sin montos (regla 3).
- Salario diario = sueldo mensual / 30. Quincena = 15 días de sueldo.
- Falta = día laboral del periodo, sin checada, sin vacaciones/permiso/incapacidad aprobados, no festivo, ≥ fecha de ingreso y ≤ hoy. **Solo cuenta desde que se activó la asistencia** (`config/jornada.inicio_registro`), para no marcar faltas inventadas del pasado.
- Vacaciones: LFT art. 76 (12,14,16,18,20; 22 a 6–10 años; +2 cada 5). Prima vacacional 25 % (art. 80). Festivos art. 74.

## Callables nuevos
- `checar({tipo:'entrada'|'salida', id_colaborador?, nota?})` — colaborador para sí; admin/rh para cualquiera.
- `solicitarVacaciones({id_colaborador?, tipo, inicio, fin, motivo})` → `{id, dias_habiles}`
- `resolverVacaciones({id, decision:'aprobar'|'rechazar'|'cancelar'})` — admin/rh (el colaborador solo cancela las suyas pendientes).
- `saldoVacaciones({id_colaborador})` → `{antiguedad_anios, aniversario, derecho, tomados, pendientes, disponibles, periodo_inicio, periodo_fin}`
- `calcularPrenomina({periodo})` (admin) → `{periodo, totales}` · `cerrarPeriodo({periodo})` (admin)
- `guardarJornada({...config})` (admin)
- `guardarUsuario` acepta `rol:'colaborador'` + `id_colaborador`.

## Agente nuevo
`nomina` — «Nómina y asistencia»: herramientas `ver_asistencia`, `resumen_asistencia`, `saldo_vacaciones`,
`solicitar_vacaciones` (queda pendiente para RH), `ver_prenomina`, `calcular_prenomina` (solo admin).

## Rutina diaria (nuevos detectores)
Falta sin justificar ayer · salida sin registrar ayer · solicitud de vacaciones pendiente > 2 días ·
vacaciones por vencer (saldo del periodo anterior, LFT art. 81: 6 meses tras el aniversario).

## Encuestas, formularios públicos y cultura
| Colección | ID | Campos |
|---|---|---|
| `encuestas` | auto | `titulo, descripcion, tipo: enps\|clima\|pulso\|salida\|formulario, anonima:bool, publica:bool, preguntas:[{id, tipo: escala\|nps\|opcion\|multiple\|texto\|si_no, texto, opciones?:[str], requerida:bool, min?:1, max?:5}], estado: borrador\|abierta\|cerrada, cierra?:AAAA-MM-DD, creada_por, creada, total_respuestas` |
| `encuestas/{id}/respuestas` | auto | **no legible desde el cliente** (anonimato): `respuestas:{[pid]: valor}, id_colaborador\|null, creada` |
| `encuestas_resultados` | id de encuesta | `total, actualizado, por_pregunta:{[pid]: {tipo, texto, n, promedio?, distribucion?:{valor:n}, nps?:{promotores,pasivos,detractores,score}, textos?:[str] (máx 200, solo si anonima o rol admin/rh)}}, analisis?:{resumen, temas:[{tema, menciones, sentimiento}], acciones:[str], generado}` (admin/rh) |
| `reconocimientos` | auto | `de_uid, de_nombre, para_id_colaborador, para_nombre, valor, mensaje, creada` |
| `comunicados` | auto | `titulo, cuerpo (markdown), autor, fijado:bool, creada` |
| `config/cultura` | doc | `mision, vision, valores:[{nombre, descripcion}]` |

Plantillas sembradas: eNPS (1 nps + 1 texto), Clima laboral (12 escala 1–5 + texto), Pulso semanal (3), **Encuesta de salida** (pregunta `causa` tipo opción con el catálogo CB01–CB10 + escala + texto; al responder con `id_colaborador` se crea una **propuesta** `colaboradores.id_causa_baja` para RH — nunca escribe directo).

Callables:
- **Públicos** (sin login, protegidos por App Check): `obtenerFormulario({id})` → encuesta abierta y pública sin datos internos; `responderEncuesta({id, respuestas, id_colaborador?})`. Valida tipos y requeridas; recalcula `encuestas_resultados`.
- `guardarEncuesta({id?, ...})` · `cambiarEstadoEncuesta({id, estado})` · `analizarEncuesta({id})` (IA: temas y acciones de los textos) — admin/rh.
- `crearReconocimiento({para_id_colaborador, valor, mensaje})` — cualquier rol con sesión.
- `publicarComunicado({id?, titulo, cuerpo, fijado})` · `guardarCultura({...})` — admin/rh.
Ruta pública: `/f/:id` (formulario sin login, marca OT, confirmación al enviar).

Agente nuevo `cultura` — «Clima y cultura»: `listar_encuestas`, `resultados_encuesta`, `crear_borrador_encuesta` (queda en borrador para revisión), `ver_reconocimientos`.
