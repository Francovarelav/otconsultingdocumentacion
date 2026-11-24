import React, { useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { collection } from 'firebase/firestore'
import { Calculator, Download, Lock, Receipt } from 'lucide-react'
import { api, db, mensajeError } from '../firebase.js'
import { useSesion } from '../lib/auth.jsx'
import { useEnVivo } from '../lib/datos.js'
import { hace, humano, normal, num } from '../lib/formato.js'
import { periodosQuincenales } from '../lib/fechas.js'
import {
  Aviso, Base, Boton, CampoBusqueda, Cargando, Contador, Encabezado, ErrorCaja, Falta, Pastilla, Selector, Tarjeta, Vacio,
  Resaltar, useAviso, useDebounce,
} from '../components/ui.jsx'

const mxn = (v) => (v == null ? '—' : `$${new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 }).format(Number(v))}`)
const suma = (o) => (o && typeof o === 'object' ? Object.values(o).reduce((s, v) => s + (Number(v) || 0), 0) : null)
const tieneBandera = (r, b) => (r.banderas || []).includes(b)
const incidencias = (r) =>
  (r.faltas || 0) + (r.retardos || 0) + (r.dias_vacaciones || 0) + (r.dias_permiso_con_goce || 0) + (r.dias_sin_goce || 0) + (r.dias_incapacidad || 0)

export default function Nomina() {
  const { esAdmin } = useSesion()
  if (!esAdmin) return <Navigate to="/" replace />
  return <Prenomina />
}

function Prenomina() {
  const avisar = useAviso()
  const periodosDocs = useEnVivo(() => collection(db, 'nomina_periodos'), [])
  const opciones = useMemo(() => {
    const base = periodosQuincenales(3)
    const ids = new Set(base.map((p) => p.id))
    const extra = periodosDocs.datos
      .filter((d) => !ids.has(d.id))
      .map((d) => ({ id: d.id, inicio: d.inicio, fin: d.fin, etiqueta: d.id }))
    return [...base, ...extra].sort((a, b) => b.id.localeCompare(a.id))
  }, [periodosDocs.datos])
  const [periodo, setPeriodo] = useState(() => periodosQuincenales(0)[0].id)
  const doc = periodosDocs.datos.find((d) => d.id === periodo)
  const opcion = opciones.find((o) => o.id === periodo)
  const estado = doc?.estado || 'sin calcular'
  const cerrado = estado === 'cerrado'

  const [calculando, setCalculando] = useState(false)
  const [cerrando, setCerrando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)

  const calcular = async () => {
    setCalculando(true)
    try {
      await api.calcularPrenomina({ periodo })
      avisar(`Prenómina ${periodo} calculada`)
    } catch (e) {
      avisar(mensajeError(e), 'error')
    } finally {
      setCalculando(false)
    }
  }
  const cerrar = async () => {
    setCerrando(true)
    try {
      await api.cerrarPeriodo({ periodo })
      avisar(`Periodo ${periodo} cerrado`)
      setConfirmar(false)
    } catch (e) {
      avisar(mensajeError(e), 'error')
    } finally {
      setCerrando(false)
    }
  }

  const recibos = useEnVivo(() => (doc ? collection(db, 'nomina_periodos', periodo, 'recibos') : null), [periodo, !!doc])
  const t = doc?.totales || {}

  return (
    <div>
      <Encabezado titulo="Nómina" subtitulo="Prenómina quincenal calculada con asistencia, vacaciones y permisos aprobados. Lo que falta se marca, no se inventa.">
        <Selector
          valor={periodo}
          onCambio={(v) => { setPeriodo(v); setConfirmar(false) }}
          opciones={opciones.map((o) => {
            const d = periodosDocs.datos.find((x) => x.id === o.id)
            return { valor: o.id, etiqueta: `${o.id} · ${o.etiqueta}${d ? ` · ${d.estado}` : ''}` }
          })}
        />
      </Encabezado>

      <Aviso className="mb-5">Prenómina de control: no timbra CFDI ni recalcula ISR/IMSS.</Aviso>

      <section className="mb-6 flex flex-wrap items-center gap-3 rounded-3xl border border-linea p-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[18px] font-semibold tracking-apretado">Periodo {periodo}</h2>
            <Pastilla tono={cerrado ? 'tinta' : doc ? 'contorno' : 'rayado'}>{humano(estado)}</Pastilla>
          </div>
          <p className="mt-1 text-[13px] text-humo">
            {opcion ? `Del ${opcion.inicio} al ${opcion.fin}` : ''}
            {doc?.calculado && ` · calculado ${hace(doc.calculado)}${doc.calculado_por ? ` por ${doc.calculado_por}` : ''}`}
            {cerrado && doc?.cerrado_por && ` · cerrado por ${doc.cerrado_por}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Boton variante="primario" icono={cerrado ? Lock : Calculator} cargando={calculando} disabled={cerrado} title={cerrado ? 'El periodo está cerrado' : undefined} onClick={calcular}>
            {calculando ? 'Calculando…' : doc ? 'Recalcular prenómina' : 'Calcular prenómina'}
          </Boton>
          <Boton icono={Download} disabled={!recibos.datos.length} onClick={() => exportarCSV(periodo, recibos.datos)}>Exportar CSV</Boton>
          {doc && !cerrado && (confirmar ? (
            <span className="flex items-center gap-1.5">
              <Boton variante="fantasma" onClick={() => setConfirmar(false)}>Cancelar</Boton>
              <Boton variante="tinta" icono={Lock} cargando={cerrando} onClick={cerrar}>Confirmar cierre</Boton>
            </span>
          ) : (
            <Boton variante="secundario" icono={Lock} onClick={() => setConfirmar(true)}>Cerrar periodo</Boton>
          ))}
        </div>
        {confirmar && <p className="w-full text-[12.5px] text-humo">Al cerrar ya no se puede recalcular este periodo.</p>}
      </section>

      {periodosDocs.cargando ? <Cargando lineas={4} /> : !doc ? (
        <Vacio icono={Receipt} titulo="Este periodo aún no se calcula" texto="Calcula la prenómina para generar un recibo de control por colaborador con sus incidencias." />
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Tarjeta i={0} className="p-5">
              <p className="text-[12.5px] text-humo">Colaboradores</p>
              <p className="mt-1 text-[28px] font-semibold leading-none tracking-titulo tabular"><Contador valor={t.colaboradores} /></p>
              <div className="mt-2"><Base n={t.con_sueldo} de={t.colaboradores} que="con sueldo capturado" /></div>
            </Tarjeta>
            <Total i={1} etiqueta="Percepciones" valor={t.percepciones} />
            <Total i={2} etiqueta="Deducciones" valor={t.deducciones} />
            <Total i={3} etiqueta="Neto estimado" valor={t.neto} resaltar />
            <Total i={4} etiqueta="Costo empresa" valor={t.costo_empresa} />
            <Tarjeta i={5} className="p-5">
              <p className="text-[12.5px] text-humo">Faltas en el periodo</p>
              <p className="mt-1 text-[28px] font-semibold leading-none tracking-titulo tabular"><Contador valor={t.faltas ?? 0} /></p>
              <p className="mt-2 text-[12px] text-humo">Solo desde que se activó el registro de asistencia.</p>
            </Tarjeta>
            <Tarjeta i={6} className="p-5">
              <p className="text-[12.5px] text-humo">Días de vacaciones</p>
              <p className="mt-1 text-[28px] font-semibold leading-none tracking-titulo tabular"><Contador valor={t.dias_vacaciones ?? 0} /></p>
              <p className="mt-2 text-[12px] text-humo">Con prima vacacional del 25 % (LFT art. 80).</p>
            </Tarjeta>
          </div>
          <Recibos recibos={recibos} />
        </>
      )}
    </div>
  )
}

function Total({ etiqueta, valor, resaltar, i }) {
  return (
    <Tarjeta i={i} className="p-5">
      <p className="text-[12.5px] text-humo">{etiqueta}</p>
      <p className={`mt-1 text-[28px] font-semibold leading-none tracking-titulo tabular ${resaltar ? 'texto-grad' : ''}`}>
        {valor == null ? '—' : <Contador valor={valor} formato={mxn} />}
      </p>
    </Tarjeta>
  )
}

function Recibos({ recibos }) {
  const [texto, setTexto] = useState('')
  const q = useDebounce(texto)
  const [filtro, setFiltro] = useState('todos')

  const lista = useMemo(() => {
    const b = normal(q)
    return recibos.datos
      .filter((r) => !b || normal(r.nombre).includes(b) || normal(r.id_colaborador ?? r.id).includes(b))
      .filter((r) => filtro === 'todos' || (filtro === 'banderas' ? (r.banderas || []).length > 0 : incidencias(r) > 0))
      .sort((a, b2) => String(a.nombre).localeCompare(String(b2.nombre), 'es'))
  }, [recibos.datos, q, filtro])

  const tot = lista.reduce(
    (s, r) => ({
      percepciones: s.percepciones + (suma(r.percepciones) || 0),
      deducciones: s.deducciones + (suma(r.deducciones) || 0),
      neto: s.neto + (Number(r.neto_estimado) || 0),
      costo: s.costo + (Number(r.costo_empresa) || 0),
    }),
    { percepciones: 0, deducciones: 0, neto: 0, costo: 0 },
  )

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h3 className="mr-2 text-[17px] font-semibold tracking-apretado">Recibos de control</h3>
        <CampoBusqueda valor={texto} onCambio={setTexto} placeholder="Nombre o ID" className="w-full sm:w-[240px]" />
        <Selector valor={filtro} onCambio={setFiltro} opciones={[{ valor: 'todos', etiqueta: 'Todos' }, { valor: 'banderas', etiqueta: 'Solo con banderas' }, { valor: 'incidencias', etiqueta: 'Con incidencias' }]} />
        <span className="text-[13px] text-humo">{num(lista.length)} de {num(recibos.datos.length)}</span>
      </div>
      {recibos.error ? <ErrorCaja error={recibos.error}>No se pudieron leer los recibos.</ErrorCaja> : recibos.cargando ? <Cargando lineas={6} /> : recibos.datos.length === 0 ? (
        <Vacio icono={Receipt} titulo="Sin recibos" texto="El periodo no tiene recibos calculados." />
      ) : (
        <div className="scroll-fino overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-left text-[13px]" style={{ minWidth: 1080 }}>
            <thead>
              <tr>
                {['Colaborador', 'Esquema', 'Sueldo mensual', 'Incidencias', 'Percepciones', 'Deducciones', 'Neto estimado', 'Costo empresa', 'Banderas'].map((h, i) => (
                  <th key={h} className={`sticky top-0 border-b border-linea bg-white pb-2 pr-4 text-[12px] font-medium text-humo ${i >= 4 && i <= 7 ? 'text-right' : ''} ${i === 2 ? 'text-right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.map((r, i) => {
                const id = r.id_colaborador ?? r.id
                const sinSueldo = tieneBandera(r, 'falta_sueldo') || r.sueldo_mensual == null
                return (
                  <tr key={r.id} style={{ '--i': i }} className="anim-entrar transition-colors hover:bg-panel/60">
                    <td className="border-b border-linea py-2.5 pr-4 align-top">
                      <Link to={`/colaboradores/${encodeURIComponent(id)}`} className="font-medium hover:text-rojo"><Resaltar texto={r.nombre || id} q={q} /></Link>
                      <span className="block text-[11.5px] text-humo"><Resaltar texto={id} q={q} /></span>
                    </td>
                    <td className="border-b border-linea py-2.5 pr-4 align-top text-[12.5px]">{r.esquema_nomina || <Falta />}</td>
                    <td className="border-b border-linea py-2.5 pr-4 text-right align-top tabular">{sinSueldo ? <Falta>Sin sueldo</Falta> : mxn(r.sueldo_mensual)}</td>
                    <td className="border-b border-linea py-2.5 pr-4 align-top"><Incidencias r={r} /></td>
                    <td className="border-b border-linea py-2.5 pr-4 text-right align-top tabular">{sinSueldo ? '—' : mxn(suma(r.percepciones))}</td>
                    <td className="border-b border-linea py-2.5 pr-4 text-right align-top tabular">{sinSueldo ? '—' : mxn(suma(r.deducciones))}</td>
                    <td className="border-b border-linea py-2.5 pr-4 text-right align-top font-semibold tabular">{sinSueldo ? '—' : mxn(r.neto_estimado)}</td>
                    <td className="border-b border-linea py-2.5 pr-4 text-right align-top tabular">{sinSueldo ? '—' : mxn(r.costo_empresa)}</td>
                    <td className="border-b border-linea py-2.5 pr-4 align-top">
                      <div className="flex flex-wrap gap-1">
                        {(r.banderas || []).length === 0 ? <span className="text-humo">—</span> : r.banderas.map((b) => <Falta key={b}>{humano(b)}</Falta>)}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="pt-3 pr-4" colSpan={4}>Total de {num(lista.length)} recibos (sin los que no tienen sueldo)</td>
                <td className="pt-3 pr-4 text-right tabular">{mxn(tot.percepciones)}</td>
                <td className="pt-3 pr-4 text-right tabular">{mxn(tot.deducciones)}</td>
                <td className="pt-3 pr-4 text-right tabular">{mxn(tot.neto)}</td>
                <td className="pt-3 pr-4 text-right tabular">{mxn(tot.costo)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  )
}

function Incidencias({ r }) {
  const items = [
    ['faltas', r.faltas, 'suave'],
    ['retardos', r.retardos, 'neutro'],
    ['vacaciones', r.dias_vacaciones, 'contorno'],
    ['permiso con goce', r.dias_permiso_con_goce, 'contorno'],
    ['sin goce', r.dias_sin_goce, 'suave'],
    ['incapacidad', r.dias_incapacidad, 'contorno'],
  ].filter(([, v]) => Number(v) > 0)
  if (!items.length) return <span className="text-humo">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {items.map(([e, v, tono]) => <Pastilla key={e} tono={tono}>{num(v)} {e}</Pastilla>)}
    </div>
  )
}

function exportarCSV(periodo, recibos) {
  const cols = [
    ['id_colaborador', (r) => r.id_colaborador ?? r.id],
    ['nombre', (r) => r.nombre],
    ['esquema_nomina', (r) => r.esquema_nomina],
    ['sueldo_mensual', (r) => r.sueldo_mensual],
    ['dias_laborables', (r) => r.dias_laborables],
    ['faltas', (r) => r.faltas],
    ['retardos', (r) => r.retardos],
    ['dias_vacaciones', (r) => r.dias_vacaciones],
    ['dias_permiso_con_goce', (r) => r.dias_permiso_con_goce],
    ['dias_sin_goce', (r) => r.dias_sin_goce],
    ['dias_incapacidad', (r) => r.dias_incapacidad],
    ['percepcion_sueldo', (r) => r.percepciones?.sueldo],
    ['prima_vacacional', (r) => r.percepciones?.prima_vacacional],
    ['deducciones', (r) => suma(r.deducciones)],
    ['neto_estimado', (r) => r.neto_estimado],
    ['costo_empresa', (r) => r.costo_empresa],
    ['banderas', (r) => (r.banderas || []).join(' | ')],
  ]
  const celda = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const filas = [cols.map(([c]) => celda(c)).join(','), ...recibos.map((r) => cols.map(([, f]) => celda(f(r))).join(','))]
  const blob = new Blob(['﻿' + filas.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `prenomina-${periodo}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
