import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection } from 'firebase/firestore'
import { BrainCircuit, Plus, Trash2 } from 'lucide-react'
import { api, db, mensajeError } from '../firebase.js'
import { useColeccion, useEnVivo } from '../lib/datos.js'
import { hace, ms, normal, num } from '../lib/formato.js'
import { Boton, CampoBusqueda, Campo, Cargando, Encabezado, ErrorCaja, Pastilla, Resaltar, Selector, Vacio, claseEntrada, useAviso, useDebounce } from '../components/ui.jsx'
import { useBloqueo } from '../lib/auth.jsx'
import Cerebrito from '../components/Cerebrito.jsx'

const TEMAS_BASE = ['hecho', 'decisión', 'preferencia', 'contexto']

export default function Memoria() {
  const { datos, cargando, error } = useEnVivo(() => collection(db, 'memoria'), [])
  const colaboradores = useColeccion('colaboradores')
  const [tema, setTema] = useState('todos')
  const [texto, setTexto] = useState('')
  const q = useDebounce(texto)
  const [formulario, setFormulario] = useState(false)
  const bloqueo = useBloqueo()

  const temas = useMemo(() => [...new Set([...TEMAS_BASE, ...datos.map((m) => m.tema).filter(Boolean)])], [datos])
  const nombre = (id) => colaboradores.datos.find((c) => (c.id_colaborador ?? c.id) === id)?.nombre
  const lista = useMemo(() => {
    const t = normal(q)
    return datos
      .filter((m) => tema === 'todos' || m.tema === tema)
      .filter((m) => !t || normal(m.texto).includes(t) || normal(m.entidad).includes(t))
      .sort((a, b) => ms(b.creada) - ms(a.creada))
  }, [datos, tema, q])

  return (
    <div>
      <Encabezado titulo="Memoria" subtitulo="Hechos, decisiones y preferencias que los agentes leen antes de responder. Se guardan cuando tú o un agente los registran.">
        <Boton variante="tinta" icono={Plus} {...bloqueo} onClick={() => setFormulario((f) => !f)}>Agregar nota</Boton>
      </Encabezado>

      {formulario && <Nueva temas={temas} colaboradores={colaboradores.datos} onListo={() => setFormulario(false)} />}

      {!cargando && !error && datos.length > 0 && (
        <section className="mb-5 flex flex-wrap items-center gap-5 rounded-4xl border border-linea bg-white p-5">
          <Cerebrito tam={76} />
          <div className="min-w-0 flex-1">
            <p className="text-[28px] font-semibold leading-none tracking-titulo">{num(datos.length)} <span className="text-[15px] font-medium text-humo">notas en memoria</span></p>
            <p className="mt-1.5 text-[13.5px] text-humo">Los agentes las leen antes de cada respuesta.</p>
          </div>
          <ul className="flex flex-wrap gap-2">
            {temas.map((t) => ({ t, n: datos.filter((m) => m.tema === t).length })).filter((x) => x.n).map(({ t, n }) => (
              <li key={t}><button onClick={() => setTema(tema === t ? 'todos' : t)} className={`rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors ${tema === t ? 'border-tinta bg-tinta text-white' : 'border-linea hover:bg-panel'}`}>{t[0].toUpperCase() + t.slice(1)} · {num(n)}</button></li>
            ))}
          </ul>
        </section>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <CampoBusqueda valor={texto} onCambio={setTexto} placeholder="Buscar en la memoria" className="w-full sm:w-[280px]" />
        <Selector valor={tema} onCambio={setTema} opciones={[{ valor: 'todos', etiqueta: 'Todos los temas' }, ...temas.map((t) => ({ valor: t, etiqueta: t[0].toUpperCase() + t.slice(1) }))]} />
        <span className="text-[13px] text-humo">{num(lista.length)} notas</span>
      </div>

      {error ? <ErrorCaja error={error}>No se pudo leer la memoria.</ErrorCaja> : cargando ? <Cargando lineas={5} /> : lista.length === 0 ? (
        datos.length ? <Vacio icono={BrainCircuit} titulo="Sin notas con este filtro" texto="Prueba con otro tema o con otra búsqueda." /> : (
          <div className="grid place-items-center rounded-4xl border border-dashed border-borde px-6 py-12 text-center">
            <Cerebrito tam={120} />
            <p className="mt-4 font-semibold">La memoria está vacía</p>
            <p className="mt-1 max-w-[46ch] text-[14px] text-humo">Cuéntale algo durable a un agente (una decisión, un acuerdo con RH) o agrégalo aquí.</p>
          </div>
        )
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {lista.map((m, i) => <Nota key={m.id} m={m} i={i} q={q} nombre={nombre(m.entidad)} puede={!bloqueo.disabled} />)}
        </ul>
      )}
    </div>
  )
}

function Nota({ m, nombre, i, q, puede }) {
  const avisar = useAviso()
  const [confirmar, setConfirmar] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const borrar = async () => {
    setBorrando(true)
    try {
      await api.borrarMemoria({ id: m.id })
      avisar('Nota borrada')
    } catch (e) {
      avisar(mensajeError(e), 'error')
      setBorrando(false)
    }
  }
  return (
    <li style={{ '--i': i }} className="anim-entrar flex flex-col rounded-3xl border border-linea p-5 transition-colors hover:border-borde">
      <div className="flex flex-wrap items-center gap-1.5">
        {m.tema && <Pastilla tono="neutro">{m.tema}</Pastilla>}
        {m.entidad && (
          <Link to={`/colaboradores?id=${encodeURIComponent(m.entidad)}`} className="rounded-full border border-borde px-2.5 py-0.5 text-[12px] font-medium hover:bg-panel">
            <Resaltar texto={nombre ? `${nombre} · ${m.entidad}` : m.entidad} q={q} />
          </Link>
        )}
      </div>
      <p className="mt-3 flex-1 whitespace-pre-wrap text-[14px] leading-relaxed"><Resaltar texto={m.texto} q={q} /></p>
      <div className="mt-4 flex items-center justify-between gap-2">
        <p className="text-[12px] text-humo">{m.fuente === 'agente' ? `Agente${m.autor ? ` · ${m.autor}` : ''}` : m.autor || 'Usuario'} · {hace(m.creada)}</p>
        {!puede ? null : confirmar ? (
          <span className="flex gap-1.5">
            <Boton tam="ch" variante="fantasma" onClick={() => setConfirmar(false)}>Cancelar</Boton>
            <Boton tam="ch" variante="peligro" cargando={borrando} onClick={borrar}>Borrar</Boton>
          </span>
        ) : (
          <button onClick={() => setConfirmar(true)} className="grid h-8 w-8 place-items-center rounded-lg text-humo hover:bg-panel hover:text-rojo" aria-label="Borrar nota">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </li>
  )
}

function Nueva({ temas, colaboradores, onListo }) {
  const avisar = useAviso()
  const [f, setF] = useState({ texto: '', tema: 'hecho', entidad: '' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const guardar = async (e) => {
    e.preventDefault()
    setError('')
    const entidad = f.entidad.trim().toUpperCase()
    if (entidad && !colaboradores.some((c) => (c.id_colaborador ?? c.id) === entidad)) {
      return setError(`No existe el colaborador ${entidad}. Usa el ID (por ejemplo OTC003), nunca el nombre.`)
    }
    setGuardando(true)
    try {
      await api.guardarMemoria({ texto: f.texto.trim(), tema: f.tema, ...(entidad ? { entidad } : {}) })
      avisar('Nota guardada')
      onListo()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setGuardando(false)
    }
  }
  return (
    <form onSubmit={guardar} className="mb-8 space-y-4 rounded-3xl bg-panel p-5 sm:p-6">
      <Campo etiqueta="Nota"><textarea required rows={3} value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} placeholder="Ej. RH acordó que las bajas de 2024 sin causa se capturarán con entrevistas de salida." className={claseEntrada} /></Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Tema">
          <select value={f.tema} onChange={(e) => setF({ ...f, tema: e.target.value })} className={claseEntrada}>
            {temas.map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Colaborador (opcional)" ayuda="ID del colaborador; la memoria se liga por ID, no por nombre.">
          <input list="ids-colaboradores" value={f.entidad} onChange={(e) => setF({ ...f, entidad: e.target.value })} placeholder="OTC003" className={claseEntrada} />
          <datalist id="ids-colaboradores">
            {colaboradores.map((c) => <option key={c.id} value={c.id_colaborador ?? c.id}>{c.nombre}</option>)}
          </datalist>
        </Campo>
      </div>
      {error && <ErrorCaja>{error}</ErrorCaja>}
      <div className="flex justify-end gap-2">
        <Boton onClick={onListo}>Cancelar</Boton>
        <Boton type="submit" variante="primario" cargando={guardando}>Guardar nota</Boton>
      </div>
    </form>
  )
}
