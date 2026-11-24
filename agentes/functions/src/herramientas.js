// Herramientas de los agentes. Las comparten las Cloud Functions y el servidor MCP.
// Regla de oro: las herramientas LEEN; la única escritura sobre datos de RH es `proponer_cambio`,
// que deja una propuesta pendiente de aprobación humana (regla 3, M11, M13).
import { FieldValue } from "firebase-admin/firestore";
import { coleccion, serializar } from "./comun.js";
import { calcularPrenomina, fechaLocal, resumenAsistencia, saldoVacaciones, solicitarVacaciones, sumarDias } from "./operacion.js";
import { guardarEncuesta } from "./encuestas.js";

export const INDICADORES = {
  v_rotacion_mensual: "Rotación por mes: bajas, activos al inicio y cierre, % mensual",
  v_rotacion_anual: "Rotación de los últimos 12 meses sobre plantilla promedio",
  v_cohorte_ingreso: "Por año de ingreso: ingresos, bajas, % que salió, bajas en el primer año, permanencia",
  v_antiguedad_activos: "Distribución de antigüedad de los activos",
  v_utilizacion: "Plantilla activa, con asignación, en banca, % banca, sobreasignados, costo de banca",
  v_banca: "Personas en banca (sin asignación vigente) y días en banca",
  v_banca_por_puesto: "Banca por puesto",
  v_concentracion_cliente: "Colaboradores por cliente y % de concentración",
  v_proyecto: "Proyectos con cliente, asignados y costo de personal",
  v_vencimiento_asignacion: "Asignaciones por vencer (30/60/90 días)",
  v_sobreasignados: "Colaboradores con dedicación > 100%",
  v_costo_por_esquema: "Costo de nómina por esquema",
  v_composicion_sueldo: "Composición del sueldo integrado",
  v_cobertura_matriz: "Activos con y sin matriz de habilidades",
  v_expertos_por_habilidad: "Expertos (nivel ≥ 3) por habilidad y riesgo de persona clave",
  v_nivel_por_tecnologia: "Nivel promedio por tecnología",
  v_expediente_resumen: "Expediente completo vs. incompleto",
  v_expediente_documento: "Cumplimiento por documento del expediente",
  v_activos_resumen: "Inventario de equipo: valor, sin costo, pendientes de recuperar",
  v_equipo_pendiente_recuperar: "Equipos a nombre de personas dadas de baja",
  v_activos_por_marca: "Equipos por marca",
  v_captura_pendiente: "Lista de captura pendiente para RH (campo, tabla, registros faltantes, prioridad)",
  v_indicador_bloqueado: "Indicadores bloqueados y el dato que falta para calcularlos",
  v_bajas_por_causa: "Bajas por causa (bloqueado hasta capturar causa)",
  v_costo_reemplazo: "Costo de reemplazo (bloqueado)",
  v_horas_facturables: "Horas facturables (bloqueado)",
  v_margen_proyecto: "Margen por proyecto (bloqueado)",
  v_certificacion_vigencia: "Vigencia de certificaciones (bloqueado)",
  v_matriz_actualizada: "Evaluaciones con menos de 12 meses (bloqueado)",
};

const BANDERAS = [
  "falta_puesto", "falta_departamento", "falta_sueldo", "falta_fecha_baja", "falta_causa_baja",
  "falta_esquema_nomina", "sobreasignado", "expediente_incompleto", "baja_primer_anio",
  "inconsistencia_estatus_fecha", "sin_matriz",
];

// Campos que un agente puede proponer cambiar, con su validación.
const CAMPOS_EDITABLES = {
  colaboradores: {
    id_causa_baja: { tipo: "catalogo", catalogo: "causa_baja", id: "id_causa_baja", texto: "causa_baja", soloBaja: true },
    fecha_baja: { tipo: "fecha" },
    puesto: { tipo: "catalogo", catalogo: "puesto", id: "id_puesto", texto: "puesto" },
    esquema_nomina: { tipo: "catalogo", catalogo: "esquema_nomina", id: "id_esquema_nomina", texto: "esquema_nomina", soloTexto: true },
    departamento: { tipo: "departamento" },
    tipo_contrato: { tipo: "texto" },
  },
  asignaciones: {
    rol_asignado: { tipo: "texto" },
    pct_dedicacion: { tipo: "numero", min: 1, max: 100 },
    fecha_inicio: { tipo: "fecha" },
    fecha_fin: { tipo: "fecha" },
  },
  proyectos: { pm_otc: { tipo: "texto" }, fecha_inicio: { tipo: "fecha" }, fecha_fin: { tipo: "fecha" } },
  activos: { costo: { tipo: "numero", min: 0.01 }, fecha_fin: { tipo: "fecha" }, estatus: { tipo: "texto" } },
  matriz: { nivel_num: { tipo: "numero", min: 1, max: 4, entero: true }, fecha_evaluacion: { tipo: "fecha" } },
  departamentos: { responsable: { tipo: "texto" }, centro_costos: { tipo: "texto" } },
};
const NIVELES = { 1: "Básico", 2: "Intermedio", 3: "Avanzado", 4: "Experto" };

const norm = (s) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function resumenColaborador(c) {
  return {
    id_colaborador: c.id_colaborador, nombre: c.nombre, estatus: c.estatus, puesto: c.puesto ?? null,
    departamento: c.departamento ?? null, antiguedad_meses: c.antiguedad_meses ?? null,
    en_banca: c.en_banca ?? null, dias_en_banca: c.dias_en_banca ?? null,
    fecha_baja: c.fecha_baja ?? null, causa_baja: c.causa_baja ?? null,
  };
}

function tieneBandera(c, b, idsConMatriz) {
  switch (b) {
    case "expediente_incompleto": return c.estatus === "Activo" && c.expediente_completo !== 1;
    case "sin_matriz": return c.estatus === "Activo" && !idsConMatriz.has(c.id_colaborador);
    case "falta_causa_baja": return c.estatus === "Baja" && !c.id_causa_baja;
    default: return c[b] === 1 || c[b] === true;
  }
}

// ---------------------------------------------------------------- definiciones (JSON Schema)
const DEF = [
  {
    name: "consultar_indicador",
    description:
      "Lee un indicador ya calculado por el pipeline (vistas v_* de otc_rh.db, corte 2026-11-20). Úsalo para cifras agregadas: rotación, banca, costo, habilidades, expediente, activos, captura pendiente. Devuelve columnas y filas.",
    input_schema: {
      type: "object",
      properties: {
        vista: { type: "string", enum: Object.keys(INDICADORES), description: "Nombre de la vista" },
        limite: { type: "integer", description: "Máximo de filas (por defecto 40)" },
      },
      required: ["vista"],
    },
  },
  {
    name: "buscar_colaboradores",
    description:
      "Busca colaboradores por texto (nombre o ID) y filtros. Devuelve un resumen por persona con su ID; usa ese ID para todo lo demás (nunca unas por nombre).",
    input_schema: {
      type: "object",
      properties: {
        texto: { type: "string", description: "Parte del nombre o ID" },
        estatus: { type: "string", enum: ["Activo", "Baja"] },
        en_banca: { type: "boolean" },
        bandera: { type: "string", enum: BANDERAS, description: "Problema de calidad a filtrar" },
        departamento: { type: "string" },
        puesto: { type: "string" },
        anio_ingreso: { type: "integer" },
        limite: { type: "integer", description: "Por defecto 30" },
      },
    },
  },
  {
    name: "ver_colaborador",
    description:
      "Ficha completa de un colaborador por ID: datos, banderas de calidad, asignaciones, habilidades evaluadas, equipo y notas de memoria sobre él. El costo individual solo aparece para rol admin.",
    input_schema: {
      type: "object",
      properties: { id_colaborador: { type: "string" } },
      required: ["id_colaborador"],
    },
  },
  {
    name: "buscar_por_habilidad",
    description:
      "Encuentra quién tiene una habilidad (por texto o código del catálogo de 71). Distingue Oracle EBS de Cloud por código. Devuelve personas con nivel 1–4, si están en banca, y cuántos expertos (nivel ≥ 3) hay por habilidad.",
    input_schema: {
      type: "object",
      properties: {
        texto: { type: "string", description: "Texto a buscar en nombre, descripción o tecnología de la habilidad" },
        cod_habilidad: { type: "string" },
        nivel_minimo: { type: "integer", description: "1–4; por defecto 1" },
        solo_activos: { type: "boolean", description: "Por defecto true" },
      },
    },
  },
  {
    name: "ver_proyectos",
    description: "Proyectos con su cliente, fechas, PM y quién está asignado (IDs) vigente.",
    input_schema: { type: "object", properties: { solo_vigentes: { type: "boolean" } } },
  },
  {
    name: "listar_catalogo",
    description: "Valores válidos de un catálogo (para proponer cambios con valores correctos).",
    input_schema: {
      type: "object",
      properties: {
        nombre: {
          type: "string",
          enum: ["causa_baja", "puesto", "esquema_nomina", "aseguradora", "ciudad", "industria", "marca", "documento", "departamentos"],
        },
      },
      required: ["nombre"],
    },
  },
  {
    name: "listar_tareas",
    description: "Tareas de la bandeja (trabajo repetitivo generado por la rutina diaria o por agentes).",
    input_schema: {
      type: "object",
      properties: {
        estado: { type: "string", enum: ["abierta", "hecha", "descartada"] },
        tipo: { type: "string" },
        id_colaborador: { type: "string" },
        limite: { type: "integer" },
      },
    },
  },
  {
    name: "crear_tarea",
    description:
      "Crea una tarea en la bandeja de RH: algo que una persona debe hacer o capturar. Úsala cuando falta un dato que solo RH puede conseguir.",
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        detalle: { type: "string" },
        tipo: { type: "string", description: "Ej.: captura, seguimiento, asignacion, entrevista" },
        prioridad: { type: "string", enum: ["alta", "media", "baja"] },
        id_colaborador: { type: "string" },
        regla: { type: "integer", description: "Número de regla de negocio (1–20) relacionada" },
      },
      required: ["titulo", "detalle", "prioridad"],
    },
  },
  {
    name: "proponer_cambio",
    description:
      "Propone corregir un campo. NO escribe: deja una propuesta pendiente que RH aprueba o rechaza en Aprobaciones; al aprobar se registra en log_correcciones (M15). Solo para valores confirmados por una fuente (RH, documento); nunca para imputar o adivinar. Campos permitidos: " +
      Object.entries(CAMPOS_EDITABLES).map(([c, f]) => `${c}: ${Object.keys(f).join(", ")}`).join(" · ") +
      ". Fechas en formato AAAA-MM-DD. Catálogos: usa el texto exacto del catálogo (o su ID).",
    input_schema: {
      type: "object",
      properties: {
        coleccion: { type: "string", enum: Object.keys(CAMPOS_EDITABLES) },
        id_doc: { type: "string", description: "ID del documento (para matriz: {id_colaborador}__{cod_habilidad})" },
        campo: { type: "string" },
        valor_propuesto: { type: "string", description: "Valor nuevo (números y fechas como texto)" },
        motivo: { type: "string", description: "Por qué y con qué fuente" },
      },
      required: ["coleccion", "id_doc", "campo", "valor_propuesto", "motivo"],
    },
  },
  {
    name: "recordar",
    description:
      "Guarda en la memoria de contexto un hecho durable, una decisión o una preferencia de RH (ej. «la causa de baja de C045 fue mejor oferta, lo confirmó RH»). No guardes datos personales de contacto.",
    input_schema: {
      type: "object",
      properties: {
        texto: { type: "string" },
        tema: { type: "string", description: "rotacion, staffing, reclutamiento, calidad, preferencia, proyecto, general" },
        entidad: { type: "string", description: "ID de colaborador, proyecto o cliente si la nota es sobre uno" },
      },
      required: ["texto", "tema"],
    },
  },
  {
    name: "buscar_memoria",
    description: "Busca en la memoria de contexto por texto, tema o entidad (ID).",
    input_schema: {
      type: "object",
      properties: { texto: { type: "string" }, tema: { type: "string" }, entidad: { type: "string" }, limite: { type: "integer" } },
    },
  },
  {
    name: "listar_sops",
    description: "Lista los procedimientos (SOPs) de RH disponibles.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "leer_sop",
    description: "Lee un SOP completo (pasos y reglas). Síguelo paso a paso cuando la tarea coincida con su disparador.",
    input_schema: { type: "object", properties: { id: { type: "string", description: "Ej. SOP-01" } }, required: ["id"] },
  },
  {
    name: "ver_cvs",
    description: "CVs procesados por el lector: lista reciente, o detalle de uno por ID (perfil, habilidades mapeadas, cobertura y recomendación).",
    input_schema: { type: "object", properties: { id: { type: "string" }, limite: { type: "integer" } } },
  },
  {
    name: "calidad_datos",
    description: "Completitud antes/después del acondicionamiento por tabla y columna, centinelas y correcciones.",
    input_schema: { type: "object", properties: { tabla: { type: "string" } } },
  },
  {
    name: "ver_asistencia",
    description: "Checadas de un día (por defecto hoy) o de un colaborador en un rango: entrada, salida, retardo y horas.",
    input_schema: { type: "object", properties: { fecha: { type: "string", description: "AAAA-MM-DD" }, id_colaborador: { type: "string" }, desde: { type: "string" }, hasta: { type: "string" } } },
  },
  {
    name: "resumen_asistencia",
    description: "Resumen por colaborador en un rango: días checados, retardos, puntualidad %, horas trabajadas y salidas sin registrar. Por defecto, últimos 14 días.",
    input_schema: { type: "object", properties: { desde: { type: "string" }, hasta: { type: "string" }, id_colaborador: { type: "string" } } },
  },
  {
    name: "saldo_vacaciones",
    description: "Saldo de vacaciones de un colaborador según la LFT 2023 (art. 76): antigüedad, derecho, tomados, pendientes, disponibles y fecha límite para disfrutarlas (art. 81).",
    input_schema: { type: "object", properties: { id_colaborador: { type: "string" } }, required: ["id_colaborador"] },
  },
  {
    name: "listar_vacaciones",
    description: "Solicitudes de vacaciones y permisos, filtrables por estado o colaborador.",
    input_schema: { type: "object", properties: { estado: { type: "string", enum: ["pendiente", "aprobada", "rechazada", "cancelada"] }, id_colaborador: { type: "string" } } },
  },
  {
    name: "solicitar_vacaciones",
    description: "Crea una solicitud de vacaciones o permiso EN ESTADO PENDIENTE; RH la aprueba en Vacaciones. Calcula días hábiles sin festivos.",
    input_schema: { type: "object", properties: {
      id_colaborador: { type: "string" }, tipo: { type: "string", enum: ["vacaciones", "permiso_con_goce", "permiso_sin_goce", "incapacidad"] },
      inicio: { type: "string", description: "AAAA-MM-DD" }, fin: { type: "string", description: "AAAA-MM-DD" }, motivo: { type: "string" } },
      required: ["id_colaborador", "tipo", "inicio", "fin"] },
  },
  {
    name: "ver_prenomina",
    description: "Prenómina de un periodo quincenal (AAAA-MM-Q1 o Q2): totales e incidencias; el detalle por persona con montos solo para rol admin.",
    input_schema: { type: "object", properties: { periodo: { type: "string" } }, required: ["periodo"] },
  },
  {
    name: "calcular_prenomina",
    description: "Calcula (o recalcula) la prenómina de control de un periodo con faltas, vacaciones (prima 25%), permisos e incapacidades. Solo rol admin. No timbra ni calcula ISR/IMSS.",
    input_schema: { type: "object", properties: { periodo: { type: "string" } }, required: ["periodo"] },
  },
  {
    name: "listar_encuestas",
    description: "Encuestas y formularios con su estado y número de respuestas.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "resultados_encuesta",
    description: "Resultados agregados de una encuesta (anónimos): eNPS, promedios por pregunta, distribución y comentarios; incluye el análisis de IA si existe.",
    input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "crear_borrador_encuesta",
    description: "Crea una encuesta EN BORRADOR (RH la revisa y la abre). Puede partir de plantilla (enps, clima, pulso, salida) o de preguntas propias: tipos escala (1–5), nps, opcion, multiple, texto, si_no.",
    input_schema: { type: "object", properties: {
      plantilla: { type: "string", enum: ["enps", "clima", "pulso", "salida"] }, titulo: { type: "string" }, descripcion: { type: "string" },
      preguntas: { type: "array", items: { type: "object", properties: { texto: { type: "string" }, tipo: { type: "string", enum: ["escala", "nps", "opcion", "multiple", "texto", "si_no"] }, opciones: { type: "array", items: { type: "string" } }, requerida: { type: "boolean" } }, required: ["texto", "tipo"] } } } },
  },
  {
    name: "ver_reconocimientos",
    description: "Reconocimientos recientes entre colaboradores (muro de cultura), opcionalmente de una persona.",
    input_schema: { type: "object", properties: { id_colaborador: { type: "string" }, limite: { type: "integer" } } },
  },
];


// ---------------------------------------------------------------- implementación
/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {{rol: 'admin'|'rh', autor: string, agente: string}} ctx
 */
export function crearHerramientas(db, ctx) {
  const esAdmin = ctx.rol === "admin";

  const impl = {
    async consultar_indicador({ vista, limite = 40 }) {
      const snap = await db.collection("indicadores").doc(vista).get();
      if (!snap.exists) throw new Error(`No existe el indicador ${vista}`);
      const d = snap.data();
      return {
        datos: { vista, descripcion: INDICADORES[vista], total: d.total, columnas: d.columnas, filas: d.filas.slice(0, limite) },
        resumen: `${vista}: ${d.total} filas`,
      };
    },

    async buscar_colaboradores(f = {}) {
      const todos = await coleccion(db, "colaboradores");
      let idsConMatriz = new Set();
      if (f.bandera === "sin_matriz") idsConMatriz = new Set((await coleccion(db, "matriz")).map((m) => m.id_colaborador));
      const t = norm(f.texto);
      const res = todos.filter((c) =>
        c.es_plantilla !== 0 &&
        (!t || norm(c.nombre).includes(t) || norm(c.id_colaborador) === t) &&
        (!f.estatus || c.estatus === f.estatus) &&
        (f.en_banca === undefined || (c.en_banca === 1) === f.en_banca) &&
        (!f.bandera || tieneBandera(c, f.bandera, idsConMatriz)) &&
        (!f.departamento || norm(c.departamento).includes(norm(f.departamento))) &&
        (!f.puesto || norm(c.puesto).includes(norm(f.puesto))) &&
        (!f.anio_ingreso || c.anio_ingreso === f.anio_ingreso),
      );
      const limite = f.limite ?? 30;
      return {
        datos: { total: res.length, mostrados: Math.min(limite, res.length), colaboradores: res.slice(0, limite).map(resumenColaborador) },
        resumen: `${res.length} colaboradores`,
      };
    },

    async ver_colaborador({ id_colaborador }) {
      const id = String(id_colaborador).trim();
      const snap = await db.collection("colaboradores").doc(id).get();
      if (!snap.exists) throw new Error(`No existe el colaborador ${id}. Búscalo primero con buscar_colaboradores.`);
      const c = snap.data();
      const [asig, mat, act, habs, mem] = await Promise.all([
        db.collection("asignaciones").where("id_colaborador", "==", id).get(),
        db.collection("matriz").where("id_colaborador", "==", id).get(),
        db.collection("activos").where("id_colaborador", "==", id).get(),
        coleccion(db, "habilidades"),
        db.collection("memoria").where("entidad", "==", id).limit(15).get(),
      ]);
      const habPorCod = Object.fromEntries(habs.map((h) => [h.cod_habilidad, h]));
      const habilidades = mat.docs
        .map((d) => d.data())
        .filter((m) => m.nivel_num != null)
        .sort((a, b) => b.nivel_num - a.nivel_num)
        .map((m) => ({
          cod_habilidad: m.cod_habilidad,
          habilidad: habPorCod[m.cod_habilidad]?.descripcion ?? habPorCod[m.cod_habilidad]?.habilidad,
          tecnologia: habPorCod[m.cod_habilidad]?.tecnologia,
          nivel: NIVELES[m.nivel_num], nivel_num: m.nivel_num, fecha_evaluacion: m.fecha_evaluacion ?? null,
        }));
      const ficha = {
        ...c,
        asignaciones: asig.docs.map((d) => d.data()),
        habilidades_evaluadas: habilidades.length,
        habilidades: habilidades.slice(0, 40),
        equipo: act.docs.map((d) => {
          const a = d.data();
          return { cod_activo: a.cod_activo, tipo: a.tipo, marca: a.marca, modelo: a.modelo, vigente: a.vigente, pendiente_recuperar: a.pendiente_recuperar, costo: a.costo };
        }),
        memoria: mem.docs.map((d) => ({ texto: d.data().texto, tema: d.data().tema })),
      };
      if (esAdmin) {
        const p = await db.collection("colaboradores_privado").doc(id).get();
        if (p.exists) ficha.costos = p.data();
      } else {
        ficha.costos = "Solo visible para rol admin";
      }
      return { datos: serializar(ficha), resumen: `${c.nombre} (${id})` };
    },

    async buscar_por_habilidad({ texto, cod_habilidad, nivel_minimo = 1, solo_activos = true }) {
      const [habs, mat, cols] = await Promise.all([
        coleccion(db, "habilidades"), coleccion(db, "matriz"), coleccion(db, "colaboradores"),
      ]);
      // Búsqueda por palabras: «Cloud GL» encuentra la habilidad GL de tecnología Oracle Fusion Cloud.
      const palabras = norm(texto).split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !["oracle", "de", "la", "el", "en"].includes(w));
      const elegidas = habs.filter((h) => {
        if (cod_habilidad) return h.cod_habilidad === cod_habilidad;
        const campo = norm([h.habilidad, h.descripcion, h.tecnologia, h.cod_habilidad].join(" "));
        return palabras.length && palabras.every((w) => campo.includes(w));
      });
      if (!elegidas.length) return { datos: { habilidades: [], nota: "Ninguna habilidad del catálogo coincide; prueba otro texto." }, resumen: "0 habilidades" };
      const colPorId = Object.fromEntries(cols.map((c) => [c.id_colaborador, c]));
      const codigos = new Set(elegidas.map((h) => h.cod_habilidad));
      const filas = mat.filter((m) => codigos.has(m.cod_habilidad) && m.nivel_num != null && m.nivel_num >= nivel_minimo)
        .filter((m) => !solo_activos || colPorId[m.id_colaborador]?.estatus === "Activo")
        .map((m) => {
          const c = colPorId[m.id_colaborador] ?? {};
          return { id_colaborador: m.id_colaborador, nombre: c.nombre, puesto: c.puesto ?? null, en_banca: c.en_banca, cod_habilidad: m.cod_habilidad, nivel: NIVELES[m.nivel_num], nivel_num: m.nivel_num };
        })
        .sort((a, b) => b.nivel_num - a.nivel_num);
      const expertos = elegidas.map((h) => {
        const n = mat.filter((m) => m.cod_habilidad === h.cod_habilidad && m.nivel_num >= 3 && colPorId[m.id_colaborador]?.estatus === "Activo").length;
        return { cod_habilidad: h.cod_habilidad, habilidad: h.descripcion ?? h.habilidad, tecnologia: h.tecnologia, expertos_activos: n, riesgo_persona_clave: n <= 1 };
      });
      return {
        datos: { habilidades: expertos.slice(0, 25), personas: filas.slice(0, 60), total_personas: filas.length },
        resumen: `${elegidas.length} habilidades · ${filas.length} personas`,
      };
    },

    async ver_proyectos({ solo_vigentes = false }) {
      const [proys, clientes, asigs] = await Promise.all([
        coleccion(db, "proyectos"), coleccion(db, "clientes"), coleccion(db, "asignaciones"),
      ]);
      const cli = Object.fromEntries(clientes.map((c) => [c.id_cliente, c.cliente]));
      const lista = proys.map((p) => {
        const a = asigs.filter((x) => x.id_proyecto === p.id_proyecto && x.vigente === 1);
        return { id_proyecto: p.id_proyecto, proyecto: p.proyecto, cliente: cli[p.id_cliente] ?? p.id_cliente, estatus: p.estatus_proyecto, fecha_inicio: p.fecha_inicio, fecha_fin: p.fecha_fin, pm_otc: p.pm_otc ?? null, asignados_vigentes: a.map((x) => x.id_colaborador) };
      }).filter((p) => !solo_vigentes || p.asignados_vigentes.length);
      return { datos: { proyectos: lista }, resumen: `${lista.length} proyectos` };
    },

    async listar_catalogo({ nombre }) {
      if (nombre === "departamentos") {
        const d = await coleccion(db, "departamentos");
        return { datos: d.map(({ id_departamento, departamento }) => ({ id_departamento, departamento })), resumen: `${d.length} departamentos` };
      }
      const snap = await db.collection("catalogos").doc(nombre).get();
      if (!snap.exists) throw new Error(`No existe el catálogo ${nombre}`);
      return { datos: snap.data().valores, resumen: `${snap.data().total} valores` };
    },

    async listar_tareas({ estado = "abierta", tipo, id_colaborador, limite = 40 }) {
      let q = db.collection("tareas").where("estado", "==", estado);
      if (tipo) q = q.where("tipo", "==", tipo);
      if (id_colaborador) q = q.where("id_colaborador", "==", id_colaborador);
      const snap = await q.limit(300).get();
      const orden = { alta: 0, media: 1, baja: 2 };
      const tareas = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (orden[a.prioridad] ?? 3) - (orden[b.prioridad] ?? 3));
      const porTipo = {};
      tareas.forEach((t) => (porTipo[t.tipo] = (porTipo[t.tipo] ?? 0) + 1));
      return {
        datos: serializar({ total: tareas.length, por_tipo: porTipo, tareas: tareas.slice(0, limite).map(({ id, tipo, titulo, prioridad, id_colaborador, regla }) => ({ id, tipo, titulo, prioridad, id_colaborador, regla })) }),
        resumen: `${tareas.length} tareas ${estado}s`,
      };
    },

    async crear_tarea({ titulo, detalle, tipo = "seguimiento", prioridad = "media", id_colaborador, regla }) {
      const ahora = FieldValue.serverTimestamp();
      const ref = await db.collection("tareas").add({
        titulo, detalle, tipo, prioridad, id_colaborador: id_colaborador ?? null, regla: regla ?? null,
        estado: "abierta", origen: "agente", agente: ctx.agente, autor: ctx.autor, creada: ahora, actualizada: ahora,
      });
      return { datos: { id: ref.id, ok: true }, resumen: `Tarea creada: ${titulo}` };
    },

    async proponer_cambio({ coleccion: col, id_doc, campo, valor_propuesto, motivo }) {
      const regla = CAMPOS_EDITABLES[col]?.[campo];
      if (!regla) throw new Error(`No se permite proponer ${col}.${campo}. Permitidos: ${Object.keys(CAMPOS_EDITABLES[col] ?? {}).join(", ")}`);
      const ref = db.collection(col).doc(String(id_doc));
      const snap = await ref.get();
      if (!snap.exists) throw new Error(`No existe ${col}/${id_doc}`);
      const actual = snap.data();
      const cambios = {};
      let mostrado = valor_propuesto;

      if (regla.tipo === "fecha") {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valor_propuesto))) throw new Error("La fecha debe ir en formato AAAA-MM-DD");
        if (String(valor_propuesto) === "1990-01-01") throw new Error("1990-01-01 es una fecha de relleno (regla 3)");
        if (col === "colaboradores" && campo === "fecha_baja" && actual.fecha_incorporacion && valor_propuesto < String(actual.fecha_incorporacion).slice(0, 10))
          throw new Error("La fecha de baja no puede ser anterior al ingreso (regla 7)");
        if (col === "colaboradores" && campo === "fecha_baja" && actual.estatus === "Activo")
          throw new Error("Un activo no puede tener fecha de baja (regla 6); primero confirma la baja");
        cambios[campo] = String(valor_propuesto);
      } else if (regla.tipo === "numero") {
        const n = Number(valor_propuesto);
        if (!Number.isFinite(n) || (regla.min != null && n < regla.min) || (regla.max != null && n > regla.max) || (regla.entero && !Number.isInteger(n)))
          throw new Error(`Valor fuera de rango para ${campo}`);
        cambios[campo] = n;
      } else if (regla.tipo === "catalogo") {
        if (regla.soloBaja && actual.estatus !== "Baja") throw new Error("Solo las bajas llevan causa de baja");
        const cat = (await db.collection("catalogos").doc(regla.catalogo).get()).data()?.valores ?? [];
        const v = norm(valor_propuesto);
        const hit = cat.find((x) => norm(x[regla.id]) === v || norm(x[regla.texto]) === v);
        if (!hit) throw new Error(`«${valor_propuesto}» no está en el catálogo ${regla.catalogo} (regla 2). Usa listar_catalogo.`);
        if (regla.soloTexto) cambios[regla.texto] = hit[regla.texto];
        else { cambios[regla.id] = hit[regla.id]; cambios[regla.texto] = hit[regla.texto]; }
        mostrado = hit[regla.texto];
      } else if (regla.tipo === "departamento") {
        const deps = await coleccion(db, "departamentos");
        const v = norm(valor_propuesto);
        const hit = deps.find((d) => norm(d.id_departamento) === v || norm(d.departamento) === v);
        if (!hit) throw new Error(`Departamento «${valor_propuesto}» no existe. Usa listar_catalogo con departamentos.`);
        cambios.id_departamento = hit.id_departamento;
        cambios.departamento = hit.departamento;
        mostrado = hit.departamento;
      } else {
        const s = String(valor_propuesto).trim().replace(/\s+/g, " ");
        if (!s || ["pendiente", "xxxx", "n/a", "-"].includes(norm(s))) throw new Error("Valor centinela no permitido (regla 3)");
        cambios[campo] = s;
        mostrado = s;
      }

      const visible = regla.tipo === "catalogo" ? regla.texto : regla.tipo === "departamento" ? "departamento" : campo;
      const valorActual = actual[visible] ?? null;
      if (valorActual != null && norm(valorActual) === norm(mostrado)) throw new Error("El valor propuesto es igual al actual");

      // Evita propuestas duplicadas pendientes sobre el mismo campo
      const dup = await db.collection("propuestas").where("estado", "==", "pendiente").where("id_doc", "==", String(id_doc)).get();
      if (dup.docs.some((d) => d.data().coleccion === col && d.data().campo === campo))
        throw new Error("Ya hay una propuesta pendiente sobre ese campo; espera a que RH la resuelva");

      const ref2 = await db.collection("propuestas").add({
        coleccion: col, id_doc: String(id_doc), campo, valor_actual: valorActual, valor_propuesto: mostrado,
        cambios, motivo, agente: ctx.agente, autor: ctx.autor, estado: "pendiente",
        etiqueta: actual.nombre ?? actual.proyecto ?? actual.descripcion ?? String(id_doc),
        creada: FieldValue.serverTimestamp(),
      });
      return { datos: { id: ref2.id, estado: "pendiente", nota: "RH debe aprobarla en Aprobaciones" }, resumen: `Propuesta ${col}.${campo} → ${mostrado}` };
    },

    async recordar({ texto, tema, entidad }) {
      const ref = await db.collection("memoria").add({
        texto, tema, entidad: entidad ?? null, autor: ctx.autor, agente: ctx.agente, fuente: "agente",
        creada: FieldValue.serverTimestamp(),
      });
      return { datos: { id: ref.id, ok: true }, resumen: `Recordado: ${texto.slice(0, 60)}` };
    },

    async buscar_memoria({ texto, tema, entidad, limite = 20 }) {
      let q = db.collection("memoria");
      if (entidad) q = q.where("entidad", "==", entidad);
      const snap = await q.orderBy("creada", "desc").limit(200).get();
      const t = norm(texto);
      const notas = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .filter((n) => (!tema || n.tema === tema) && (!t || norm(n.texto).includes(t)))
        .slice(0, limite)
        .map(({ id, texto, tema, entidad, creada }) => ({ id, texto, tema, entidad, creada }));
      return { datos: serializar(notas), resumen: `${notas.length} notas` };
    },

    async listar_sops() {
      const snap = await db.collection("sops").get();
      const sops = snap.docs.sort((a, b) => a.id.localeCompare(b.id)).map((d) => ({ id: d.id, titulo: d.data().titulo, disparador: d.data().disparador, agente: d.data().agente }));
      return { datos: sops, resumen: `${sops.length} SOPs` };
    },

    async leer_sop({ id }) {
      const snap = await db.collection("sops").doc(id).get();
      if (!snap.exists) throw new Error(`No existe el SOP ${id}`);
      return { datos: serializar({ id, ...snap.data() }), resumen: `${id} · ${snap.data().titulo}` };
    },

    async ver_cvs({ id, limite = 10 }) {
      if (id) {
        const s = await db.collection("cvs").doc(id).get();
        if (!s.exists) throw new Error(`No existe el CV ${id}`);
        return { datos: serializar({ id, ...s.data() }), resumen: `CV ${s.data().perfil?.nombre ?? id}` };
      }
      const snap = await db.collection("cvs").orderBy("creada", "desc").limit(limite).get();
      const cvs = snap.docs.map((d) => ({ id: d.id, archivo: d.data().archivo, estado: d.data().estado, nombre: d.data().perfil?.nombre ?? null, puesto_objetivo: d.data().perfil?.puesto_objetivo ?? null, recomendacion: d.data().recomendacion ?? null }));
      return { datos: cvs, resumen: `${cvs.length} CVs` };
    },

    async ver_asistencia({ fecha, id_colaborador, desde, hasta }) {
      let q = db.collection("asistencia");
      if (desde || hasta) q = q.where("fecha", ">=", desde ?? "2000-01-01").where("fecha", "<=", hasta ?? fechaLocal());
      else q = q.where("fecha", "==", fecha ?? fechaLocal());
      const regs = (await q.get()).docs.map((d) => d.data()).filter((a) => !id_colaborador || a.id_colaborador === id_colaborador)
        .map(({ id_colaborador, nombre, fecha, hora_entrada, hora_salida, retardo_min, minutos_trabajados, estado, origen }) => ({ id_colaborador, nombre, fecha, hora_entrada, hora_salida, retardo_min, minutos_trabajados, estado, origen }));
      const jornada = (await db.collection("config").doc("jornada").get()).data() ?? {};
      return { datos: { registros: regs.length, control_activo_desde: jornada.inicio_registro ?? null, checadas: regs.slice(0, 120) }, resumen: `${regs.length} checadas` };
    },
    async resumen_asistencia({ desde, hasta, id_colaborador }) {
      const h = hasta ?? fechaLocal();
      const r = await resumenAsistencia(db, { desde: desde ?? sumarDias(h, -13), hasta: h, id_colaborador });
      return { datos: r, resumen: `${r.registros} checadas · ${r.colaboradores} personas` };
    },
    async saldo_vacaciones({ id_colaborador }) {
      const r = await saldoVacaciones(db, String(id_colaborador).trim());
      return { datos: r, resumen: r.disponibles == null ? "Sin saldo calculable" : `${r.disponibles} días disponibles` };
    },
    async listar_vacaciones({ estado, id_colaborador }) {
      let q = db.collection("vacaciones");
      if (estado) q = q.where("estado", "==", estado);
      if (id_colaborador) q = q.where("id_colaborador", "==", id_colaborador);
      const lista = (await q.limit(200).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
      return { datos: serializar(lista), resumen: `${lista.length} solicitudes` };
    },
    async solicitar_vacaciones({ id_colaborador, tipo, inicio, fin, motivo }) {
      const c = (await db.collection("colaboradores").doc(String(id_colaborador)).get()).data();
      if (!c) throw new Error(`No existe el colaborador ${id_colaborador}`);
      if (c.estatus !== "Activo") throw new Error("Solo los activos pueden solicitar vacaciones.");
      const r = await solicitarVacaciones(db, { colaborador: c, tipo, inicio, fin, motivo, solicitadaPor: `${ctx.autor} (agente ${ctx.agente})` });
      return { datos: { ...r, estado: "pendiente", nota: "RH debe aprobarla en Vacaciones" }, resumen: `Solicitud pendiente · ${r.dias_habiles} días hábiles` };
    },
    async ver_prenomina({ periodo }) {
      const p = await db.collection("nomina_periodos").doc(periodo).get();
      if (!p.exists) return { datos: { periodo, nota: "Aún no se calcula este periodo." }, resumen: "Sin calcular" };
      const datos = { ...serializar(p.data()) };
      if (esAdmin) {
        const rec = await p.ref.collection("recibos").get();
        datos.recibos = rec.docs.map((d) => d.data()).map(({ id_colaborador, nombre, faltas, retardos, dias_vacaciones, dias_incapacidad, neto_estimado, costo_empresa, banderas }) => ({ id_colaborador, nombre, faltas, retardos, dias_vacaciones, dias_incapacidad, neto_estimado, costo_empresa, banderas }));
      } else {
        delete datos.totales?.neto; delete datos.totales?.percepciones; delete datos.totales?.deducciones; delete datos.totales?.costo_empresa;
        datos.nota = "Montos solo visibles para rol admin.";
      }
      return { datos, resumen: `Prenómina ${periodo}` };
    },
    async calcular_prenomina({ periodo }) {
      if (!esAdmin) throw new Error("Solo un admin puede calcular la prenómina.");
      const r = await calcularPrenomina(db, { periodo, autor: `${ctx.autor} (agente)` });
      return { datos: r, resumen: `Prenómina ${periodo}: ${r.totales.colaboradores} recibos` };
    },
    async listar_encuestas() {
      const lista = (await db.collection("encuestas").get()).docs.map((d) => ({ id: d.id, titulo: d.data().titulo, tipo: d.data().tipo, estado: d.data().estado, total_respuestas: d.data().total_respuestas ?? 0 }));
      return { datos: lista, resumen: `${lista.length} encuestas` };
    },
    async resultados_encuesta({ id }) {
      const r = await db.collection("encuestas_resultados").doc(id).get();
      if (!r.exists) return { datos: { id, total: 0, nota: "Sin respuestas todavía." }, resumen: "Sin respuestas" };
      return { datos: serializar(r.data()), resumen: `${r.data().total} respuestas` };
    },
    async crear_borrador_encuesta({ plantilla, titulo, descripcion, preguntas }) {
      const datos = {};
      if (titulo) datos.titulo = titulo;
      if (descripcion) datos.descripcion = descripcion;
      if (preguntas?.length) datos.preguntas = preguntas;
      const r = await guardarEncuesta(db, { plantilla, datos, autor: `${ctx.autor} (agente)` });
      return { datos: { ...r, estado: "borrador", nota: "RH la revisa y la abre en Encuestas." }, resumen: "Encuesta en borrador" };
    },
    async ver_reconocimientos({ id_colaborador, limite = 30 }) {
      let q = db.collection("reconocimientos");
      if (id_colaborador) q = q.where("para_id_colaborador", "==", id_colaborador);
      const lista = (await q.limit(200).get()).docs.map((d) => d.data())
        .sort((a, b) => (b.creada?.toMillis?.() ?? 0) - (a.creada?.toMillis?.() ?? 0)).slice(0, limite);
      return { datos: serializar(lista), resumen: `${lista.length} reconocimientos` };
    },

    async calidad_datos({ tabla }) {
      const filas = (await coleccion(db, "calidad_datos")).filter((r) => !tabla || r.tabla === tabla)
        .map(({ _id, ...r }) => r);
      return { datos: filas, resumen: `${filas.length} columnas evaluadas` };
    },
  };

  return {
    definiciones: DEF,
    async ejecutar(nombre, entrada) {
      const fn = impl[nombre];
      if (!fn) throw new Error(`Herramienta desconocida: ${nombre}`);
      return fn(entrada ?? {});
    },
  };
}

export { CAMPOS_EDITABLES, NIVELES };
