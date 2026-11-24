// Utilidades de calendario para asistencia, vacaciones y nómina (hora local del navegador).

const p2 = (n) => String(n).padStart(2, '0')
export const iso = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
export const deISO = (s) => {
  const [a, m, d] = String(s).split('-').map(Number)
  return new Date(a, (m || 1) - 1, d || 1)
}
export const sumarDias = (d, n) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
/** 1 = lunes … 7 = domingo (como config/jornada.dias_laborales). */
export const diaSemana = (d) => ((d.getDay() + 6) % 7) + 1

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export const DIAS_CORTOS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
export const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

function nEsimoLunes(anio, mes, n) {
  const d = new Date(anio, mes, 1)
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1)
  d.setDate(d.getDate() + 7 * (n - 1))
  return d
}

/** Días de descanso obligatorio, LFT art. 74. */
export function festivos(anio) {
  const f = [
    new Date(anio, 0, 1),
    nEsimoLunes(anio, 1, 1), // primer lunes de febrero
    nEsimoLunes(anio, 2, 3), // tercer lunes de marzo
    new Date(anio, 4, 1),
    new Date(anio, 8, 16),
    nEsimoLunes(anio, 10, 3), // tercer lunes de noviembre
    new Date(anio, 11, 25),
  ]
  if ((anio - 2024) % 6 === 0) f.push(new Date(anio, 9, 1)) // transmisión del Poder Ejecutivo
  return new Set(f.map(iso))
}

export const JORNADA_BASE = { hora_entrada: '09:00', hora_salida: '18:00', tolerancia_min: 10, dias_laborales: [1, 2, 3, 4, 5], horas_jornada: 8, zona: 'America/Monterrey' }

export function esLaboral(d, jornada = JORNADA_BASE) {
  const dias = jornada?.dias_laborales?.length ? jornada.dias_laborales : JORNADA_BASE.dias_laborales
  return dias.includes(diaSemana(d)) && !festivos(d.getFullYear()).has(iso(d))
}

/** Días hábiles entre inicio y fin (inclusive), sin festivos. Estimación del cliente; el servidor manda. */
export function diasHabiles(inicio, fin, jornada) {
  if (!inicio || !fin) return 0
  let d = deISO(inicio)
  const f = deISO(fin)
  if (f < d) return 0
  let n = 0
  while (d <= f) {
    if (esLaboral(d, jornada)) n += 1
    d = sumarDias(d, 1)
  }
  return n
}

/** Periodos quincenales AAAA-MM-Q1|Q2 desde hace `meses` meses hasta el actual (más reciente primero). */
export function periodosQuincenales(meses = 3, hoy = new Date()) {
  const lista = []
  for (let k = 0; k <= meses; k++) {
    const base = new Date(hoy.getFullYear(), hoy.getMonth() - k, 1)
    const a = base.getFullYear()
    const m = base.getMonth()
    const ultimo = new Date(a, m + 1, 0).getDate()
    const q2 = { id: `${a}-${p2(m + 1)}-Q2`, inicio: `${a}-${p2(m + 1)}-16`, fin: `${a}-${p2(m + 1)}-${p2(ultimo)}`, etiqueta: `16–${ultimo} ${MESES[m]} ${a}` }
    const q1 = { id: `${a}-${p2(m + 1)}-Q1`, inicio: `${a}-${p2(m + 1)}-01`, fin: `${a}-${p2(m + 1)}-15`, etiqueta: `1–15 ${MESES[m]} ${a}` }
    if (k === 0 && hoy.getDate() <= 15) lista.push(q1)
    else lista.push(q2, q1)
  }
  return lista
}

export const minutosAHoras = (min) => {
  if (min == null) return '—'
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return `${h} h ${p2(m)} min`
}

/** Lunes de la semana de d. */
export const lunesDe = (d) => sumarDias(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -(diaSemana(d) - 1))

export const fechaLarga = (d) => `${DIAS[diaSemana(d) - 1]} ${d.getDate()} de ${MESES[d.getMonth()]}`
