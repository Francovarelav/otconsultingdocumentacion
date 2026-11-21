import React, { useState } from 'react'

// ---------------------------------------------------------------- formato
const nf = new Intl.NumberFormat('es-MX')
export const num = (v) => (v == null ? '—' : nf.format(Math.round(v)))
export const pct = (v, d = 0) => (v == null ? '—' : `${v.toFixed(d)}%`)
export const corto = (v) => {
  if (v == null) return '—'
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)} M`
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)} k`
  return `$${nf.format(Math.round(v))}`
}
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export const fecha = (iso) => {
  if (!iso) return '—'
  const [a, m, d] = iso.split('-')
  return `${Number(d)} ${MESES[Number(m) - 1]} ${a}`
}
export const mesCorto = (ym) => MESES[Number(ym.split('-')[1]) - 1]
export const persona = (f) => (f.nombre ? `${f.nombre}` : f.id_colaborador)

// ---------------------------------------------------------------- piezas
export function Ficha({ className = '', oscuro = false, hundido = false, children, ...resto }) {
  const tono = oscuro ? 'bg-tinta text-white' : hundido ? 'bg-panel' : 'bg-white shadow-ficha'
  return (
    <section className={`rounded-4xl p-6 ${tono} ${className}`} {...resto}>
      {children}
    </section>
  )
}

export function Rotulo({ children, nota, className = '' }) {
  return (
    <header className={`mb-4 ${className}`}>
      <h3 className="text-[17px] font-semibold tracking-tight">{children}</h3>
      {nota && <p className="mt-1 max-w-[62ch] text-[13.5px] text-humo">{nota}</p>}
    </header>
  )
}

/** Dinero con los centavos atenuados, como se lee en un estado de cuenta. */
export function Dinero({ valor, className = '' }) {
  if (valor == null) return <span className={className}>—</span>
  const [entero, dec] = valor.toFixed(2).split('.')
  return (
    <span className={`font-semibold tracking-tight ${className}`}>
      ${nf.format(Number(entero))}
      <span className="opacity-35">.{dec}</span>
    </span>
  )
}

export function Pastilla({ children, tono = 'neutro', className = '' }) {
  const tonos = {
    neutro: 'bg-panel text-tinta',
    blanco: 'bg-white text-tinta shadow-ficha',
    carmin: 'bg-carmin text-white',
    suave: 'bg-carmin-suave text-carmin-hondo',
    tinta: 'bg-tinta text-white',
    rayado: 'rayado bg-panel text-tinta',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-[13px] font-medium ${tonos[tono]} ${className}`}>
      {children}
    </span>
  )
}

/** Sobre cuántos registros confiables se calculó el indicador. */
export function Base({ n, de, que, className = '' }) {
  const completo = n === de
  return (
    <span className={`inline-flex items-center gap-2 text-[12.5px] text-humo ${className}`}>
      <span className="relative h-1.5 w-12 overflow-hidden rounded-full rayado bg-panel">
        <span className="absolute inset-y-0 left-0 rounded-full bg-tinta" style={{ width: `${de ? (n / de) * 100 : 0}%` }} />
      </span>
      {completo ? `Calculado sobre los ${num(de)} ${que}` : `Calculado sobre ${num(n)} de ${num(de)} ${que}`}
    </span>
  )
}

export function Cifra({ valor, etiqueta, detalle, grande = false, className = '' }) {
  return (
    <div className={className}>
      <p className="text-[13.5px] text-humo">{etiqueta}</p>
      <p className={`mt-1 font-semibold tracking-tight ${grande ? 'text-5xl' : 'text-3xl'}`}>{valor}</p>
      {detalle && <p className="mt-1.5 text-[13px] text-humo">{detalle}</p>}
    </div>
  )
}

/** Barra horizontal repartida en partes proporcionales. `rayado` marca la parte sin dato. */
export function Reparto({ partes, alto = 'h-14', formato = num }) {
  const total = partes.reduce((s, p) => s + (p.valor || 0), 0)
  const fondo = { tinta: 'bg-tinta text-white', carmin: 'bg-carmin text-white', blanco: 'bg-white text-tinta shadow-ficha', bruma: 'bg-bruma text-tinta', rayado: 'rayado bg-panel text-tinta' }
  return (
    <div className="flex w-full gap-1.5" role="img" aria-label={partes.map((p) => `${p.etiqueta}: ${formato(p.valor)}`).join(', ')}>
      {partes.filter((p) => p.valor > 0).map((p) => {
        const parte = (p.valor / total) * 100
        return (
          <div key={p.etiqueta} title={`${p.etiqueta}: ${formato(p.valor)} (${parte.toFixed(1)}%)`}
            className={`${alto} flex min-w-[1.5rem] items-center justify-between gap-2 overflow-hidden whitespace-nowrap rounded-full ${parte > 9 ? 'px-4' : ''} ${fondo[p.tono || 'blanco']}`}
            style={{ width: `${parte}%` }}>
            <span className="truncate text-[13.5px] font-medium">{parte > 16 ? p.etiqueta : ''}</span>
            {parte > 9 && <span className="text-[13.5px] font-semibold">{formato(p.valor)}</span>}
          </div>
        )
      })}
    </div>
  )
}

export function Leyenda({ partes }) {
  const punto = { tinta: 'bg-tinta', carmin: 'bg-carmin', blanco: 'bg-white ring-1 ring-bruma', bruma: 'bg-bruma', rayado: 'rayado bg-panel ring-1 ring-bruma' }
  return (
    <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-humo">
      {partes.map((p) => (
        <li key={p.etiqueta} className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${punto[p.tono || 'blanco']}`} />
          {p.etiqueta}
          {p.valor != null && <span className="font-semibold text-tinta">{(p.formato || num)(p.valor)}</span>}
        </li>
      ))}
    </ul>
  )
}

/** Columnas en forma de cápsula. Una columna puede ir resaltada (carmín) o rayada (sin dato). */
export function Columnas({ datos, alto = 190, formato = num, unidad = '' }) {
  const [activa, setActiva] = useState(null)
  const max = Math.max(...datos.map((d) => d.valor || 0), 1)
  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height: alto }}>
        {datos.map((d, i) => {
          const h = Math.max(((d.valor || 0) / max) * (alto - 34), d.valor ? 10 : 4)
          const visible = activa === i || d.resaltar || datos.length <= 6
          const tono = d.rayado ? 'rayado bg-panel' : d.resaltar ? 'bg-carmin' : activa === i ? 'bg-tinta' : 'bg-bruma'
          return (
            <div key={d.etiqueta} className="group flex h-full flex-1 cursor-default flex-col items-center justify-end"
              onMouseEnter={() => setActiva(i)} onMouseLeave={() => setActiva(null)} tabIndex={0}
              onFocus={() => setActiva(i)} onBlur={() => setActiva(null)}
              aria-label={`${d.titulo || d.etiqueta}: ${formato(d.valor)} ${unidad}`}>
              <span className={`mb-1.5 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[12px] font-semibold transition-opacity ${visible ? 'opacity-100' : 'opacity-0'} ${d.resaltar ? 'bg-carmin text-white' : datos.length <= 6 && activa !== i ? 'text-tinta' : 'bg-tinta text-white'}`}>
                {formato(d.valor)}
              </span>
              <span className={`w-full max-w-[3.25rem] rounded-xl transition-colors ${tono}`} style={{ height: h }} />
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex gap-1.5">
        {datos.map((d) => (
          <span key={d.etiqueta} className="flex-1 text-center text-[12px] text-humo">{d.etiqueta}</span>
        ))}
      </div>
    </div>
  )
}

/** Renglones blancos con valor y porcentaje, para rankings cortos. */
export function Renglones({ datos, vacio = 'Sin registros' }) {
  if (!datos.length) return <p className="text-[13.5px] text-humo">{vacio}</p>
  return (
    <ul className="space-y-1.5">
      {datos.map((d) => (
        <li key={d.clave || d.etiqueta} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-ficha">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{d.etiqueta}</p>
            {d.sub && <p className="truncate text-[12.5px] text-humo">{d.sub}</p>}
          </div>
          <span className="font-semibold">{d.valor}</span>
          {d.marca && <Pastilla tono={d.tono || 'neutro'}>{d.marca}</Pastilla>}
        </li>
      ))}
    </ul>
  )
}

export function Avance({ valor, rayado = false, tono = 'bg-tinta' }) {
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-panel ${rayado ? 'rayado' : ''}`}>
      <div className={`h-full rounded-full ${tono}`} style={{ width: `${Math.min(valor || 0, 100)}%` }} />
    </div>
  )
}

export function Tabla({ columnas, filas, vacio = 'Sin registros' }) {
  if (!filas.length) return <p className="text-[13.5px] text-humo">{vacio}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-separate border-spacing-0 text-left text-[13.5px]">
        <thead>
          <tr>
            {columnas.map((c) => (
              <th key={c.titulo} className={`border-b border-panel pb-2 pr-4 font-medium text-humo ${c.derecha ? 'text-right' : ''}`}>{c.titulo}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i}>
              {columnas.map((c) => (
                <td key={c.titulo} className={`border-b border-panel py-2.5 pr-4 align-top ${c.derecha ? 'text-right font-medium' : ''} ${c.clase || ''}`}>{c.celda(f)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Indicador que todavía no se puede calcular: dice qué dato falta y dónde se captura. */
export function Bloqueado({ titulo, falta, tabla, campo, className = '' }) {
  return (
    <div className={`rayado rounded-3xl bg-panel p-5 ${className}`}>
      <p className="font-semibold">{titulo}</p>
      <p className="mt-1 text-[13.5px] text-tinta/70">Se activa cuando RH capture: {falta.toLowerCase()}.</p>
      <p className="mt-3 inline-block rounded-lg bg-white/80 px-2 py-1 text-[12.5px]">
        {tabla} <span className="text-humo">→</span> {campo}
      </p>
    </div>
  )
}

export function Hallazgo({ children, className = '' }) {
  return (
    <p className={`rounded-2xl bg-carmin-suave px-4 py-3 text-[13.5px] leading-relaxed text-carmin-hondo ${className}`}>{children}</p>
  )
}
