import React from 'react'

// Monito: la mascota pixel art de los agentes. SVG puro sobre una cuadrícula de 16×16;
// cada celda es un <rect> de 1×1 con shape-rendering="crispEdges". Las animaciones viven en index.css
// (clases monito-*) y son por pasos, para que se sientan de pixel.

// Paleta: 1 contorno · 2 casco crema · 3 acento del agente · 4 pantalla · 5 ojos · 6 boca · 7 acento oscuro · 8 rubor
const BASE = [
  '.......33.......',
  '.......11.......',
  '...1111111111...',
  '..122222222221..',
  '..124444444421..',
  '..124444444421..',
  '..124444444421..',
  '..124444444421..',
  '..124444444421..',
  '..122222222221..',
  '...1111111111...',
  '..113322223311..',
  '..133322223331..',
  '..113333333311..',
  '....1331..1331..',
  '....1111..1111..',
]

/** Cada agente con su acento y un accesorio que lo distingue. */
export const MONITOS = {
  asistente: { color: '#FF5A36', accesorio: 'audifonos' },
  rotacion: { color: '#FF4D6A', accesorio: 'lentes' },
  staffing: { color: '#FF9A4C', accesorio: 'casco' },
  reclutador: { color: '#FFB057', accesorio: 'lupa' },
  nomina: { color: '#FF7A3D', accesorio: 'reloj' },
  cultura: { color: '#FF6F91', accesorio: 'corazon' },
  auditor: { color: '#8A8A93', accesorio: 'lentes' },
}

function oscurecer(hex, f = 0.62) {
  const n = parseInt(hex.slice(1), 16)
  const c = (s) => Math.round(((n >> s) & 255) * f).toString(16).padStart(2, '0')
  return `#${c(16)}${c(8)}${c(0)}`
}

// Píxeles sueltos [x, y, índice de paleta]
const P = (lista, k) => lista.map(([x, y]) => [x, y, k])

const OJOS = P([[5, 5], [5, 6], [10, 5], [10, 6]], 5)
const OJOS_ARRIBA = P([[5, 6], [6, 6], [9, 6], [10, 6]], 5)
const PARPADO = P([[5, 6], [10, 6]], 5)
const OJOS_FELICES = P([[4, 6], [5, 5], [6, 6], [9, 6], [10, 5], [11, 6]], 5)
const SONRISA = P([[6, 7], [9, 7], [7, 8], [8, 8]], 6)
const BOCA_ABIERTA = P([[7, 7], [8, 7], [7, 8], [8, 8]], 6)
const BOCA_CHICA = P([[7, 8], [8, 8]], 6)
const SONRISA_GRANDE = P([[5, 7], [10, 7], [6, 8], [7, 8], [8, 8], [9, 8]], 6)
const MEJILLAS = P([[4, 7], [11, 7]], 8)
const PUNTOS = [[11, 1], [13, 1], [15, 1]]

const ACCESORIOS = {
  audifonos: [...P([[1, 5], [1, 6], [1, 7], [14, 5], [14, 6], [14, 7]], 7), ...P([[14, 8], [13, 9]], 1), [12, 9, 3]],
  lentes: P([[4, 5], [4, 6], [6, 5], [6, 6], [9, 5], [9, 6], [11, 5], [11, 6], [7, 5], [8, 5]], 3),
  casco: [...P([[5, 1], [6, 1], [9, 1], [10, 1]], 3), ...P([[3, 2], [4, 2], [5, 2], [6, 2], [9, 2], [10, 2], [11, 2], [12, 2]], 3), ...P([[7, 2], [8, 2]], 7)],
  lupa: [...P([[14, 10], [15, 11], [14, 12], [13, 11]], 1), [14, 11, 5], [13, 12, 7], [12, 13, 7]],
  reloj: [...P([[6, 11], [7, 11], [8, 11], [9, 11], [6, 12], [9, 12]], 5), ...P([[7, 12], [8, 12]], 1), [7, 11, 1]],
  corazon: [...P([[6, 11], [7, 11], [8, 11], [9, 11]], 6), ...P([[7, 12], [8, 12]], 6), [6, 12, 2], [9, 12, 2]],
}

const pixeles = (lista, pal) => lista.map(([x, y, k]) => <rect key={`${x}-${y}-${k}`} x={x} y={y} width="1" height="1" fill={pal[k]} />)

/**
 * <Monito estado="quieto|pensando|hablando|feliz" tam={48} agente="asistente" />
 * `color` y `accesorio` sobrescriben los del agente.
 */
export default function Monito({ estado = 'quieto', tam = 48, agente, color, accesorio, className = '', titulo }) {
  const def = MONITOS[agente] ?? {}
  const acento = color ?? def.color ?? '#FF5A36'
  const acc = accesorio === undefined ? def.accesorio : accesorio
  const pal = { 1: '#1A1A1A', 2: '#FFF4EE', 3: acento, 4: '#26262C', 5: '#FFFFFF', 6: '#FF9AAE', 7: oscurecer(acento), 8: '#7A3344' }

  const base = []
  BASE.forEach((fila, y) => [...fila].forEach((c, x) => { if (c !== '.') base.push([x, y, Number(c)]) }))
  const antena = base.filter(([, y]) => y === 0)
  const cuerpo = base.filter(([, y]) => y > 0)

  const ojos = estado === 'feliz' ? OJOS_FELICES : estado === 'pensando' ? OJOS_ARRIBA : OJOS
  const parpadea = estado === 'quieto' || estado === 'hablando'

  return (
    <svg
      viewBox="0 0 16 16"
      width={tam ?? undefined}
      height={tam ?? undefined}
      shapeRendering="crispEdges"
      role="img"
      aria-label={titulo ?? 'Agente'}
      className={`monito monito-${estado} shrink-0 ${className}`}
    >
      <g className="monito-cuerpo">
        <g className="monito-antena">{pixeles(antena, pal)}</g>
        {pixeles(cuerpo, pal)}
        {parpadea ? (
          <>
            <g className="monito-ojos">{pixeles(ojos, pal)}</g>
            <g className="monito-parpado">{pixeles(PARPADO, pal)}</g>
          </>
        ) : (
          pixeles(ojos, pal)
        )}
        {estado === 'hablando' ? (
          <>
            <g className="monito-boca-a">{pixeles(BOCA_ABIERTA, pal)}</g>
            <g className="monito-boca-b">{pixeles(BOCA_CHICA, pal)}</g>
          </>
        ) : (
          pixeles(estado === 'feliz' ? SONRISA_GRANDE : estado === 'pensando' ? BOCA_CHICA : SONRISA, pal)
        )}
        {pixeles(MEJILLAS, pal)}
        {acc && ACCESORIOS[acc] && pixeles(ACCESORIOS[acc], pal)}
      </g>
      {estado === 'pensando' &&
        PUNTOS.map(([x, y], i) => (
          <rect key={x} className="monito-punto" style={{ animationDelay: `${i * 200}ms` }} x={x} y={y} width="1" height="1" fill={pal[7]} />
        ))}
    </svg>
  )
}
