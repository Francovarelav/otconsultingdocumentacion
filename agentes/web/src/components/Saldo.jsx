import React, { useEffect, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { api, mensajeError } from '../firebase.js'
import { fecha, num } from '../lib/formato.js'
import { Cargando, Contador, ErrorCaja } from './ui.jsx'

/** Saldo de vacaciones (LFT art. 76) de un colaborador, calculado por el servidor. */
export default function Saldo({ id, compacto = false }) {
  const [estado, setEstado] = useState({ cargando: true, datos: null, error: null })
  useEffect(() => {
    if (!id) return setEstado({ cargando: false, datos: null, error: null })
    let vivo = true
    setEstado({ cargando: true, datos: null, error: null })
    api.saldoVacaciones({ id_colaborador: id }).then(
      (datos) => vivo && setEstado({ cargando: false, datos, error: null }),
      (e) => vivo && setEstado({ cargando: false, datos: null, error: mensajeError(e) }),
    )
    return () => { vivo = false }
  }, [id])

  if (!id) return <p className="text-[13px] text-humo">Elige un colaborador para ver su saldo.</p>
  if (estado.cargando) return <Cargando lineas={2} />
  if (estado.error) return <ErrorCaja>No se pudo calcular el saldo: {estado.error}</ErrorCaja>
  const s = estado.datos || {}
  const derecho = Number(s.derecho) || 0
  const tomados = Number(s.tomados) || 0
  const pendientes = Number(s.pendientes) || 0
  const pct = (v) => (derecho ? Math.min((v / derecho) * 100, 100) : 0)

  return (
    <div className="anim-entrar">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[12.5px] text-humo">Días disponibles</p>
          <p className="texto-grad text-[40px] font-semibold leading-none tracking-titulo tabular"><Contador valor={s.disponibles ?? 0} /></p>
        </div>
        {!compacto && (
          <p className="flex items-center gap-1.5 text-[12.5px] text-humo">
            <CalendarDays className="h-3.5 w-3.5" />
            {s.antiguedad_anios != null && `${num(s.antiguedad_anios)} año${s.antiguedad_anios === 1 ? '' : 's'} de antigüedad · `}
            periodo {fecha(s.periodo_inicio)} – {fecha(s.periodo_fin)}
          </p>
        )}
      </div>
      <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-panel" role="img" aria-label={`Derecho ${derecho}, tomados ${tomados}, pendientes ${pendientes}`}>
        <div className="crecer-x h-full bg-tinta" style={{ width: `${pct(tomados)}%` }} />
        <div className="crecer-x rayado h-full bg-borde" style={{ width: `${pct(pendientes)}%`, '--i': 2 }} />
        <div className="crecer-x grad-ot-h h-full" style={{ width: `${pct(Math.max(derecho - tomados - pendientes, 0))}%`, '--i': 4 }} />
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-humo">
        <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-tinta" />Tomados <b className="font-semibold text-tinta">{num(tomados)}</b></li>
        <li className="flex items-center gap-1.5"><span className="rayado h-2 w-2 rounded-full bg-borde" />Por aprobar <b className="font-semibold text-tinta">{num(pendientes)}</b></li>
        <li className="flex items-center gap-1.5"><span className="grad-ot h-2 w-2 rounded-full" />Derecho <b className="font-semibold text-tinta">{num(derecho)}</b></li>
        {s.aniversario && !compacto && <li>Aniversario: {fecha(s.aniversario)}</li>}
      </ul>
    </div>
  )
}
