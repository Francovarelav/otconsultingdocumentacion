import React, { useEffect, useState } from 'react'
import { LogIn, LogOut } from 'lucide-react'
import { api, mensajeError } from '../firebase.js'
import { useSesion } from '../lib/auth.jsx'
import { useDocVivo } from '../lib/datos.js'
import { hoyISO } from '../lib/formato.js'
import { JORNADA_BASE, esLaboral, fechaLarga, minutosAHoras } from '../lib/fechas.js'
import { ErrorCaja, Pastilla, useAviso } from './ui.jsx'
import SelectorColaborador from './SelectorColaborador.jsx'

function Reloj() {
  const [ahora, setAhora] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const p = (n) => String(n).padStart(2, '0')
  return (
    <div>
      <p className="text-[56px] font-semibold leading-none tracking-titulo tabular sm:text-[64px]">
        {p(ahora.getHours())}:{p(ahora.getMinutes())}
        <span className="text-[28px] text-gris">:{p(ahora.getSeconds())}</span>
      </p>
      <p className="mt-2 text-[14px] capitalize text-humo">{fechaLarga(ahora)}</p>
    </div>
  )
}

/** Check animado de confirmación. */
function Palomita() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" className="trazo" style={{ '--largo': 24 }} />
    </svg>
  )
}

/**
 * Botón grande de checar entrada/salida con reloj en vivo.
 * admin/rh eligen al colaborador; el rol colaborador checa para sí.
 */
export default function Checador({ jornada }) {
  const { esColaborador, idColaborador, puedeOperar } = useSesion()
  const avisar = useAviso()
  const [elegido, setElegido] = useState(esColaborador ? idColaborador : null)
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [hecho, setHecho] = useState(0) // contador para relanzar la animación
  const [error, setError] = useState('')
  const id = esColaborador ? idColaborador : elegido
  const hoy = hoyISO()
  const registro = useDocVivo(id ? ['asistencia', `${id}__${hoy}`] : null)
  const r = registro.datos
  const j = jornada || JORNADA_BASE
  const tipo = !r ? 'entrada' : r.estado === 'abierta' ? 'salida' : null
  const puede = (esColaborador && !!idColaborador) || puedeOperar

  const checar = async () => {
    if (!tipo || !id) return
    setError('')
    setEnviando(true)
    try {
      await api.checar({ tipo, ...(esColaborador ? {} : { id_colaborador: id }), ...(nota.trim() ? { nota: nota.trim() } : {}) })
      setHecho((h) => h + 1)
      setNota('')
      avisar(tipo === 'entrada' ? 'Entrada registrada' : 'Salida registrada')
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section className="mesh relative overflow-hidden rounded-4xl border border-linea p-6 sm:p-8">
      <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <Reloj />
          <p className="mt-4 text-[13px] text-humo">
            Jornada {j.hora_entrada}–{j.hora_salida} · tolerancia {j.tolerancia_min} min
            {!esLaboral(new Date(), j) && <Pastilla tono="neutro" className="ml-2">Hoy no es día laboral</Pastilla>}
          </p>
          {!esColaborador && (
            <div className="mt-5 max-w-[380px]">
              <SelectorColaborador valor={elegido} onCambio={setElegido} placeholder="¿Quién va a checar?" />
            </div>
          )}
          {esColaborador && !idColaborador && <div className="mt-4"><ErrorCaja>Tu usuario no está ligado a un colaborador. Pide a RH que lo configure.</ErrorCaja></div>}
          {id && (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px]">
              {r ? (
                <>
                  <Pastilla tono="contorno">Entrada {r.hora_entrada || '—'}</Pastilla>
                  {r.retardo_min > 0 && <Pastilla tono="suave">Retardo {r.retardo_min} min</Pastilla>}
                  {r.hora_salida && <Pastilla tono="contorno">Salida {r.hora_salida}</Pastilla>}
                  {r.minutos_trabajados != null && <Pastilla tono="tinta">{minutosAHoras(r.minutos_trabajados)}</Pastilla>}
                </>
              ) : (
                !registro.cargando && <span className="text-humo">Sin registro hoy.</span>
              )}
            </div>
          )}
          {id && tipo && (
            <input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Nota opcional (p. ej. visita a cliente)"
              aria-label="Nota"
              className="mt-4 h-10 w-full max-w-[380px] rounded-xl border border-borde bg-white px-3 text-[13.5px] outline-none placeholder:text-humo focus:border-[#FF8A6A] focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          )}
          {error && <div className="mt-3 max-w-[420px]"><ErrorCaja>{error}</ErrorCaja></div>}
        </div>

        <div className="relative mx-auto grid place-items-center">
          {hecho > 0 && <span key={hecho} className="onda grad-ot pointer-events-none absolute inset-0 rounded-full" aria-hidden />}
          <button
            onClick={checar}
            disabled={!id || !tipo || enviando || !puede}
            title={!puede ? 'Tu rol no permite checar' : undefined}
            className={`relative grid h-44 w-44 place-items-center rounded-full text-white transition-[filter,transform] active:scale-[.97] disabled:cursor-not-allowed ${tipo === 'salida' ? 'bg-tinta hover:bg-black' : 'grad-ot grad-ot-hover'} ${!tipo && id ? '!bg-none bg-panel !text-humo' : ''} ${!id ? 'opacity-50' : ''} shadow-[0_12px_30px_-14px_rgba(26,26,26,.45)]`}
          >
            <span className="flex flex-col items-center gap-2">
              {hecho > 0 && !enviando ? <Palomita key={hecho} /> : tipo === 'salida' ? <LogOut className="h-7 w-7" /> : <LogIn className="h-7 w-7" />}
              <span className="text-[16px] font-semibold tracking-apretado">
                {enviando ? 'Registrando…' : !id ? 'Elige a alguien' : tipo === 'entrada' ? 'Checar entrada' : tipo === 'salida' ? 'Checar salida' : 'Jornada completa'}
              </span>
            </span>
          </button>
        </div>
      </div>
    </section>
  )
}
