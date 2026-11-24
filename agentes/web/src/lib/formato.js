const nf = new Intl.NumberFormat('es-MX')
const nf1 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 })

export const num = (v) => (v == null || Number.isNaN(Number(v)) ? '—' : nf.format(Math.round(Number(v))))
export const dec = (v) => (v == null ? '—' : nf1.format(Number(v)))
export const pct = (v, d = 1) => (v == null ? '—' : `${Number(v).toFixed(d).replace(/\.0$/, '')} %`)
export const dinero = (v) =>
  v == null ? '—' : `$${new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 }).format(Number(v))}`
export const corto = (v) => {
  if (v == null) return '—'
  const n = Number(v)
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)} M`
  if (Math.abs(n) >= 1e3) return `$${Math.round(n / 1e3)} k`
  return dinero(n)
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** Acepta Timestamp de Firestore, {seconds}, Date, ISO o milisegundos. */
export function aFecha(v) {
  if (v == null || v === '') return null
  if (typeof v.toDate === 'function') return v.toDate()
  if (typeof v === 'object' && 'seconds' in v) return new Date(v.seconds * 1000)
  if (typeof v === 'object' && '_seconds' in v) return new Date(v._seconds * 1000)
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [a, m, d] = v.split('-').map(Number)
    return new Date(a, m - 1, d)
  }
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

export const fecha = (v) => {
  const d = aFecha(v)
  return d ? `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}` : '—'
}
export const mesCorto = (ym) => {
  const [a, m] = String(ym).split('-')
  return m ? `${MESES[Number(m) - 1]} ${a.slice(2)}` : ym
}

export function hace(v) {
  const d = aFecha(v)
  if (!d) return ''
  const s = (Date.now() - d.getTime()) / 1000
  if (s < 60) return 'hace un momento'
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`
  if (s < 86400 * 7) return `hace ${Math.floor(s / 86400)} d`
  return fecha(d)
}

export const ms = (v) => aFecha(v)?.getTime() ?? 0

export const NIVELES = { 1: 'Básico', 2: 'Intermedio', 3: 'Avanzado', 4: 'Experto' }

export const normal = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** "baja_sin_causa" → "Baja sin causa" */
export const humano = (s) => {
  const t = String(s ?? '').replace(/[_-]+/g, ' ').trim()
  return t ? t[0].toUpperCase() + t.slice(1) : ''
}

export const hoyISO = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
