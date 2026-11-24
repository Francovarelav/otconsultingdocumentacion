import React, { useId, useState } from 'react'
import { num } from '../lib/formato.js'

/** Línea con área suave, puntos y valor al pasar el cursor. datos: [{etiqueta, valor}] */
export function Linea({ datos, formato = num, alto = 170 }) {
  const id = useId().replace(/:/g, '')
  const [activa, setActiva] = useState(null)
  const validos = datos.filter((d) => d.valor != null && !Number.isNaN(Number(d.valor)))
  if (validos.length === 0) return <p className="text-[13px] text-humo">Sin registros</p>
  const W = 600
  const H = alto
  const pad = { x: 14, arriba: 24, abajo: 22 }
  const vals = datos.map((d) => (d.valor == null ? null : Number(d.valor)))
  const max = Math.max(...vals.filter((v) => v != null), 1)
  const min = Math.min(0, ...vals.filter((v) => v != null))
  const n = datos.length
  const x = (i) => (n === 1 ? W / 2 : pad.x + (i * (W - pad.x * 2)) / (n - 1))
  const y = (v) => pad.arriba + (1 - (v - min) / (max - min || 1)) * (H - pad.arriba - pad.abajo)
  const puntos = datos.map((d, i) => (vals[i] == null ? null : [x(i), y(vals[i])])).filter(Boolean)
  const camino = puntos.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = `${camino} L${puntos[puntos.length - 1][0].toFixed(1)},${H - pad.abajo} L${puntos[0][0].toFixed(1)},${H - pad.abajo} Z`
  const paso = Math.ceil(n / 8)
  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={datos.map((d) => `${d.etiqueta}: ${formato(d.valor)}`).join(', ')} onMouseLeave={() => setActiva(null)}>
        <defs>
          <linearGradient id={`a${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF5A36" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#FF5A36" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`l${id}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#FD111C" />
            <stop offset="100%" stopColor="#FF8A4C" />
          </linearGradient>
        </defs>
        <line x1={pad.x} x2={W - pad.x} y1={H - pad.abajo} y2={H - pad.abajo} stroke="#E4E4E4" />
        <path d={area} fill={`url(#a${id})`} className="anim-entrar" />
        <path d={camino} fill="none" stroke={`url(#l${id})`} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" pathLength="100" className="trazo" style={{ '--largo': 100, animationDuration: '900ms' }} />
        {datos.map((d, i) =>
          vals[i] == null ? null : (
            <g key={i}>
              <rect x={x(i) - (W / n) / 2} y={0} width={W / n} height={H} fill="transparent" onMouseEnter={() => setActiva(i)} />
              <circle cx={x(i)} cy={y(vals[i])} r={activa === i ? 5 : 3} fill="#fff" stroke={activa === i ? '#FD111C' : '#FF5A36'} strokeWidth="2" pointerEvents="none" />
              {activa === i && (
                <text x={Math.min(Math.max(x(i), 30), W - 30)} y={y(vals[i]) - 10} textAnchor="middle" fontSize="12" fontWeight="600" fill="#1A1A1A">{formato(d.valor)}</text>
              )}
            </g>
          ),
        )}
        {datos.map((d, i) => (i % paso === 0 || i === n - 1 ? (
          <text key={`e${i}`} x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="#6B6B6B">{d.etiqueta}</text>
        ) : null))}
      </svg>
    </div>
  )
}

/** Medio círculo para NPS (−100 a 100). */
export function Gauge({ valor, min = -100, max = 100, etiqueta }) {
  const id = useId().replace(/:/g, '')
  const v = valor == null ? null : Math.max(min, Math.min(max, Number(valor)))
  const frac = v == null ? 0 : (v - min) / (max - min)
  const R = 80
  const cx = 100
  const cy = 95
  const largo = Math.PI * R
  const arco = `M${cx - R},${cy} A${R},${R} 0 0 1 ${cx + R},${cy}`
  return (
    <div className="w-full max-w-[260px]">
      <svg viewBox="0 0 200 110" className="block w-full" role="img" aria-label={`${etiqueta || 'Indicador'}: ${v ?? 'sin dato'}`}>
        <defs>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#FD111C" />
            <stop offset="100%" stopColor="#FF8A4C" />
          </linearGradient>
        </defs>
        <path d={arco} fill="none" stroke="#EFEFEF" strokeWidth="14" strokeLinecap="round" />
        {v != null && (
          <path d={arco} fill="none" stroke={`url(#g${id})`} strokeWidth="14" strokeLinecap="round" strokeDasharray={`${largo * frac} ${largo}`} className="anim-entrar" />
        )}
        <text x={cx} y={cy - 12} textAnchor="middle" fontSize="30" fontWeight="600" fill="#1A1A1A" letterSpacing="-1">{v == null ? '—' : Math.round(v)}</text>
        <text x={cx - R} y={cy + 13} textAnchor="middle" fontSize="10" fill="#6B6B6B">{min}</text>
        <text x={cx + R} y={cy + 13} textAnchor="middle" fontSize="10" fill="#6B6B6B">{max}</text>
      </svg>
      {etiqueta && <p className="-mt-1 text-center text-[12.5px] text-humo">{etiqueta}</p>}
    </div>
  )
}

const TONOS_DONA = ['#FD111C', '#FF8A4C', '#1A1A1A', '#BABABA', '#FF5A36', '#DEDEDE']

/** Dona con leyenda. partes: [{etiqueta, valor, tono?}] */
export function Dona({ partes, formato = num }) {
  const total = partes.reduce((s, p) => s + (Number(p.valor) || 0), 0)
  if (!total) return <p className="text-[13px] text-humo">Sin registros</p>
  const R = 42
  const C = 2 * Math.PI * R
  let acumulado = 0
  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg viewBox="0 0 110 110" className="h-[120px] w-[120px] shrink-0 -rotate-90" role="img" aria-label={partes.map((p) => `${p.etiqueta}: ${formato(p.valor)}`).join(', ')}>
        <circle cx="55" cy="55" r={R} fill="none" stroke="#EFEFEF" strokeWidth="14" />
        {partes.map((p, i) => {
          const largo = ((Number(p.valor) || 0) / total) * C
          const el = (
            <circle key={p.etiqueta} cx="55" cy="55" r={R} fill="none" stroke={p.tono || TONOS_DONA[i % TONOS_DONA.length]} strokeWidth="14"
              strokeDasharray={`${largo} ${C - largo}`} strokeDashoffset={-acumulado} className="anim-entrar" style={{ '--i': i }} />
          )
          acumulado += largo
          return el
        })}
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5 text-[13px]">
        {partes.map((p, i) => (
          <li key={p.etiqueta} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.tono || TONOS_DONA[i % TONOS_DONA.length] }} />
            <span className="min-w-0 flex-1 truncate">{p.etiqueta}</span>
            <span className="font-semibold tabular">{formato(p.valor)}</span>
            <span className="w-10 text-right text-[12px] text-humo tabular">{Math.round(((Number(p.valor) || 0) / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
