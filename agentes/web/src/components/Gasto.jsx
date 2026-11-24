import React from 'react'
import { Gauge } from 'lucide-react'
import { useSesion } from '../lib/auth.jsx'
import { useDocVivo } from '../lib/datos.js'
import { hace, num } from '../lib/formato.js'

const mxn = (v) => `$${new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0)}`

/** Medidor compacto del gasto de IA del mes (config/gasto). Solo admin. */
export default function MedidorGasto({ className = '' }) {
  const { esAdmin } = useSesion()
  const { datos: g, cargando, error } = useDocVivo(esAdmin ? ['config', 'gasto'] : null)
  if (!esAdmin || cargando || error) return null
  const limite = Number(g?.limite_mxn ?? 200)
  const gastado = Number(g?.gastado_mxn ?? 0)
  const p = Math.min((gastado / (limite || 1)) * 100, 100)
  const alto = p >= 85
  return (
    <div className={`anim-entrar flex items-center gap-4 rounded-2xl border border-linea bg-white px-4 py-3 ${className}`}>
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${alto ? 'grad-ot text-white' : 'bg-panel text-tinta'}`}>
        <Gauge className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-[13px]">
          <span>
            <span className="font-semibold tabular">{mxn(gastado)}</span> <span className="text-humo">de {mxn(limite)} este mes en IA</span>
            {g?.pausado && <span className="ml-2 rounded-full bg-tinta px-2 py-0.5 text-[11px] font-medium text-white">IA en pausa</span>}
          </span>
          <span className="text-[11.5px] text-humo">{g ? `${num(g.llamadas ?? 0)} llamadas${g.actualizado ? ` · ${hace(g.actualizado)}` : ''}` : 'Sin consumo registrado'}</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-panel">
          <div className="grad-ot-h h-full rounded-full transition-[width] duration-700" style={{ width: `${p}%` }} />
        </div>
      </div>
    </div>
  )
}
