import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, query, where } from 'firebase/firestore'
import { CalendarDays, Check, ChevronLeft, ChevronRight, Plus, Undo2, X } from 'lucide-react'
import { api, db, mensajeError } from '../firebase.js'
import { useSesion } from '../lib/auth.jsx'
import { useDocVivo, useEnVivo } from '../lib/datos.js'
import { hace, hoyISO, humano, ms, normal, num } from '../lib/formato.js'
import { DIAS_CORTOS, JORNADA_BASE, MESES, diaSemana, diasHabiles, esLaboral, festivos, iso, sumarDias } from '../lib/fechas.js'
import Saldo from '../components/Saldo.jsx'
import { AnalisisVacaciones } from '../components/GraficasOperacion.jsx'
import SelectorColaborador from '../components/SelectorColaborador.jsx'
import {
  Boton, CampoBusqueda, Campo, Cargando, Encabezado, ErrorCaja, Iniciales, Panel, Pastilla, Pestanas, Resaltar, Selector, Vacio,
  claseEntrada, useAviso, useDebounce,
} from '../components/ui.jsx'

export const TIPOS_AUSENCIA = {
  vacaciones: 'Vacaciones',
  permiso_con_goce: 'Permiso con goce',
  permiso_sin_goce: 'Permiso sin goce',
  incapacidad: 'Incapacidad',
}
const ORDEN = { pendiente: 0, aprobada: 1, rechazada: 2, cancelada: 3 }

export default function Vacaciones() {
  const { esColaborador, idColaborador, puedeOperar } = useSesion()
  const jornada = { ...JORNADA_BASE, ...(useDocVivo(['config', 'jornada']).datos || {}) }
  const sol = useEnVivo(
    () => (esColaborador ? (idColaborador ? query(collection(db, 'vacaciones'), where('id_colaborador', '==', idColaborador)) : null) : collection(db, 'vacaciones')),
    [esColaborador, idColaborador],
  )
  const [vista, setVista] = useState(() => (esColaborador ? 'solicitudes' : 'analisis'))
  const [nueva, setNueva] = useState(false)
  const pendientes = sol.datos.filter((s) => s.estado === 'pendiente').length
  const puedePedir = puedeOperar || (esColaborador && idColaborador)

  return (
    <div>
      <Encabezado
        titulo={esColaborador ? 'Mis vacaciones' : 'Vacaciones y permisos'}
        subtitulo="Días según la LFT (art. 76) desde la fecha de ingreso; la solicitud queda pendiente hasta que RH la apruebe."
      >
        {puedePedir && <Boton variante="primario" icono={Plus} onClick={() => setNueva(true)}>Solicitar</Boton>}
      </Encabezado>

      <Pestanas
        tam="ch"
        className="mb-5"
        valor={vista}
        onCambio={setVista}
        opciones={[
          ...(esColaborador ? [] : [{ valor: 'analisis', etiqueta: 'Análisis' }]),
          { valor: 'solicitudes', etiqueta: 'Solicitudes', n: pendientes || null },
          { valor: 'calendario', etiqueta: 'Calendario' },
          { valor: 'saldos', etiqueta: esColaborador ? 'Mi saldo' : 'Saldos' },
        ]}
      />

      {sol.error ? <ErrorCaja error={sol.error}>No se pudieron leer las solicitudes.</ErrorCaja> : vista === 'analisis' && !esColaborador ? (
        sol.cargando ? <Cargando lineas={5} /> : <AnalisisVacaciones datos={sol.datos} jornada={jornada} />
      ) : vista === 'solicitudes' ? (
        <Solicitudes datos={sol.datos} cargando={sol.cargando} />
      ) : vista === 'calendario' ? (
        <Calendario datos={sol.datos} jornada={jornada} />
      ) : (
        <Saldos />
      )}

      <Panel abierto={nueva} onCerrar={() => setNueva(false)} titulo="Nueva solicitud" subtitulo="Los días hábiles excluyen fines de semana y festivos de ley.">
        {nueva && <Formulario jornada={jornada} onListo={() => setNueva(false)} />}
      </Panel>
    </div>
  )
}

// ------------------------------------------------------------ solicitudes
function Solicitudes({ datos, cargando }) {
  const { esColaborador } = useSesion()
  const [texto, setTexto] = useState('')
  const q = useDebounce(texto)
  const [estado, setEstado] = useState('todas')
  const [tipo, setTipo] = useState('todos')
  const lista = useMemo(() => {
    const t = normal(q)
    return datos
      .filter((s) => estado === 'todas' || s.estado === estado)
      .filter((s) => tipo === 'todos' || s.tipo === tipo)
      .filter((s) => !t || [s.nombre, s.id_colaborador, s.motivo].some((x) => normal(x).includes(t)))
      .sort((a, b) => (ORDEN[a.estado] ?? 9) - (ORDEN[b.estado] ?? 9) || ms(b.creada) - ms(a.creada))
  }, [datos, q, estado, tipo])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {!esColaborador && <CampoBusqueda valor={texto} onCambio={setTexto} placeholder="Nombre, ID o motivo" className="w-full sm:w-[240px]" />}
        <Selector valor={estado} onCambio={setEstado} opciones={[{ valor: 'todas', etiqueta: 'Todos los estados' }, ...Object.keys(ORDEN).map((k) => ({ valor: k, etiqueta: humano(k) + 's' }))]} />
        <Selector valor={tipo} onCambio={setTipo} opciones={[{ valor: 'todos', etiqueta: 'Todos los tipos' }, ...Object.entries(TIPOS_AUSENCIA).map(([k, v]) => ({ valor: k, etiqueta: v }))]} />
      </div>
      {cargando ? <Cargando lineas={5} /> : lista.length === 0 ? (
        <Vacio icono={CalendarDays} titulo={datos.length ? 'Sin solicitudes con estos filtros' : 'Aún no hay solicitudes'} texto="Las solicitudes de vacaciones y permisos aparecerán aquí, las pendientes primero." />
      ) : (
        <ul className="space-y-2">
          {lista.map((s, i) => <Solicitud key={s.id} s={s} i={i} q={q} />)}
        </ul>
      )}
    </div>
  )
}

function Solicitud({ s, i, q }) {
  const { puedeOperar, esColaborador, idColaborador } = useSesion()
  const avisar = useAviso()
  const [ocupado, setOcupado] = useState(null)
  const resolver = async (decision) => {
    setOcupado(decision)
    try {
      await api.resolverVacaciones({ id: s.id, decision })
      avisar(decision === 'aprobar' ? 'Solicitud aprobada' : decision === 'rechazar' ? 'Solicitud rechazada' : 'Solicitud cancelada')
    } catch (e) {
      avisar(mensajeError(e), 'error')
    } finally {
      setOcupado(null)
    }
  }
  const propia = esColaborador && s.id_colaborador === idColaborador
  const tono = { pendiente: 'suave', aprobada: 'tinta', rechazada: 'contorno', cancelada: 'neutro' }[s.estado] || 'neutro'
  return (
    <li style={{ '--i': i }} className="anim-entrar flex flex-col gap-3 rounded-3xl border border-linea p-4 transition-colors hover:border-borde sm:flex-row sm:items-center">
      <Iniciales nombre={s.nombre} />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {esColaborador ? TIPOS_AUSENCIA[s.tipo] || humano(s.tipo) : <Link to={`/colaboradores/${encodeURIComponent(s.id_colaborador)}`} className="hover:text-rojo"><Resaltar texto={s.nombre || s.id_colaborador} q={q} /></Link>}
          <span className="ml-2 text-[12.5px] font-normal text-humo">{!esColaborador && `${TIPOS_AUSENCIA[s.tipo] || humano(s.tipo)} · `}{s.inicio} → {s.fin}</span>
        </p>
        <p className="mt-0.5 text-[12.5px] text-humo">
          <b className="font-semibold text-tinta">{num(s.dias_habiles)}</b> día{s.dias_habiles === 1 ? '' : 's'} hábil{s.dias_habiles === 1 ? '' : 'es'}
          {s.motivo && <> · <Resaltar texto={s.motivo} q={q} /></>} · solicitada {hace(s.creada)}
          {s.resuelta_por && ` · resuelta por ${s.resuelta_por}`}
        </p>
      </div>
      <Pastilla tono={tono}>{humano(s.estado)}</Pastilla>
      {s.estado === 'pendiente' && (
        <div className="flex gap-1.5">
          {puedeOperar && (
            <>
              <Boton tam="ch" icono={X} cargando={ocupado === 'rechazar'} disabled={!!ocupado} onClick={() => resolver('rechazar')}>Rechazar</Boton>
              <Boton tam="ch" variante="primario" icono={Check} cargando={ocupado === 'aprobar'} disabled={!!ocupado} onClick={() => resolver('aprobar')}>Aprobar</Boton>
            </>
          )}
          {(propia || puedeOperar) && (
            <Boton tam="ch" variante="fantasma" icono={Undo2} cargando={ocupado === 'cancelar'} disabled={!!ocupado} onClick={() => resolver('cancelar')}>Cancelar</Boton>
          )}
        </div>
      )}
    </li>
  )
}

// ------------------------------------------------------------ formulario
function Formulario({ jornada, onListo }) {
  const { esColaborador, idColaborador } = useSesion()
  const avisar = useAviso()
  const [f, setF] = useState({ id_colaborador: esColaborador ? idColaborador : '', tipo: 'vacaciones', inicio: hoyISO(), fin: hoyISO(), motivo: '' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const habiles = diasHabiles(f.inicio, f.fin, jornada)

  const enviar = async (e) => {
    e.preventDefault()
    setError('')
    if (!f.id_colaborador) return setError('Elige al colaborador.')
    if (f.fin < f.inicio) return setError('La fecha de fin no puede ser anterior al inicio.')
    if (!habiles) return setError('El rango no incluye días hábiles.')
    setGuardando(true)
    try {
      const res = await api.solicitarVacaciones({ ...(esColaborador ? {} : { id_colaborador: f.id_colaborador }), tipo: f.tipo, inicio: f.inicio, fin: f.fin, motivo: f.motivo.trim() })
      avisar(`Solicitud enviada: ${num(res?.dias_habiles ?? habiles)} días hábiles`)
      onListo()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      {!esColaborador && (
        <Campo etiqueta="Colaborador"><SelectorColaborador valor={f.id_colaborador} onCambio={(id) => setF({ ...f, id_colaborador: id })} requerido /></Campo>
      )}
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium">Tipo</legend>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(TIPOS_AUSENCIA).map(([k, v]) => (
            <label key={k} className={`cursor-pointer rounded-xl border px-3 py-2.5 text-[13.5px] transition-colors ${f.tipo === k ? 'border-[#FF8A6A] bg-[#FFF6F2] font-medium' : 'border-linea hover:border-borde'}`}>
              <input type="radio" name="tipo" value={k} checked={f.tipo === k} onChange={() => setF({ ...f, tipo: k })} className="sr-only" />
              {v}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Inicio"><input type="date" required value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value, fin: e.target.value > f.fin ? e.target.value : f.fin })} className={claseEntrada} /></Campo>
        <Campo etiqueta="Fin"><input type="date" required min={f.inicio} value={f.fin} onChange={(e) => setF({ ...f, fin: e.target.value })} className={claseEntrada} /></Campo>
      </div>
      <div className="flex items-center justify-between rounded-2xl bg-panel px-4 py-3">
        <span className="text-[13px] text-humo">Días hábiles (estimado)</span>
        <span className="texto-grad text-[26px] font-semibold tracking-titulo tabular">{habiles}</span>
      </div>
      <Campo etiqueta="Motivo (opcional)"><textarea rows={2} value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} className={claseEntrada} /></Campo>
      {f.tipo === 'vacaciones' && f.id_colaborador && (
        <div className="rounded-2xl border border-linea p-4"><Saldo id={f.id_colaborador} compacto /></div>
      )}
      {error && <ErrorCaja>{error}</ErrorCaja>}
      <Boton type="submit" variante="primario" cargando={guardando} className="w-full">Enviar solicitud</Boton>
    </form>
  )
}

// ------------------------------------------------------------ calendario mensual
function Calendario({ datos, jornada }) {
  const [mes, setMes] = useState(() => { const h = new Date(); return new Date(h.getFullYear(), h.getMonth(), 1) })
  const [verPendientes, setVerPendientes] = useState(true)
  const primero = mes
  const inicioGrid = sumarDias(primero, -(diaSemana(primero) - 1))
  const celdas = Array.from({ length: 42 }, (_, k) => sumarDias(inicioGrid, k))
  const fest = festivos(mes.getFullYear())
  const hoy = hoyISO()
  const ausencias = datos.filter((s) => s.estado === 'aprobada' || (verPendientes && s.estado === 'pendiente'))
  const delDia = (f) => ausencias.filter((s) => s.inicio <= f && s.fin >= f)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-xl border border-borde">
          <button onClick={() => setMes((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} className="grid h-9 w-9 place-items-center rounded-l-xl hover:bg-panel" aria-label="Mes anterior"><ChevronLeft className="h-4 w-4" /></button>
          <span className="min-w-[150px] px-2 text-center text-[14px] font-semibold capitalize">{MESES[mes.getMonth()]} {mes.getFullYear()}</span>
          <button onClick={() => setMes((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} className="grid h-9 w-9 place-items-center rounded-r-xl hover:bg-panel" aria-label="Mes siguiente"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <label className="inline-flex items-center gap-2 text-[13px] text-humo"><input type="checkbox" checked={verPendientes} onChange={(e) => setVerPendientes(e.target.checked)} className="accent-rojo" />Incluir pendientes</label>
        <ul className="ml-auto flex flex-wrap gap-3 text-[12px] text-humo">
          <li className="flex items-center gap-1.5"><span className="grad-ot h-3 w-3 rounded" />Aprobada</li>
          <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-dashed border-rojo" />Pendiente</li>
          <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-panel" />Festivo / no laboral</li>
        </ul>
      </div>
      <div className="grid grid-cols-7 overflow-hidden rounded-3xl border border-linea">
        {DIAS_CORTOS.map((d, k) => <div key={k} className="border-b border-linea bg-white py-2 text-center text-[12px] font-medium text-humo">{d}</div>)}
        {celdas.map((d, k) => {
          const f = iso(d)
          const fuera = d.getMonth() !== mes.getMonth()
          const lista = delDia(f)
          const laboral = esLaboral(d, jornada)
          return (
            <div key={f} style={{ '--i': k % 7 }} className={`anim-entrar min-h-[92px] border-b border-r border-linea p-1.5 ${fuera ? 'bg-panel/40' : !laboral ? 'bg-panel/70' : 'bg-white'} ${(k + 1) % 7 === 0 ? 'border-r-0' : ''}`}>
              <div className="mb-1 flex items-center justify-between">
                <span className={`grid h-6 min-w-6 place-items-center rounded-md px-1 text-[12px] tabular ${f === hoy ? 'grad-ot font-semibold text-white' : fuera ? 'text-gris' : 'text-tinta'}`}>{d.getDate()}</span>
                {fest.has(f) && !fuera && <span className="text-[10.5px] text-humo">Festivo</span>}
              </div>
              <ul className="space-y-0.5">
                {lista.slice(0, 3).map((s) => (
                  <li key={s.id} title={`${s.nombre} · ${TIPOS_AUSENCIA[s.tipo] || s.tipo} · ${s.estado}`} className={`truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium ${s.estado === 'aprobada' ? 'grad-ot text-white' : 'border border-dashed border-rojo/60 text-rojo-hondo'}`}>
                    {String(s.nombre || s.id_colaborador).split(' ')[0]}
                  </li>
                ))}
                {lista.length > 3 && <li className="px-1.5 text-[11px] text-humo">+{lista.length - 3} más</li>}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ------------------------------------------------------------ saldos
function Saldos() {
  const { esColaborador, idColaborador } = useSesion()
  const [id, setId] = useState(esColaborador ? idColaborador : '')
  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      {!esColaborador && (
        <div>
          <p className="mb-1.5 text-[13px] font-medium">Colaborador</p>
          <SelectorColaborador valor={id} onCambio={setId} />
          <p className="mt-2 text-[12px] text-humo">El saldo lo calcula el servidor con la antigüedad (LFT art. 76) y las solicitudes aprobadas y pendientes.</p>
        </div>
      )}
      <div className="rounded-3xl border border-linea p-6">
        <Saldo id={id} />
      </div>
    </div>
  )
}
