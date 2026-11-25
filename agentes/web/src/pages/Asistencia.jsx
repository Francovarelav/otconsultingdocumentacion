import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, query, where } from 'firebase/firestore'
import { ChevronLeft, ChevronRight, Clock, Settings2 } from 'lucide-react'
import { api, db, mensajeError } from '../firebase.js'
import { useSesion } from '../lib/auth.jsx'
import { useColeccion, useDocVivo, useEnVivo } from '../lib/datos.js'
import { hoyISO, normal, num, pct } from '../lib/formato.js'
import { DIAS_CORTOS, JORNADA_BASE, deISO, esLaboral, iso, lunesDe, minutosAHoras, sumarDias } from '../lib/fechas.js'
import Checador from '../components/Checador.jsx'
import { AnalisisAsistencia } from '../components/GraficasOperacion.jsx'
import {
  Base, Boton, CampoBusqueda, Campo, Cargando, Cifra, Contador, Encabezado, ErrorCaja, Panel, Pastilla, Pestanas, Resaltar, Selector, Tabla, Vacio,
  claseEntrada, useAviso, useDebounce,
} from '../components/ui.jsx'

export default function Asistencia() {
  const { esAdmin, esColaborador, idColaborador } = useSesion()
  const jornadaDoc = useDocVivo(['config', 'jornada'])
  const jornada = { ...JORNADA_BASE, ...(jornadaDoc.datos || {}) }
  const [vista, setVista] = useState(() => (esColaborador ? 'dia' : 'analisis'))
  const [editar, setEditar] = useState(false)

  return (
    <div>
      <Encabezado
        titulo={esColaborador ? 'Checar' : 'Asistencia'}
        subtitulo={esColaborador ? 'Registra tu entrada y tu salida. Tu historial queda en tu ficha.' : 'Entradas, salidas y retardos contra la jornada configurada. Las faltas cuentan solo desde que inició el registro.'}
      >
        {esAdmin && <Boton icono={Settings2} onClick={() => setEditar(true)}>Jornada</Boton>}
      </Encabezado>

      <Checador jornada={jornada} />

      <div className="mt-8">
        <Pestanas
          tam="ch"
          valor={vista}
          onCambio={setVista}
          opciones={[...(esColaborador ? [] : [{ valor: 'analisis', etiqueta: 'Análisis' }]), { valor: 'dia', etiqueta: esColaborador ? 'Mis registros' : 'Por día' }, { valor: 'semana', etiqueta: 'Semana' }]}
          className="mb-5"
        />
        {vista === 'analisis' && !esColaborador ? (
          <AnalisisAsistencia jornada={jornada} />
        ) : vista === 'dia' ? (
          esColaborador ? <MisRegistros id={idColaborador} /> : <PorDia jornada={jornada} />
        ) : (
          <Semana jornada={jornada} soloId={esColaborador ? idColaborador : null} />
        )}
      </div>

      <Panel abierto={editar} onCerrar={() => setEditar(false)} titulo="Jornada laboral" subtitulo="Base para retardos, faltas y prenómina.">
        {editar && <EditorJornada jornada={jornada} onListo={() => setEditar(false)} />}
      </Panel>
    </div>
  )
}

const retardoPill = (r) =>
  r.retardo_min > 0 ? <Pastilla tono="suave">{r.retardo_min} min tarde</Pastilla> : <Pastilla tono="contorno">Puntual</Pastilla>

// ------------------------------------------------------------ tabla del día
function PorDia({ jornada }) {
  const [dia, setDia] = useState(hoyISO())
  const [texto, setTexto] = useState('')
  const q = useDebounce(texto)
  const [filtro, setFiltro] = useState('todos')
  const { datos, cargando, error } = useEnVivo(() => query(collection(db, 'asistencia'), where('fecha', '==', dia)), [dia])
  const colaboradores = useColeccion('colaboradores')
  const activos = colaboradores.datos.filter((c) => c.es_plantilla !== 0 && c.estatus === 'Activo')
  const laboral = esLaboral(deISO(dia), jornada)
  const checaron = new Set(datos.map((r) => r.id_colaborador))
  const sinChecar = laboral ? activos.filter((c) => !checaron.has(c.id_colaborador ?? c.id)) : []

  const filas = useMemo(() => {
    const t = normal(q)
    return datos
      .filter((r) => filtro === 'todos' || (filtro === 'retardo' ? r.retardo_min > 0 : r.estado === filtro))
      .filter((r) => !t || normal(r.nombre).includes(t) || normal(r.id_colaborador).includes(t))
      .sort((a, b) => String(a.hora_entrada).localeCompare(String(b.hora_entrada)))
  }, [datos, q, filtro])

  const puntuales = datos.filter((r) => !(r.retardo_min > 0)).length
  const cerradas = datos.filter((r) => r.minutos_trabajados != null)
  const promedio = cerradas.length ? cerradas.reduce((s, r) => s + r.minutos_trabajados, 0) / cerradas.length : null

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tarjeta i={0}><Cifra etiqueta="Checaron" valor={<Contador valor={datos.length} />} base={laboral && activos.length ? <Base n={datos.length} de={activos.length} que="activos" /> : null} /></Tarjeta>
        <Tarjeta i={1}><Cifra etiqueta="Puntuales" valor={datos.length ? <Contador valor={(puntuales / datos.length) * 100} formato={pct} /> : '—'} detalle={`${num(datos.length - puntuales)} con retardo`} /></Tarjeta>
        <Tarjeta i={2}><Cifra etiqueta="Promedio trabajado" valor={promedio == null ? '—' : minutosAHoras(promedio)} detalle={`Sobre ${num(cerradas.length)} jornadas cerradas`} /></Tarjeta>
        <Tarjeta i={3}><Cifra etiqueta="Sin checar" valor={laboral ? <Contador valor={sinChecar.length} /> : '—'} resaltar={sinChecar.length > 0} detalle={laboral ? 'Activos sin registro este día' : 'Día no laboral'} /></Tarjeta>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={dia} max={hoyISO()} onChange={(e) => e.target.value && setDia(e.target.value)} aria-label="Día" className="h-9 rounded-lg border border-borde bg-white px-2.5 text-[13px]" />
        <CampoBusqueda valor={texto} onCambio={setTexto} placeholder="Nombre o ID" className="w-full sm:w-[240px]" />
        <Selector valor={filtro} onCambio={setFiltro} opciones={[{ valor: 'todos', etiqueta: 'Todos' }, { valor: 'retardo', etiqueta: 'Con retardo' }, { valor: 'abierta', etiqueta: 'Sin salida' }, { valor: 'cerrada', etiqueta: 'Cerradas' }]} />
      </div>

      {error ? <ErrorCaja error={error}>No se pudo leer la asistencia.</ErrorCaja> : cargando ? <Cargando lineas={6} /> : datos.length === 0 ? (
        <Vacio icono={Clock} titulo="Nadie ha checado este día" texto="Los registros aparecen en cuanto alguien cheque desde el portal o RH lo registre." />
      ) : (
        <Tabla
          minimo={760}
          filas={filas}
          claveFila={(r) => r.id}
          vacio="Ningún registro coincide."
          columnas={[
            { titulo: 'Colaborador', celda: (r) => <Link to={`/colaboradores/${encodeURIComponent(r.id_colaborador)}`} className="font-medium hover:text-rojo"><Resaltar texto={r.nombre || r.id_colaborador} q={q} /><span className="block text-[12px] font-normal text-humo"><Resaltar texto={r.id_colaborador} q={q} /></span></Link> },
            { titulo: 'Entrada', celda: (r) => <span className="tabular">{r.hora_entrada || '—'}</span> },
            { titulo: 'Retardo', celda: retardoPill },
            { titulo: 'Salida', celda: (r) => (r.hora_salida ? <span className="tabular">{r.hora_salida}</span> : <Pastilla tono="contorno">Abierta</Pastilla>) },
            { titulo: 'Trabajado', derecha: true, celda: (r) => minutosAHoras(r.minutos_trabajados) },
            { titulo: 'Origen', celda: (r) => <span className="text-[12.5px] text-humo">{r.origen === 'rh' ? `RH${r.registrado_por ? ` · ${r.registrado_por}` : ''}` : 'Portal'}{r.nota && ` · ${r.nota}`}</span> },
          ]}
        />
      )}

      {sinChecar.length > 0 && (
        <details className="rounded-2xl border border-linea px-4 py-3">
          <summary className="cursor-pointer text-[13.5px] font-medium">Activos sin registro ({num(sinChecar.length)})</summary>
          <p className="mt-2 text-[12.5px] text-humo">No es una falta todavía: puede tener vacaciones, permiso o no haber checado. La prenómina lo resuelve contra las solicitudes aprobadas.</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {sinChecar.map((c) => (
              <li key={c.id}><Link to={`/colaboradores/${encodeURIComponent(c.id_colaborador ?? c.id)}`} className="inline-block rounded-full border border-linea px-2.5 py-0.5 text-[12px] transition-colors hover:border-borde hover:bg-panel">{c.nombre}</Link></li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function Tarjeta({ i, children }) {
  return <div style={{ '--i': i }} className="anim-entrar rounded-3xl border border-linea bg-white p-5 transition-colors hover:border-borde">{children}</div>
}

// ------------------------------------------------------------ registros propios
export function MisRegistros({ id, limite = 31 }) {
  const { datos, cargando, error } = useEnVivo(() => (id ? query(collection(db, 'asistencia'), where('id_colaborador', '==', id)) : null), [id])
  const filas = [...datos].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, limite)
  if (error) return <ErrorCaja error={error}>No se pudo leer la asistencia.</ErrorCaja>
  if (cargando) return <Cargando lineas={4} />
  if (!filas.length) return <Vacio icono={Clock} titulo="Sin registros de asistencia" texto="Aparecerán aquí desde la primera checada." />
  const conRetardo = filas.filter((r) => r.retardo_min > 0).length
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-humo">Últimos {num(filas.length)} días con registro · {num(conRetardo)} con retardo</p>
      <Tabla
        minimo={560}
        filas={filas}
        claveFila={(r) => r.id}
        columnas={[
          { titulo: 'Fecha', celda: (r) => <span className="tabular">{r.fecha}</span> },
          { titulo: 'Entrada', celda: (r) => r.hora_entrada || '—' },
          { titulo: 'Retardo', celda: retardoPill },
          { titulo: 'Salida', celda: (r) => r.hora_salida || <Pastilla tono="contorno">Abierta</Pastilla> },
          { titulo: 'Trabajado', derecha: true, celda: (r) => minutosAHoras(r.minutos_trabajados) },
        ]}
      />
    </div>
  )
}

// ------------------------------------------------------------ semana tipo calendario
function Semana({ jornada, soloId }) {
  const [lunes, setLunes] = useState(() => lunesDe(new Date()))
  const [texto, setTexto] = useState('')
  const q = useDebounce(texto)
  const dias = Array.from({ length: 7 }, (_, k) => sumarDias(lunes, k))
  const desde = iso(dias[0])
  const hasta = iso(dias[6])
  // Rango sobre un solo campo (sin índice compuesto). El colaborador filtra por su ID.
  const { datos, cargando, error } = useEnVivo(
    () => (soloId ? query(collection(db, 'asistencia'), where('id_colaborador', '==', soloId)) : query(collection(db, 'asistencia'), where('fecha', '>=', desde), where('fecha', '<=', hasta))),
    [soloId, desde, hasta],
  )
  const semana = datos.filter((r) => r.fecha >= desde && r.fecha <= hasta)
  const personas = useMemo(() => {
    const m = new Map()
    for (const r of semana) {
      if (!m.has(r.id_colaborador)) m.set(r.id_colaborador, { id: r.id_colaborador, nombre: r.nombre, dias: {} })
      m.get(r.id_colaborador).dias[r.fecha] = r
    }
    const t = normal(q)
    return [...m.values()].filter((p) => !t || normal(p.nombre).includes(t) || normal(p.id).includes(t)).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'))
  }, [semana, q])
  const hoy = hoyISO()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-xl border border-borde">
          <button onClick={() => setLunes((l) => sumarDias(l, -7))} className="grid h-9 w-9 place-items-center rounded-l-xl hover:bg-panel" aria-label="Semana anterior"><ChevronLeft className="h-4 w-4" /></button>
          <span className="px-2 text-[13px] font-medium tabular">{desde} – {hasta}</span>
          <button onClick={() => setLunes((l) => sumarDias(l, 7))} className="grid h-9 w-9 place-items-center rounded-r-xl hover:bg-panel" aria-label="Semana siguiente"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <Boton tam="ch" variante="fantasma" onClick={() => setLunes(lunesDe(new Date()))}>Esta semana</Boton>
        {!soloId && <CampoBusqueda valor={texto} onCambio={setTexto} placeholder="Nombre o ID" className="w-full sm:w-[220px]" />}
        <ul className="ml-auto flex flex-wrap gap-3 text-[12px] text-humo">
          <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-tinta" />Puntual</li>
          <li className="flex items-center gap-1.5"><span className="grad-ot h-3 w-3 rounded" />Retardo</li>
          <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-tinta" />Sin salida</li>
          <li className="flex items-center gap-1.5"><span className="rayado h-3 w-3 rounded bg-panel" />Sin registro</li>
        </ul>
      </div>
      {error ? <ErrorCaja error={error}>No se pudo leer la semana.</ErrorCaja> : cargando ? <Cargando lineas={5} /> : personas.length === 0 ? (
        <Vacio icono={Clock} titulo="Sin checadas esta semana" texto="Cambia de semana o espera a que el equipo cheque." />
      ) : (
        <div className="scroll-fino overflow-x-auto rounded-3xl border border-linea">
          <table className="w-full min-w-[720px] border-separate border-spacing-0 text-[12.5px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 border-b border-linea bg-white px-4 py-2.5 text-left font-medium text-humo">Colaborador</th>
                {dias.map((d, k) => (
                  <th key={k} className={`border-b border-linea px-1 py-2.5 text-center font-medium ${iso(d) === hoy ? 'text-rojo' : 'text-humo'}`}>
                    {DIAS_CORTOS[k]} <span className="tabular">{d.getDate()}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {personas.map((p, i) => (
                <tr key={p.id} style={{ '--i': i }} className="anim-entrar">
                  <td className="sticky left-0 z-10 border-b border-linea bg-white px-4 py-2">
                    <Link to={`/colaboradores/${encodeURIComponent(p.id)}`} className="font-medium hover:text-rojo"><Resaltar texto={p.nombre || p.id} q={q} /></Link>
                  </td>
                  {dias.map((d) => {
                    const f = iso(d)
                    const r = p.dias[f]
                    const laboral = esLaboral(d, jornada)
                    const pasado = f < hoy
                    const tono = r ? (r.estado === 'abierta' && pasado ? 'border border-tinta bg-white text-tinta' : r.retardo_min > 0 ? 'grad-ot text-white' : 'bg-tinta text-white') : laboral && pasado ? 'rayado bg-panel text-humo' : 'bg-panel/40 text-gris'
                    return (
                      <td key={f} className="border-b border-linea p-1 text-center">
                        <span title={r ? `${r.hora_entrada || '—'} – ${r.hora_salida || 'sin salida'}${r.retardo_min > 0 ? ` · ${r.retardo_min} min tarde` : ''}` : laboral ? 'Sin registro' : 'No laboral'} className={`mx-auto grid h-9 w-full max-w-[84px] place-items-center rounded-lg text-[11.5px] font-medium tabular ${tono}`}>
                          {r ? r.hora_entrada : laboral && pasado ? '—' : ''}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------ jornada (admin)
function EditorJornada({ jornada, onListo }) {
  const avisar = useAviso()
  const [f, setF] = useState({
    hora_entrada: jornada.hora_entrada,
    hora_salida: jornada.hora_salida,
    tolerancia_min: jornada.tolerancia_min,
    horas_jornada: jornada.horas_jornada,
    dias_laborales: jornada.dias_laborales || [1, 2, 3, 4, 5],
    inicio_registro: jornada.inicio_registro || hoyISO(),
    zona: jornada.zona || 'America/Monterrey',
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const dia = (n) => setF({ ...f, dias_laborales: f.dias_laborales.includes(n) ? f.dias_laborales.filter((x) => x !== n) : [...f.dias_laborales, n].sort() })
  const guardar = async (e) => {
    e.preventDefault()
    setGuardando(true)
    setError('')
    try {
      await api.guardarJornada({ ...f, tolerancia_min: Number(f.tolerancia_min), horas_jornada: Number(f.horas_jornada) })
      avisar('Jornada guardada')
      onListo()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setGuardando(false)
    }
  }
  return (
    <form onSubmit={guardar} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Entrada"><input type="time" required value={f.hora_entrada} onChange={(e) => setF({ ...f, hora_entrada: e.target.value })} className={claseEntrada} /></Campo>
        <Campo etiqueta="Salida"><input type="time" required value={f.hora_salida} onChange={(e) => setF({ ...f, hora_salida: e.target.value })} className={claseEntrada} /></Campo>
        <Campo etiqueta="Tolerancia (min)"><input type="number" min={0} max={120} value={f.tolerancia_min} onChange={(e) => setF({ ...f, tolerancia_min: e.target.value })} className={claseEntrada} /></Campo>
        <Campo etiqueta="Horas por jornada"><input type="number" min={1} max={12} step="0.5" value={f.horas_jornada} onChange={(e) => setF({ ...f, horas_jornada: e.target.value })} className={claseEntrada} /></Campo>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium">Días laborales</legend>
        <div className="flex gap-1.5">
          {DIAS_CORTOS.map((d, k) => (
            <button key={k} type="button" onClick={() => dia(k + 1)} aria-pressed={f.dias_laborales.includes(k + 1)} className={`h-10 w-10 rounded-xl text-[13px] font-semibold transition-colors ${f.dias_laborales.includes(k + 1) ? 'grad-ot text-white' : 'border border-borde hover:bg-panel'}`}>{d}</button>
          ))}
        </div>
      </fieldset>
      <Campo etiqueta="Inicio del registro" ayuda="Las faltas solo cuentan desde esta fecha; antes no hay datos y no se inventan.">
        <input type="date" value={f.inicio_registro} onChange={(e) => setF({ ...f, inicio_registro: e.target.value })} className={claseEntrada} />
      </Campo>
      {error && <ErrorCaja>{error}</ErrorCaja>}
      <Boton type="submit" variante="primario" cargando={guardando} className="w-full">Guardar jornada</Boton>
    </form>
  )
}
