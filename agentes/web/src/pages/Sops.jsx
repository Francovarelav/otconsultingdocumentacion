import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { collection } from 'firebase/firestore'
import { BookOpenCheck, Bot, Pencil, Plus } from 'lucide-react'
import { api, db, mensajeError } from '../firebase.js'
import { useSesion } from '../lib/auth.jsx'
import { useEnVivo } from '../lib/datos.js'
import { fecha, normal } from '../lib/formato.js'
import { AGENTES, nombreAgente } from '../lib/agentes.js'
import { Boton, CampoBusqueda, Campo, Cargando, Resaltar, useDebounce, Encabezado, ErrorCaja, Pastilla, Vacio, claseEntrada, useAviso } from '../components/ui.jsx'

export default function Sops() {
  const { esAdmin } = useSesion()
  const { datos, cargando, error } = useEnVivo(() => collection(db, 'sops'), [])
  const sops = useMemo(() => [...datos].sort((a, b) => a.id.localeCompare(b.id, 'es', { numeric: true })), [datos])
  const [editando, setEditando] = useState(null) // null | 'nuevo' | id
  const [params] = useSearchParams()
  const [sel, setSel] = useState(() => params.get('id'))
  useEffect(() => {
    const id = params.get('id')
    if (id) { setSel(id); setEditando(null) }
  }, [params])
  const [texto, setTexto] = useState('')
  const q = useDebounce(texto)
  const visibles = useMemo(() => {
    const b = normal(q)
    return sops.filter((x) => !b || [x.id, x.titulo, x.objetivo, x.disparador, ...(x.pasos || [])].some((c) => normal(c).includes(b)))
  }, [sops, q])

  useEffect(() => {
    if (!sel && sops.length) setSel(sops[0].id)
  }, [sops, sel])
  const actual = sops.find((s) => s.id === sel)

  return (
    <div>
      <Encabezado titulo="SOPs" subtitulo="Procedimientos que los agentes siguen paso a paso. Cada uno está escrito a partir de las 20 reglas de negocio.">
        {esAdmin && <Boton variante="tinta" icono={Plus} onClick={() => setEditando('nuevo')}>Nuevo SOP</Boton>}
      </Encabezado>

      {error ? <ErrorCaja error={error}>No se pudieron leer los SOPs.</ErrorCaja> : cargando ? <Cargando lineas={6} /> : sops.length === 0 && editando !== 'nuevo' ? (
        <Vacio icono={BookOpenCheck} titulo="Aún no hay SOPs" texto="Los SOPs semilla se cargan con el script de carga a Firestore." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <div>
          <CampoBusqueda valor={texto} onCambio={setTexto} placeholder="Buscar en SOPs" className="mb-3" />
          {visibles.length === 0 && <p className="px-2 text-[13px] text-humo">Ningún SOP coincide.</p>}
          <ul className="space-y-1">
            {visibles.map((s, i) => (
              <li key={s.id} style={{ '--i': i }} className="anim-lado">
                <button
                  onClick={() => { setSel(s.id); setEditando(null) }}
                  className={`w-full rounded-2xl px-4 py-3 text-left transition-colors ${s.id === sel && !editando ? 'bg-linea' : 'hover:bg-panel'}`}
                >
                  <span className="block font-mono text-[12px] text-humo"><Resaltar texto={s.id} q={q} /></span>
                  <span className="block font-medium leading-snug"><Resaltar texto={s.titulo} q={q} /></span>
                </button>
              </li>
            ))}
          </ul>
          </div>

          <div className="min-w-0">
            {editando ? (
              <Editor sop={editando === 'nuevo' ? null : actual} existentes={sops.map((s) => s.id)} onListo={(id) => { setEditando(null); if (id) setSel(id) }} />
            ) : actual ? (
              <Detalle s={actual} esAdmin={esAdmin} onEditar={() => setEditando(actual.id)} />
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}

function Detalle({ s, esAdmin, onEditar }) {
  const navegar = useNavigate()
  return (
    <article key={s.id} className="anim-entrar rounded-3xl border border-linea p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[12.5px] text-humo">{s.id}{s.version != null && ` · versión ${s.version}`}{s.actualizada && ` · ${fecha(s.actualizada)}`}</p>
          <h2 className="mt-1 text-[24px] font-semibold leading-tight tracking-titulo">{s.titulo}</h2>
        </div>
        {esAdmin && <Boton tam="ch" icono={Pencil} onClick={onEditar}>Editar</Boton>}
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        <div><dt className="text-[12px] text-humo">Objetivo</dt><dd className="mt-1 text-[14px]">{s.objetivo || '—'}</dd></div>
        <div><dt className="text-[12px] text-humo">Disparador</dt><dd className="mt-1 text-[14px]">{s.disparador || '—'}</dd></div>
      </dl>

      <div className="mt-5 flex flex-wrap items-center gap-1.5">
        <Pastilla tono="tinta">{nombreAgente(s.agente)}</Pastilla>
        {(s.reglas || []).map((r) => <Pastilla key={r} tono="contorno">Regla {r}</Pastilla>)}
      </div>

      <h3 className="mt-8 text-[15px] font-semibold tracking-apretado">Pasos</h3>
      <ol className="mt-3 space-y-2">
        {(s.pasos || []).map((p, i) => (
          <li key={i} style={{ '--i': i }} className="anim-entrar flex gap-3 rounded-2xl bg-panel px-4 py-3 text-[14px]">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-white text-[12px] font-semibold tabular">{i + 1}</span>
            <span className="pt-0.5">{p}</span>
          </li>
        ))}
      </ol>

      {s.agente && (
        <Boton
          className="mt-6"
          variante="secundario"
          icono={Bot}
          onClick={() => navegar(`/agente/${s.agente}?q=${encodeURIComponent(`Ejecuta el ${s.id} (${s.titulo}) paso a paso y dime qué encontraste.`)}`)}
        >
          Pedirle a {nombreAgente(s.agente)} que lo ejecute
        </Boton>
      )}
    </article>
  )
}

function Editor({ sop, existentes, onListo }) {
  const avisar = useAviso()
  const [f, setF] = useState(() => ({
    id: sop?.id || '',
    titulo: sop?.titulo || '',
    objetivo: sop?.objetivo || '',
    disparador: sop?.disparador || '',
    pasos: (sop?.pasos || []).join('\n'),
    reglas: (sop?.reglas || []).join(', '),
    agente: sop?.agente || 'asistente',
  }))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const cambia = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const guardar = async (e) => {
    e.preventDefault()
    setError('')
    const id = f.id.trim().toUpperCase()
    if (!sop && existentes.includes(id)) return setError(`Ya existe ${id}.`)
    const reglas = f.reglas.split(/[,\s]+/).map((x) => parseInt(x, 10)).filter((n) => n >= 1 && n <= 20)
    const pasos = f.pasos.split('\n').map((x) => x.trim()).filter(Boolean)
    if (!pasos.length) return setError('Agrega al menos un paso.')
    setGuardando(true)
    try {
      await api.guardarSop({ id, titulo: f.titulo.trim(), objetivo: f.objetivo.trim(), disparador: f.disparador.trim(), pasos, reglas, agente: f.agente })
      avisar(`${id} guardado`)
      onListo(id)
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={guardar} className="space-y-4 rounded-3xl border border-linea p-6 sm:p-8">
      <h2 className="text-[20px] font-semibold tracking-apretado">{sop ? `Editar ${sop.id}` : 'Nuevo SOP'}</h2>
      <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
        <Campo etiqueta="Clave"><input required disabled={!!sop} value={f.id} onChange={cambia('id')} placeholder="SOP-08" pattern="SOP-\d{2,}" className={`${claseEntrada} disabled:bg-panel`} /></Campo>
        <Campo etiqueta="Título"><input required value={f.titulo} onChange={cambia('titulo')} className={claseEntrada} /></Campo>
      </div>
      <Campo etiqueta="Objetivo"><textarea rows={2} value={f.objetivo} onChange={cambia('objetivo')} className={claseEntrada} /></Campo>
      <Campo etiqueta="Disparador"><input value={f.disparador} onChange={cambia('disparador')} placeholder="Ej. la rutina detecta una baja sin causa" className={claseEntrada} /></Campo>
      <Campo etiqueta="Pasos" ayuda="Un paso por línea, en orden."><textarea rows={8} value={f.pasos} onChange={cambia('pasos')} className={`${claseEntrada} font-mono text-[13px]`} /></Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Reglas vinculadas" ayuda="Números del 1 al 20, separados por coma."><input value={f.reglas} onChange={cambia('reglas')} placeholder="6, 7" className={claseEntrada} /></Campo>
        <Campo etiqueta="Agente">
          <select value={f.agente} onChange={cambia('agente')} className={claseEntrada}>
            {AGENTES.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </Campo>
      </div>
      {error && <ErrorCaja>{error}</ErrorCaja>}
      <div className="flex justify-end gap-2">
        <Boton onClick={() => onListo(null)}>Cancelar</Boton>
        <Boton type="submit" variante="primario" cargando={guardando}>Guardar</Boton>
      </div>
    </form>
  )
}
