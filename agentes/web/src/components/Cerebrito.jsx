import React from 'react'

// Cerebrito pixel art de la Memoria. SVG puro: cada letra de la cuadrícula es un pixel.
// k contorno · o base · r pliegue · h brillo · p chapeta. Los ojos se dibujan aparte para parpadear.
const CUADRICULA = [
  '.......kkkk..kkkk.......',
  '.....kkhhookkoohhkk.....',
  '....khhooookkoooohhk....',
  '...khoorrooffoorroohk...',
  '..khoorooroooorooroohk..',
  '..kooroooroooorooorook..',
  '.kooorroooooooooorroook.',
  '.koooooorroooorrooooook.',
  'kooooooooooooooooooooook',
  'koorooooooooooooooorrook',
  'koroooooooooooooooooorok',
  'kooooooooooooooooooooook',
  'kooppoooookookoooooppook',
  '.koppooooookkooooooppok.',
  '.kooorroooooooooorroook.',
  '..kooorrroooooorrroook..',
  '...kkoooorrrrrrooookk...',
  '.....kkkkooooookkkk.....',
  '........kk....kk........',
  '........kk....kk........',
] // 24 × 20 pixeles

const COLOR = { k: '#2E1A1E', o: '#FF9E96', r: '#E85060', f: '#E85060', h: '#FFDED6', p: '#FF5A36' }

// Ojos de 2×3 con brillo arriba; cerrados = una línea.
const OJOS_ABIERTOS = [[8, 9, 'w'], [9, 9, 'k'], [8, 10, 'k'], [9, 10, 'k'], [8, 11, 'k'], [9, 11, 'k'],
  [15, 9, 'w'], [14, 9, 'k'], [14, 10, 'k'], [15, 10, 'k'], [14, 11, 'k'], [15, 11, 'k']]
const OJOS_CERRADOS = [[8, 11], [9, 11], [14, 11], [15, 11]]
const CHISPAS = [[2, -3, '#FF8A4C', 0], [21, -2, '#FD111C', 0.6], [11, -4, '#FF5A36', 1.2]]

const ESTILO = `
@keyframes cereb-bote { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-1px) } }
@keyframes cereb-abierto { 0%,92%,100% { opacity: 1 } 94%,98% { opacity: 0 } }
@keyframes cereb-cerrado { 0%,92%,100% { opacity: 0 } 94%,98% { opacity: 1 } }
@keyframes cereb-chispa { 0%,100% { opacity: 0; transform: translateY(1px) } 30%,70% { opacity: 1; transform: translateY(0) } }
.cereb-cuerpo { animation: cereb-bote 1.6s steps(2) infinite }
.cereb-abierto { animation: cereb-abierto 4.5s steps(1) infinite }
.cereb-cerrado { animation: cereb-cerrado 4.5s steps(1) infinite }
.cereb-chispa { animation: cereb-chispa 1.8s steps(3) infinite; transform-box: fill-box }
@media (prefers-reduced-motion: reduce) {
  .cereb-cuerpo, .cereb-abierto, .cereb-chispa { animation: none }
  .cereb-cerrado { animation: none; opacity: 0 }
}`

const pixeles = (lista) => lista.map(([x, y, c]) => <rect key={`${x}-${y}`} x={x} y={y} width="1.02" height="1.02" fill={c === 'w' ? '#FFFFFF' : COLOR[c] ?? COLOR.k} />)

/** Cerebrito animado. `pensando` muestra chispas de idea arriba. */
export default function Cerebrito({ tam = 96, pensando = true, className = '', titulo = 'Cerebrito de la memoria' }) {
  const base = []
  CUADRICULA.forEach((fila, y) => [...fila].forEach((c, x) => { if (COLOR[c]) base.push([x, y, c]) }))
  return (
    <svg viewBox="0 -5 24 25" width={tam} height={(tam * 25) / 24} shapeRendering="crispEdges" role="img" aria-label={titulo} className={className}>
      <style>{ESTILO}</style>
      {pensando && CHISPAS.map(([x, y, c, d]) => (
        <g key={x} className="cereb-chispa" style={{ animationDelay: `${d}s` }} fill={c}>
          <rect x={x} y={y - 1} width="1" height="1" /><rect x={x - 1} y={y} width="3" height="1" /><rect x={x} y={y + 1} width="1" height="1" />
        </g>
      ))}
      <g className="cereb-cuerpo">
        {pixeles(base)}
        <g className="cereb-abierto">{pixeles(OJOS_ABIERTOS)}</g>
        <g className="cereb-cerrado">{pixeles(OJOS_CERRADOS.map(([x, y]) => [x, y, 'k']))}</g>
      </g>
    </svg>
  )
}
