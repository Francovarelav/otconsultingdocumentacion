import { Bot, ClipboardCheck, Clock, FileSearch, HeartHandshake, TrendingDown, UsersRound } from 'lucide-react'

export const AGENTES = [
  {
    id: 'asistente',
    grad: 'grad-asistente',
    nombre: 'Asistente RH',
    icono: Bot,
    descripcion: 'Responde cualquier pregunta sobre la plantilla con todas las herramientas y SOPs.',
    sugerencias: [
      '¿Qué debo atender hoy según la rutina?',
      '¿Cuántos activos hay y cuántos están en banca?',
      '¿Qué datos le faltan capturar a RH para desbloquear los indicadores?',
      'Resume la calidad de los datos de colaboradores.',
    ],
  },
  {
    id: 'rotacion',
    grad: 'grad-rotacion',
    nombre: 'Analista de rotación',
    icono: TrendingDown,
    descripcion: 'Bajas, causa, permanencia y costo de la rotación (SOP-01).',
    sugerencias: [
      'Explícame por qué se va la gente y qué tan confiable es el dato.',
      '¿Cuántas bajas desde 2024 fueron en el primer año?',
      '¿Qué bajas no tienen fecha ni causa registrada?',
      '¿Cuál es la rotación de los últimos 12 meses y sobre cuántos registros?',
    ],
  },
  {
    id: 'staffing',
    grad: 'grad-staffing',
    nombre: 'Staffing',
    icono: UsersRound,
    descripcion: 'Banca, asignaciones, habilidades y proyectos (SOP-03, SOP-04).',
    sugerencias: [
      'Encuentra quién en banca puede cubrir un proyecto de Oracle Cloud Financials.',
      '¿Qué asignaciones vencen en los próximos 60 días?',
      '¿Qué habilidades dependen de una sola persona?',
      '¿Quién está sobreasignado?',
    ],
  },
  {
    id: 'reclutador',
    grad: 'grad-reclutador',
    nombre: 'Reclutador',
    icono: FileSearch,
    descripcion: 'Lee CVs y los compara contra la matriz de habilidades (SOP-05).',
    sugerencias: [
      '¿Qué CVs procesados cubren habilidades con riesgo de persona clave?',
      '¿Qué perfil deberíamos contratar primero según la matriz?',
      'Compara el último CV contra la plantilla actual.',
    ],
  },
  {
    id: 'nomina',
    grad: 'grad-nomina',
    nombre: 'Nómina y asistencia',
    icono: Clock,
    descripcion: 'Asistencia, retardos, saldos de vacaciones y prenómina de control.',
    sugerencias: [
      '¿Quién faltó o llegó tarde esta semana?',
      '¿Cuántos días de vacaciones tiene disponibles cada persona de mi equipo?',
      'Resume la prenómina de la quincena actual y sus banderas.',
      '¿Qué solicitudes de vacaciones siguen pendientes?',
    ],
  },
  {
    id: 'cultura',
    grad: 'grad-cultura',
    nombre: 'Clima y cultura',
    icono: HeartHandshake,
    descripcion: 'Encuestas, eNPS, reconocimientos y comunicados.',
    sugerencias: [
      '¿Cómo va el eNPS y qué temas salen en los comentarios?',
      'Arma un borrador de encuesta de pulso para la semana.',
      '¿Quién ha recibido más reconocimientos este mes?',
      '¿Qué dicen las encuestas de salida sobre por qué se va la gente?',
    ],
  },
  {
    id: 'auditor',
    grad: 'grad-auditor',
    nombre: 'Auditor de datos',
    icono: ClipboardCheck,
    descripcion: 'Calidad de datos y propuestas de corrección con aprobación (SOP-06, SOP-07).',
    beta: true,
    sugerencias: [
      '¿Qué columnas tienen peor índice de completitud?',
      'Revisa los activos sin puesto y propón correcciones con catálogo.',
      '¿Qué equipos están pendientes de recuperar?',
      '¿Qué activos no cumplen la regla 5?',
    ],
  },
]

export const agente = (id) => AGENTES.find((a) => a.id === id)
export const nombreAgente = (id) => agente(id)?.nombre ?? id ?? 'Agente'

/** Qué agente resuelve una tarea según su tipo (y, si no, su regla de negocio). */
const TAREA_AGENTE = {
  causa_baja: 'rotacion', fecha_baja: 'rotacion', estatus: 'rotacion',
  falta: 'nomina', salida_sin_registrar: 'nomina', sin_salida: 'nomina', vacaciones_pendiente: 'nomina', vacaciones_por_vencer: 'nomina',
  banca: 'staffing', sobreasignado: 'staffing', asignacion_vence: 'staffing', matriz: 'staffing',
  datos_basicos: 'auditor', expediente: 'auditor', equipo_recuperar: 'auditor', captura: 'auditor',
}

export function agenteParaTarea(t) {
  const porTipo = TAREA_AGENTE[t?.tipo]
  if (porTipo) return porTipo
  const r = Number(String(t?.regla ?? '').replace(/\D/g, ''))
  if (r === 6 || r === 7) return 'rotacion'
  if ([11, 12, 13, 14, 19].includes(r)) return 'staffing'
  return 'auditor'
}
