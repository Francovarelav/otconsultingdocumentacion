import React, { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { ChevronDown, ReceiptText } from 'lucide-react'
import { db } from '../firebase.js'
import { dinero, humano, num } from '../lib/formato.js'
import { Aviso, Cargando, ErrorCaja, Falta, Pastilla, Vacio } from './ui.jsx'

function ultimasQuincenas(n) {
  const hoy = new Date()
  const lista = []
  let a = hoy.getFullYear(), m = hoy.getMonth() + 1, q = hoy.getDate() > 15 ? 2 : 1
  for (let i = 0; i < n; i++) {
    const mm = String(m).padStart(2, '0')
    const ultimo = new Date(a, m, 0).getDate()
    lista.push({ id: `${a}-${mm}-Q${q}`, inicio: q === 1 ? `${a}-${mm}-01` : `${a}-${mm}-16`, fin: q === 1 ? `${a}-${mm}-15` : `${a}-${mm}-${ultimo}` })
    if (q === 2) q = 1
    else { q = 2; m -= 1; if (m === 0) { m = 12; a -= 1 } }
  }
  return lista
}

/** Recibos de prenómina de un colaborador: lee cada periodo y su recibo nomina_periodos/{p}/recibos/{id}. */
export default function Recibos({ id }) {
  const [estado, setEstado] = useState({ cargando: true, lista: [], error: null })
  const [abierto, setAbierto] = useState(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        // Solo se lee el recibo propio de cada quincena (los últimos 12 meses): el colaborador no ve
        // los totales de la nómina, que viven en el documento del periodo.
        const recibos = await Promise.all(
          ultimasQuincenas(24).map(async (p) => {
            const r = await getDoc(doc(db, 'nomina_periodos', p.id, 'recibos', id)).catch(() => null)
            return r?.exists() ? { ...r.data(), periodo: p } : null
          }),
        )
        if (vivo) setEstado({ cargando: false, lista: recibos.filter(Boolean).sort((a, b) => b.periodo.id.localeCompare(a.periodo.id)), error: null })
      } catch (e) {
        if (vivo) setEstado({ cargando: false, lista: [], error: e })
      }
    })()
    return () => { vivo = false }
  }, [id])

  if (estado.cargando) return <Cargando lineas={3} />
  if (estado.error) return <ErrorCaja>No tienes acceso a los recibos o no se pudieron leer.</ErrorCaja>
  return (
    <div className="space-y-3">
      <Aviso>Prenómina de control: no timbra CFDI ni recalcula ISR/IMSS. Los montos son estimados.</Aviso>
      {estado.lista.length === 0 ? (
        <Vacio icono={ReceiptText} titulo="Sin recibos todavía" texto="Aparecerán cuando RH calcule la prenómina de una quincena." />
      ) : (
        <ul className="space-y-2">
          {estado.lista.map((r, i) => {
            const k = r.periodo.id
            const sinSueldo = (r.banderas || []).includes('falta_sueldo')
            return (
              <li key={k} style={{ '--i': i }} className="anim-entrar overflow-hidden rounded-2xl border border-linea transition-colors hover:border-borde">
                <button onClick={() => setAbierto(abierto === k ? null : k)} aria-expanded={abierto === k} className="flex w-full items-center gap-4 px-4 py-3 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{k}</span>
                    <span className="block text-[12px] text-humo">{r.periodo.inicio} – {r.periodo.fin} · {r.periodo.estado === 'cerrado' ? 'Cerrado' : 'Calculado'}</span>
                  </span>
                  <span className="text-right">
                    <span className="block text-[11.5px] text-humo">Neto estimado</span>
                    <span className="block font-semibold tabular">{sinSueldo ? <Falta>Sin sueldo</Falta> : dinero(r.neto_estimado)}</span>
                  </span>
                  <ChevronDown className={`h-4 w-4 text-humo transition-transform ${abierto === k ? 'rotate-180' : ''}`} />
                </button>
                {abierto === k && (
                  <div className="anim-entrar grid gap-4 border-t border-linea bg-panel/50 px-4 py-4 text-[13px] sm:grid-cols-3">
                    <Bloque titulo="Percepciones" filas={Object.entries(r.percepciones || {})} />
                    <Bloque titulo="Deducciones" filas={Object.entries(r.deducciones || {})} />
                    <div>
                      <p className="mb-1.5 font-medium">Incidencias</p>
                      <ul className="space-y-1 text-humo">
                        <li>Días laborables: <b className="text-tinta">{num(r.dias_laborables)}</b></li>
                        <li>Faltas: <b className="text-tinta">{num(r.faltas)}</b> · Retardos: <b className="text-tinta">{num(r.retardos)}</b></li>
                        <li>Vacaciones: <b className="text-tinta">{num(r.dias_vacaciones)}</b></li>
                        {(r.banderas || []).length > 0 && <li className="flex flex-wrap gap-1 pt-1">{r.banderas.map((b) => <Falta key={b}>{humano(b)}</Falta>)}</li>}
                      </ul>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Bloque({ titulo, filas }) {
  return (
    <div>
      <p className="mb-1.5 font-medium">{titulo}</p>
      {filas.length === 0 ? <p className="text-humo">—</p> : (
        <ul className="space-y-1">
          {filas.map(([k, v]) => (
            <li key={k} className="flex justify-between gap-3"><span className="text-humo">{humano(k)}</span><span className="tabular">{v == null ? <Pastilla tono="rayado">—</Pastilla> : dinero(v)}</span></li>
          ))}
        </ul>
      )}
    </div>
  )
}
