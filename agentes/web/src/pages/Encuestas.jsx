import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection } from 'firebase/firestore'
import {
  ArrowDown, ArrowLeft, ArrowUp, BarChart3, BrainCircuit, Check, ClipboardList, Copy, ExternalLink, FilePlus2, Lock, LockOpen,
  Pencil, Plus, Trash2,
} from 'lucide-react'
import { api, db, mensajeError } from '../firebase.js'
import { useSesion } from '../lib/auth.jsx'
import { useDocVivo, useEnVivo } from '../lib/datos.js'
import { fecha, hace, ms, normal, num } from '../lib/formato.js'
import Qr from '../components/Qr.jsx'
import {
  Boton, CampoBusqueda, Campo, Cargando, Contador, Encabezado, ErrorCaja, Falta, Panel, Pastilla, Resaltar,
  Selector, Vacio, claseEntrada, useAviso, useDebounce,
} from '../components/ui.jsx'

// ============================================================ catálogos de la UI
const TIPOS_ENCUESTA = {
  enps: 'eNPS',
  clima: 'Clima laboral',
  pulso: 'Pulso',
  salida: 'Salida',
  formulario: 'Formulario',
}
const TIPOS_PREGUNTA = {
  escala: 'Escala',
  nps: 'NPS 0–10',
  opcion: 'Opción única',
  multiple: 'Opción múltiple',
  si_no: 'Sí / No',
  texto: 'Texto libre',
}
const ESTADOS = {
  borrador: { etiqueta: 'Borrador', tono: 'neutro' },
  abierta: { etiqueta: 'Abierta', tono: 'rojo' },
  cerrada: { etiqueta: 'Cerrada', tono: 'contorno' },
}

const nuevoId = (usados = []) => {
  let id
  do { id = `p${Math.random().toString(36).slice(2, 7)}` } while (usados.includes(id))
  return id
}

function pregunta(tipo, texto = '', extra = {}) {
  const base = { id: extra.id || nuevoId(), tipo, texto, requerida: extra.requerida ?? true }
  if (tipo === 'escala') return { ...base, min: extra.min ?? 1, max: extra.max ?? 5 }
  if (tipo === 'opcion' || tipo === 'multiple') return { ...base, opciones: extra.opciones ?? ['Opción 1', 'Opción 2'] }
  return base
}

const ITEMS_CLIMA = [
  'Tengo claro lo que se espera de mí en mi trabajo.',
  'Cuento con las herramientas y el equipo que necesito para hacer bien mi trabajo.',
  'Mi líder me da retroalimentación útil y a tiempo.',
  'Siento que mi trabajo es reconocido.',
  'Tengo oportunidades reales de aprender y crecer en OT Consulting.',
  'La comunicación entre áreas es clara y oportuna.',
  'Puedo equilibrar mi vida personal y mi trabajo.',
  'Mi carga de trabajo es razonable.',
  'Confío en las decisiones de la dirección.',
  'Me siento parte del equipo con el que trabajo.',
  'Mi compensación es justa para lo que aporto.',
  'Recomendaría trabajar en OT Consulting a un amigo.',
]

const CAUSAS_RESPALDO = [
  'Mejor oferta salarial',
  'Crecimiento profesional',
  'Ambiente de trabajo',
  'Relación con el líder',
  'Carga de trabajo',
  'Cambio de residencia',
  'Motivos personales o familiares',
  'Estudios',
  'Término de proyecto o contrato',
  'Otra',
]

function causasDeCatalogo(doc) {
  const valores = doc?.valores
  if (!Array.isArray(valores) || !valores.length) return null
  const lista = valores
    .map((v) => (typeof v === 'string' ? v : v?.causa_baja || v?.nombre || v?.valor))
    .filter(Boolean)
  return lista.length ? lista : null
}

function plantilla(clave, causas) {
  switch (clave) {
    case 'enps':
      return {
        titulo: 'eNPS trimestral',
        descripcion: 'Dos preguntas. Tus respuestas son anónimas.',
        tipo: 'enps',
        anonima: true,
        publica: true,
        preguntas: [
          pregunta('nps', '¿Qué tan probable es que recomiendes OT Consulting como lugar para trabajar?'),
          pregunta('texto', '¿Qué es lo más importante que podríamos mejorar?', { requerida: false }),
        ],
      }
    case 'clima':
      return {
        titulo: 'Clima laboral',
        descripcion: 'Califica cada afirmación de 1 (totalmente en desacuerdo) a 5 (totalmente de acuerdo). Es anónima.',
        tipo: 'clima',
        anonima: true,
        publica: true,
        preguntas: [
          ...ITEMS_CLIMA.map((t) => pregunta('escala', t)),
          pregunta('texto', '¿Algo más que quieras contarnos?', { requerida: false }),
        ],
      }
    case 'pulso':
      return {
        titulo: 'Pulso semanal',
        descripcion: 'Tres preguntas rápidas sobre tu semana.',
        tipo: 'pulso',
        anonima: true,
        publica: true,
        preguntas: [
          pregunta('escala', '¿Cómo te sentiste esta semana en el trabajo?'),
          pregunta('si_no', '¿Tuviste algún bloqueo que no pudiste resolver?'),
          pregunta('texto', '¿Qué te ayudaría la próxima semana?', { requerida: false }),
        ],
      }
    case 'salida':
      return {
        titulo: 'Encuesta de salida',
        descripcion: 'Nos ayuda a entender por qué te vas. La causa se propone a RH para su revisión; nada se registra sin aprobación.',
        tipo: 'salida',
        anonima: false,
        publica: false,
        preguntas: [
          pregunta('opcion', '¿Cuál fue la causa principal de tu salida?', { id: 'causa', opciones: causas || CAUSAS_RESPALDO }),
          pregunta('escala', '¿Qué tan satisfecho estuviste con tu experiencia en OT Consulting?'),
          pregunta('texto', '¿Qué habría hecho que te quedaras?', { requerida: false }),
        ],
      }
    default:
      return { titulo: '', descripcion: '', tipo: 'formulario', anonima: true, publica: true, preguntas: [] }
  }
}

const PLANTILLAS = [
  { clave: 'enps', titulo: 'eNPS', texto: 'Una pregunta NPS y un comentario.' },
  { clave: 'clima', titulo: 'Clima laboral', texto: '12 afirmaciones en escala 1–5 y un comentario.' },
  { clave: 'pulso', titulo: 'Pulso semanal', texto: 'Tres preguntas rápidas.' },
  { clave: 'salida', titulo: 'Encuesta de salida', texto: 'Causa de baja con el catálogo, satisfacción y comentario.' },
  { clave: 'blanco', titulo: 'En blanco', texto: 'Arma tu propio formulario.' },
]

const enlacePublico = (id) => `${location.origin}/f/${id}`

// ============================================================ página
export default function Encuestas() {
  const { puedeOperar } = useSesion()
  return puedeOperar ? <Gestion /> : <Abiertas />
}

/** Vista para colaborador / lector: solo encuestas abiertas. */
function Abiertas() {
  const { datos, cargando, error } = useEnVivo(() => collection(db, 'encuestas'), [])
  const abiertas = datos.filter((e) => e.estado === 'abierta').sort((a, b) => ms(b.creada) - ms(a.creada))
  return (
    <div>
      <Encabezado titulo="Encuestas" subtitulo="Tu opinión llega directo a RH. Las encuestas anónimas no guardan quién respondió." />
      {error ? (
        <ErrorCaja error={error}>No se pudieron leer las encuestas.</ErrorCaja>
      ) : cargando ? (
        <Cargando lineas={4} />
      ) : abiertas.length === 0 ? (
        <Vacio icono={ClipboardList} titulo="No hay encuestas abiertas" texto="Cuando RH abra una encuesta, aparecerá aquí para que la respondas." />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {abiertas.map((e, i) => (
            <li key={e.id} style={{ '--i': i }} className="anim-entrar flex flex-col rounded-3xl border border-linea p-5 transition-colors hover:border-borde">
              <div className="flex flex-wrap items-center gap-1.5">
                <Pastilla tono="neutro">{TIPOS_ENCUESTA[e.tipo] || 'Encuesta'}</Pastilla>
                {e.anonima && <Pastilla tono="contorno"><Lock className="h-3 w-3" />Anónima</Pastilla>}
              </div>
              <h3 className="mt-3 text-[17px] font-semibold tracking-apretado">{e.titulo}</h3>
              {e.descripcion && <p className="mt-1 text-[13.5px] text-humo">{e.descripcion}</p>}
              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-[12.5px] text-humo">
                  {num(e.preguntas?.length || 0)} preguntas{e.cierra && ` · cierra el ${fecha(e.cierra)}`}
                </span>
                <Link to={`/f/${e.id}`} className="grad-ot grad-ot-hover inline-flex h-9 items-center gap-1.5 rounded-xl px-4 text-[13.5px] font-medium text-white">
                  Responder
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ============================================================ gestión (admin / rh)
function Gestion() {
  const { datos, cargando, error } = useEnVivo(() => collection(db, 'encuestas'), [])
  const [vista, setVista] = useState({ modo: 'lista' }) // lista | editar | resultados
  const [elegir, setElegir] = useState(false)
  const [texto, setTexto] = useState('')
  const q = useDebounce(texto)
  const [estado, setEstado] = useState('todas')

  const lista = useMemo(() => {
    const b = normal(q)
    return datos
      .filter((e) => estado === 'todas' || e.estado === estado)
      .filter((e) => !b || [e.titulo, e.descripcion, TIPOS_ENCUESTA[e.tipo]].some((c) => normal(c).includes(b)))
      .sort((a, b2) => (a.estado === 'abierta' ? -1 : 0) - (b2.estado === 'abierta' ? -1 : 0) || ms(b2.creada) - ms(a.creada))
  }, [datos, q, estado])

  if (vista.modo === 'editar') {
    return <Editor inicial={vista.encuesta} onSalir={() => setVista({ modo: 'lista' })} />
  }
  if (vista.modo === 'resultados') {
    const e = datos.find((x) => x.id === vista.id)
    return <Resultados encuesta={e} id={vista.id} onSalir={() => setVista({ modo: 'lista' })} />
  }

  return (
    <div>
      <Encabezado titulo="Encuestas" subtitulo="eNPS, clima, pulso y salida. Comparte el enlace o el QR; los resultados se recalculan con cada respuesta.">
        <Boton variante="primario" icono={Plus} onClick={() => setElegir(true)}>Nueva encuesta</Boton>
      </Encabezado>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <CampoBusqueda valor={texto} onCambio={setTexto} placeholder="Buscar encuesta" className="w-full sm:w-[280px]" />
        <Selector
          valor={estado}
          onCambio={setEstado}
          opciones={[{ valor: 'todas', etiqueta: 'Todos los estados' }, ...Object.entries(ESTADOS).map(([k, v]) => ({ valor: k, etiqueta: v.etiqueta }))]}
        />
        <span className="text-[13px] text-humo">{num(lista.length)} encuestas</span>
      </div>

      {error ? (
        <ErrorCaja error={error}>No se pudieron leer las encuestas.</ErrorCaja>
      ) : cargando ? (
        <Cargando lineas={5} />
      ) : datos.length === 0 ? (
        <Vacio icono={ClipboardList} titulo="Aún no hay encuestas" texto="Empieza con una plantilla: eNPS, clima laboral, pulso semanal o encuesta de salida.">
          <Boton variante="primario" icono={Plus} onClick={() => setElegir(true)}>Nueva encuesta</Boton>
        </Vacio>
      ) : lista.length === 0 ? (
        <Vacio titulo="Sin coincidencias" texto="Cambia la búsqueda o el filtro de estado." />
      ) : (
        <ul className="space-y-3">
          {lista.map((e, i) => (
            <FilaEncuesta
              key={e.id}
              e={e}
              i={i}
              q={q}
              onEditar={() => setVista({ modo: 'editar', encuesta: e })}
              onResultados={() => setVista({ modo: 'resultados', id: e.id })}
            />
          ))}
        </ul>
      )}

      <Panel abierto={elegir} onCerrar={() => setElegir(false)} titulo="Nueva encuesta" subtitulo="Elige una plantilla; podrás editar todas las preguntas antes de abrirla.">
        <ElegirPlantilla onElegir={(enc) => { setElegir(false); setVista({ modo: 'editar', encuesta: enc }) }} />
      </Panel>
    </div>
  )
}

function ElegirPlantilla({ onElegir }) {
  const cat = useDocVivo(['catalogos', 'cat_causa_baja'])
  const causas = causasDeCatalogo(cat.datos)
  return (
    <ul className="space-y-2">
      {PLANTILLAS.map((p, i) => (
        <li key={p.clave} style={{ '--i': i }} className="anim-entrar">
          <button
            onClick={() => onElegir({ ...plantilla(p.clave, causas), estado: 'borrador' })}
            className="flex w-full items-start gap-3 rounded-2xl border border-linea p-4 text-left transition-colors hover:border-[#FFB59A] hover:bg-[#FFF6F2]"
          >
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${p.clave === 'blanco' ? 'bg-panel text-tinta' : 'grad-ot text-white'}`}>
              {p.clave === 'blanco' ? <FilePlus2 className="h-4 w-4" /> : <ClipboardList className="h-4 w-4" />}
            </span>
            <span className="min-w-0">
              <span className="block font-medium">{p.titulo}</span>
              <span className="block text-[12.5px] text-humo">{p.texto}</span>
              {p.clave === 'salida' && (
                <span className="mt-1 block text-[12px] text-humo">
                  {causas ? `Usa las ${causas.length} causas del catálogo.` : cat.cargando ? 'Leyendo el catálogo de causas…' : 'El catálogo no se pudo leer: usa causas genéricas editables.'}
                </span>
              )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function FilaEncuesta({ e, i, q, onEditar, onResultados }) {
  const avisar = useAviso()
  const [ocupado, setOcupado] = useState(false)
  const [compartir, setCompartir] = useState(false)
  const est = ESTADOS[e.estado] || ESTADOS.borrador

  const cambiar = async (estado) => {
    setOcupado(true)
    try {
      await api.cambiarEstadoEncuesta({ id: e.id, estado })
      avisar(estado === 'abierta' ? 'Encuesta abierta' : 'Encuesta cerrada')
    } catch (err) {
      avisar(mensajeError(err), 'error')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <li style={{ '--i': i }} className="anim-entrar rounded-3xl border border-linea p-5 transition-colors hover:border-borde">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Pastilla tono={est.tono}>{est.etiqueta}</Pastilla>
            <Pastilla tono="neutro">{TIPOS_ENCUESTA[e.tipo] || 'Encuesta'}</Pastilla>
            {e.anonima && <Pastilla tono="contorno"><Lock className="h-3 w-3" />Anónima</Pastilla>}
            {e.publica && <Pastilla tono="contorno">Pública</Pastilla>}
          </div>
          <h3 className="mt-2 text-[17px] font-semibold tracking-apretado"><Resaltar texto={e.titulo || 'Sin título'} q={q} /></h3>
          <p className="mt-0.5 text-[12.5px] text-humo">
            {num(e.preguntas?.length || 0)} preguntas · {num(e.total_respuestas || 0)} respuestas
            {e.cierra && ` · cierra el ${fecha(e.cierra)}`}
            {e.creada && ` · creada ${hace(e.creada)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Boton tam="ch" icono={BarChart3} onClick={onResultados}>Resultados</Boton>
          <Boton tam="ch" icono={Pencil} onClick={onEditar}>Editar</Boton>
          {e.estado === 'abierta' ? (
            <Boton tam="ch" variante="tinta" icono={Lock} cargando={ocupado} onClick={() => cambiar('cerrada')}>Cerrar</Boton>
          ) : (
            <Boton tam="ch" variante="primario" icono={LockOpen} cargando={ocupado} onClick={() => cambiar('abierta')}>
              {e.estado === 'cerrada' ? 'Reabrir' : 'Abrir'}
            </Boton>
          )}
          {e.estado === 'abierta' && (
            <Boton tam="ch" variante="fantasma" icono={ExternalLink} onClick={() => setCompartir((c) => !c)} aria-expanded={compartir}>
              Compartir
            </Boton>
          )}
        </div>
      </div>
      {compartir && e.estado === 'abierta' && <Compartir e={e} />}
    </li>
  )
}

function Compartir({ e }) {
  const [copiado, setCopiado] = useState(false)
  const url = enlacePublico(e.id)
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch { /* se puede copiar a mano */ }
  }
  return (
    <div className="anim-escala mt-4 flex flex-col gap-5 rounded-2xl bg-panel p-4 sm:flex-row sm:items-center">
      <Qr texto={url} nombre={`encuesta-${e.id}`} tam={140} />
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium">Enlace {e.publica ? 'público' : 'interno'}</p>
        <p className="mt-0.5 text-[12.5px] text-humo">
          {e.publica ? 'Cualquiera con el enlace puede responder, sin iniciar sesión.' : 'No es pública: solo la pueden responder personas con sesión en el sistema.'}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <code className="min-w-0 flex-1 select-all truncate rounded-xl border border-linea bg-white px-3 py-2 font-mono text-[12.5px]">{url}</code>
          <Boton tam="md" variante={copiado ? 'tinta' : 'primario'} icono={copiado ? Check : Copy} onClick={copiar}>{copiado ? 'Copiado' : 'Copiar'}</Boton>
        </div>
      </div>
    </div>
  )
}

// ============================================================ constructor
function Editor({ inicial, onSalir }) {
  const avisar = useAviso()
  const [f, setF] = useState(() => ({
    titulo: inicial?.titulo || '',
    descripcion: inicial?.descripcion || '',
    tipo: inicial?.tipo || 'formulario',
    anonima: inicial?.anonima ?? true,
    publica: inicial?.publica ?? true,
    cierra: inicial?.cierra || '',
    preguntas: (inicial?.preguntas || []).map((p) => ({ ...p })),
  }))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const id = inicial?.id

  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const setP = (i, cambio) => setF((x) => ({ ...x, preguntas: x.preguntas.map((p, j) => (j === i ? { ...p, ...cambio } : p)) }))
  const mover = (i, d) => setF((x) => {
    const ps = [...x.preguntas]
    const j = i + d
    if (j < 0 || j >= ps.length) return x
    ;[ps[i], ps[j]] = [ps[j], ps[i]]
    return { ...x, preguntas: ps }
  })
  const quitar = (i) => setF((x) => ({ ...x, preguntas: x.preguntas.filter((_, j) => j !== i) }))
  const agregar = (tipo) => setF((x) => ({ ...x, preguntas: [...x.preguntas, { ...pregunta(tipo), id: nuevoId(x.preguntas.map((p) => p.id)) }] }))
  const cambiarTipo = (i, tipo) => setF((x) => ({
    ...x,
    preguntas: x.preguntas.map((p, j) => (j === i ? pregunta(tipo, p.texto, { id: p.id, requerida: p.requerida, opciones: p.opciones }) : p)),
  }))

  const guardar = async () => {
    setError('')
    if (!f.titulo.trim()) return setError('Escribe un título.')
    if (!f.preguntas.length) return setError('Agrega al menos una pregunta.')
    const vacia = f.preguntas.findIndex((p) => !String(p.texto || '').trim())
    if (vacia >= 0) return setError(`La pregunta ${vacia + 1} no tiene texto.`)
    const sinOpciones = f.preguntas.findIndex((p) => (p.tipo === 'opcion' || p.tipo === 'multiple') && (p.opciones || []).filter((o) => o.trim()).length < 2)
    if (sinOpciones >= 0) return setError(`La pregunta ${sinOpciones + 1} necesita al menos dos opciones.`)
    const escalaMala = f.preguntas.findIndex((p) => p.tipo === 'escala' && !(Number(p.max) > Number(p.min)))
    if (escalaMala >= 0) return setError(`En la pregunta ${escalaMala + 1} el máximo debe ser mayor que el mínimo.`)

    const preguntas = f.preguntas.map((p) => {
      const base = { id: p.id, tipo: p.tipo, texto: p.texto.trim(), requerida: !!p.requerida }
      if (p.tipo === 'escala') return { ...base, min: Number(p.min), max: Number(p.max) }
      if (p.tipo === 'opcion' || p.tipo === 'multiple') return { ...base, opciones: p.opciones.map((o) => o.trim()).filter(Boolean) }
      return base
    })
    setGuardando(true)
    try {
      await api.guardarEncuesta({
        ...(id ? { id } : {}),
        titulo: f.titulo.trim(),
        descripcion: f.descripcion.trim(),
        tipo: f.tipo,
        anonima: f.anonima,
        publica: f.publica,
        cierra: f.cierra || null,
        preguntas,
      })
      avisar(id ? 'Encuesta guardada' : 'Encuesta creada como borrador')
      onSalir()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setGuardando(false)
    }
  }

  const conRespuestas = (inicial?.total_respuestas || 0) > 0

  return (
    <div>
      <button onClick={onSalir} className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-humo hover:text-tinta">
        <ArrowLeft className="h-4 w-4" /> Encuestas
      </button>
      <Encabezado titulo={id ? 'Editar encuesta' : 'Nueva encuesta'} subtitulo="Se guarda como borrador. Ábrela desde la lista cuando esté lista.">
        <Boton onClick={onSalir}>Cancelar</Boton>
        <Boton variante="primario" cargando={guardando} onClick={guardar}>Guardar</Boton>
      </Encabezado>

      {conRespuestas && (
        <div className="mb-5">
          <ErrorCaja>Esta encuesta ya tiene {num(inicial.total_respuestas)} respuestas. Cambiar o quitar preguntas puede dejar resultados sin pregunta.</ErrorCaja>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <section className="space-y-4 self-start rounded-3xl border border-linea p-5 lg:sticky lg:top-6">
          <Campo etiqueta="Título"><input value={f.titulo} onChange={(e) => set('titulo', e.target.value)} className={claseEntrada} placeholder="Ej. Clima laboral 2026" /></Campo>
          <Campo etiqueta="Descripción"><textarea rows={3} value={f.descripcion} onChange={(e) => set('descripcion', e.target.value)} className={claseEntrada} /></Campo>
          <Campo etiqueta="Tipo">
            <select value={f.tipo} onChange={(e) => set('tipo', e.target.value)} className={claseEntrada}>
              {Object.entries(TIPOS_ENCUESTA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Cierra el (opcional)"><input type="date" value={f.cierra} onChange={(e) => set('cierra', e.target.value)} className={claseEntrada} /></Campo>
          <Interruptor etiqueta="Anónima" texto="No se guarda quién respondió." valor={f.anonima} onCambio={(v) => set('anonima', v)} />
          <Interruptor etiqueta="Pública" texto="Se responde con el enlace, sin iniciar sesión." valor={f.publica} onCambio={(v) => set('publica', v)} />
          {f.tipo === 'salida' && f.anonima && (
            <p className="text-[12px] text-humo">En una encuesta de salida anónima no se puede proponer la causa de baja de nadie.</p>
          )}
          {error && <ErrorCaja>{error}</ErrorCaja>}
        </section>

        <section>
          {f.preguntas.length === 0 ? (
            <Vacio icono={ClipboardList} titulo="Sin preguntas" texto="Agrega la primera pregunta con los botones de abajo." />
          ) : (
            <ol className="space-y-3">
              {f.preguntas.map((p, i) => (
                <EditorPregunta
                  key={p.id}
                  p={p}
                  i={i}
                  total={f.preguntas.length}
                  onCambio={(c) => setP(i, c)}
                  onTipo={(t) => cambiarTipo(i, t)}
                  onMover={(d) => mover(i, d)}
                  onQuitar={() => quitar(i)}
                />
              ))}
            </ol>
          )}
          <div className="mt-4 rounded-3xl border border-dashed border-borde p-4">
            <p className="mb-2 text-[12.5px] font-medium text-humo">Agregar pregunta</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(TIPOS_PREGUNTA).map(([k, v]) => (
                <Boton key={k} tam="ch" icono={Plus} onClick={() => agregar(k)}>{v}</Boton>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function Interruptor({ etiqueta, texto, valor, onCambio }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-linea p-3 transition-colors hover:border-borde">
      <span>
        <span className="block text-[13.5px] font-medium">{etiqueta}</span>
        <span className="block text-[12px] text-humo">{texto}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={valor}
        onClick={() => onCambio(!valor)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${valor ? 'grad-ot' : 'bg-linea'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] duration-200 ${valor ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </label>
  )
}

function EditorPregunta({ p, i, total, onCambio, onTipo, onMover, onQuitar }) {
  const fija = p.id === 'causa'
  return (
    <li style={{ '--i': i }} className="anim-entrar rounded-3xl border border-linea bg-white p-4 transition-colors hover:border-borde">
      <div className="flex items-start gap-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-panel text-[12px] font-semibold tabular">{i + 1}</span>
        <div className="min-w-0 flex-1 space-y-3">
          <textarea
            rows={2}
            value={p.texto}
            onChange={(e) => onCambio({ texto: e.target.value })}
            placeholder="Escribe la pregunta"
            aria-label={`Texto de la pregunta ${i + 1}`}
            className={`${claseEntrada} resize-y`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={p.tipo}
              disabled={fija}
              onChange={(e) => onTipo(e.target.value)}
              aria-label="Tipo de pregunta"
              className="h-9 rounded-lg border border-borde bg-white px-2.5 text-[13px] font-medium focus:border-tinta focus:outline-none disabled:bg-panel"
            >
              {Object.entries(TIPOS_PREGUNTA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {p.tipo === 'escala' && (
              <span className="inline-flex items-center gap-1.5 text-[13px]">
                <input type="number" value={p.min ?? 1} onChange={(e) => onCambio({ min: e.target.value })} aria-label="Mínimo" className="h-9 w-16 rounded-lg border border-borde px-2 text-[13px]" />
                <span className="text-humo">a</span>
                <input type="number" value={p.max ?? 5} onChange={(e) => onCambio({ max: e.target.value })} aria-label="Máximo" className="h-9 w-16 rounded-lg border border-borde px-2 text-[13px]" />
              </span>
            )}
            <label className="inline-flex items-center gap-1.5 text-[13px] text-humo">
              <input type="checkbox" checked={!!p.requerida} onChange={(e) => onCambio({ requerida: e.target.checked })} className="accent-rojo" />
              Requerida
            </label>
            {fija && <span className="text-[12px] text-humo">Pregunta <code className="font-mono">causa</code>: alimenta la propuesta de causa de baja.</span>}
          </div>
          {(p.tipo === 'opcion' || p.tipo === 'multiple') && (
            <Campo etiqueta="Opciones" ayuda="Una por línea.">
              <textarea
                rows={Math.min(Math.max((p.opciones || []).length, 3), 10)}
                value={(p.opciones || []).join('\n')}
                onChange={(e) => onCambio({ opciones: e.target.value.split('\n') })}
                className={`${claseEntrada} font-mono text-[13px]`}
              />
            </Campo>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <button onClick={() => onMover(-1)} disabled={i === 0} className="grid h-8 w-8 place-items-center rounded-lg text-humo hover:bg-panel hover:text-tinta disabled:opacity-30" aria-label="Subir pregunta"><ArrowUp className="h-4 w-4" /></button>
          <button onClick={() => onMover(1)} disabled={i === total - 1} className="grid h-8 w-8 place-items-center rounded-lg text-humo hover:bg-panel hover:text-tinta disabled:opacity-30" aria-label="Bajar pregunta"><ArrowDown className="h-4 w-4" /></button>
          <button onClick={onQuitar} disabled={fija} className="grid h-8 w-8 place-items-center rounded-lg text-humo hover:bg-panel hover:text-rojo disabled:opacity-30" aria-label="Quitar pregunta"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
    </li>
  )
}

// ============================================================ resultados
function Resultados({ encuesta, id, onSalir }) {
  const avisar = useAviso()
  const res = useDocVivo(['encuestas_resultados', id])
  const [analizando, setAnalizando] = useState(false)
  const [analisisLocal, setAnalisisLocal] = useState(null)
  const r = res.datos
  const total = r?.total ?? encuesta?.total_respuestas ?? 0
  const analisis = analisisLocal || r?.analisis

  const preguntas = useMemo(() => {
    const porPregunta = r?.por_pregunta || {}
    const orden = (encuesta?.preguntas || []).map((p) => p.id)
    const ids = [...orden.filter((x) => porPregunta[x]), ...Object.keys(porPregunta).filter((x) => !orden.includes(x))]
    return ids.map((pid) => ({ pid, def: encuesta?.preguntas?.find((p) => p.id === pid), ...porPregunta[pid] }))
  }, [r, encuesta])

  const hayTextos = preguntas.some((p) => p.tipo === 'texto' && p.textos?.length)

  const analizar = async () => {
    setAnalizando(true)
    try {
      const out = await api.analizarEncuesta({ id })
      if (out?.analisis || out?.resumen) setAnalisisLocal(out.analisis || out)
      avisar('Análisis listo')
    } catch (err) {
      avisar(mensajeError(err), 'error')
    } finally {
      setAnalizando(false)
    }
  }

  return (
    <div>
      <button onClick={onSalir} className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-humo hover:text-tinta">
        <ArrowLeft className="h-4 w-4" /> Encuestas
      </button>
      <Encabezado titulo={encuesta?.titulo || 'Resultados'} subtitulo={`Sobre ${num(total)} respuesta${total === 1 ? '' : 's'}${r?.actualizado ? ` · actualizado ${hace(r.actualizado)}` : ''}.`}>
        <Boton variante="primario" icono={BrainCircuit} cargando={analizando} disabled={!hayTextos} title={hayTextos ? undefined : 'No hay comentarios de texto que analizar'} onClick={analizar}>
          Analizar con IA
        </Boton>
      </Encabezado>

      {res.error ? (
        <ErrorCaja error={res.error}>No se pudieron leer los resultados.</ErrorCaja>
      ) : res.cargando ? (
        <Cargando lineas={6} />
      ) : !r || !total ? (
        <Vacio icono={BarChart3} titulo="Todavía no hay respuestas" texto={encuesta?.estado === 'abierta' ? 'Comparte el enlace o el QR; los resultados aparecen aquí en tiempo real.' : 'Abre la encuesta y comparte el enlace para empezar a recibir respuestas.'} />
      ) : (
        <div className="space-y-4">
          {analisis && <Analisis a={analisis} />}
          {preguntas.map((p, i) => <ResultadoPregunta key={p.pid} p={p} i={i} />)}
        </div>
      )}
    </div>
  )
}

function Analisis({ a }) {
  const tonoSent = (s) => {
    const t = normal(s)
    if (t.startsWith('neg')) return 'suave'
    if (t.startsWith('pos')) return 'tinta'
    return 'neutro'
  }
  return (
    <section className="anim-entrar relative overflow-hidden rounded-3xl border border-linea bg-white p-6">
      <span className="grad-ot-h absolute inset-x-0 top-0 h-[3px]" aria-hidden />
      <div className="flex items-center gap-2">
        <span className="grad-ot grid h-8 w-8 place-items-center rounded-lg text-white"><BrainCircuit className="h-4 w-4" /></span>
        <h3 className="text-[16px] font-semibold tracking-apretado">Análisis de los comentarios</h3>
        {a.generado && <span className="text-[12px] text-humo">· {hace(a.generado)}</span>}
      </div>
      {a.resumen && <p className="mt-3 text-[14px] leading-relaxed">{a.resumen}</p>}
      {a.temas?.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-[12px] font-medium uppercase tracking-[0.06em] text-humo">Temas</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {a.temas.map((t, i) => (
              <li key={i} style={{ '--i': i }} className="anim-entrar flex items-center justify-between gap-3 rounded-2xl bg-panel px-4 py-3">
                <span className="min-w-0 text-[13.5px] font-medium">{t.tema}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {t.sentimiento && <Pastilla tono={tonoSent(t.sentimiento)}>{t.sentimiento}</Pastilla>}
                  <span className="text-[12px] text-humo tabular">{num(t.menciones)} menc.</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {a.acciones?.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-[12px] font-medium uppercase tracking-[0.06em] text-humo">Acciones sugeridas</p>
          <ol className="space-y-1.5">
            {a.acciones.map((x, i) => (
              <li key={i} className="flex gap-3 text-[14px]">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-panel text-[12px] font-semibold tabular">{i + 1}</span>
                <span className="pt-0.5">{x}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}

const etiquetaValor = (v) => {
  const t = String(v)
  if (t === 'true' || normal(t) === 'si') return 'Sí'
  if (t === 'false' || normal(t) === 'no') return 'No'
  return t
}

function ResultadoPregunta({ p, i }) {
  const tipo = p.tipo || p.def?.tipo
  const texto = p.texto || p.def?.texto
  return (
    <section style={{ '--i': i }} className="anim-entrar rounded-3xl border border-linea bg-white p-5 transition-colors hover:border-borde">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] text-humo">Pregunta {i + 1} · {TIPOS_PREGUNTA[tipo] || tipo}</p>
          <h3 className="mt-0.5 text-[15px] font-semibold tracking-apretado">{texto || <Falta>Pregunta eliminada</Falta>}</h3>
        </div>
        <span className="text-[12.5px] text-humo">Sobre {num(p.n || 0)} respuestas</span>
      </div>
      {tipo === 'nps' ? (
        <Nps p={p} />
      ) : tipo === 'texto' ? (
        <Textos textos={p.textos} n={p.n} />
      ) : (
        <Distribucion p={p} tipo={tipo} />
      )}
    </section>
  )
}

function Distribucion({ p, tipo }) {
  const dist = p.distribucion || {}
  let claves = Object.keys(dist)
  if (tipo === 'escala') {
    const min = Number(p.def?.min ?? 1)
    const max = Number(p.def?.max ?? 5)
    claves = Array.from({ length: Math.max(max - min + 1, 0) }, (_, k) => String(min + k))
    for (const k of Object.keys(dist)) if (!claves.includes(k)) claves.push(k)
  } else if ((tipo === 'opcion' || tipo === 'multiple') && p.def?.opciones) {
    claves = [...p.def.opciones, ...Object.keys(dist).filter((k) => !p.def.opciones.includes(k))]
  }
  const total = claves.reduce((s, k) => s + (dist[k] || 0), 0)
  const tope = Math.max(...claves.map((k) => dist[k] || 0), 1)
  const moda = claves.reduce((m, k) => ((dist[k] || 0) > (dist[m] || 0) ? k : m), claves[0])
  return (
    <div className="grid gap-5 sm:grid-cols-[1fr_160px]">
      {claves.length === 0 ? (
        <p className="text-[13px] text-humo">Sin distribución.</p>
      ) : (
        <ul className="space-y-2">
          {claves.map((k, j) => {
            const v = dist[k] || 0
            return (
              <li key={k} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-[13px]">
                <span className="truncate">{etiquetaValor(k)}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-panel">
                  <span
                    className={`crecer-x block h-full rounded-full ${k === moda && v > 0 ? 'grad-ot-h' : 'bg-tinta'}`}
                    style={{ width: `${(v / tope) * 100}%`, '--i': j }}
                  />
                </span>
                <span className="w-16 text-right tabular text-humo">
                  <span className="font-semibold text-tinta">{num(v)}</span> · {total ? Math.round((v / total) * 100) : 0}%
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {p.promedio != null && (
        <div className="rounded-2xl bg-panel p-4">
          <p className="text-[12px] text-humo">Promedio</p>
          <p className="mt-1 text-[32px] font-semibold leading-none tracking-titulo tabular">
            <Contador valor={p.promedio} formato={(v) => Number(v).toFixed(2)} />
          </p>
          {tipo === 'escala' && <p className="mt-1.5 text-[12px] text-humo">de {num(p.def?.max ?? 5)}</p>}
        </div>
      )}
    </div>
  )
}

/** Medidor semicircular del NPS (−100 a 100). */
function Nps({ p }) {
  const n = p.nps || {}
  const score = Number(n.score ?? 0)
  const angulo = ((Math.max(-100, Math.min(100, score)) + 100) / 200) * 180 // 0..180
  const rad = (Math.PI * (180 - angulo)) / 180
  const cx = 100, cy = 100, r = 80
  const x = cx + r * Math.cos(rad)
  const y = cy - r * Math.sin(rad)
  const largo = Math.PI * r
  const avance = (angulo / 180) * largo
  const partes = [
    { k: 'promotores', etiqueta: 'Promotores (9–10)', v: n.promotores, tono: 'grad-ot' },
    { k: 'pasivos', etiqueta: 'Pasivos (7–8)', v: n.pasivos, tono: 'bg-borde' },
    { k: 'detractores', etiqueta: 'Detractores (0–6)', v: n.detractores, tono: 'bg-tinta' },
  ]
  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row">
      <svg viewBox="0 0 200 116" className="w-full max-w-[260px]" role="img" aria-label={`NPS ${score}`}>
        <defs>
          <linearGradient id={`nps-${p.pid}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#FD111C" />
            <stop offset="55%" stopColor="#FF5A36" />
            <stop offset="100%" stopColor="#FF8A4C" />
          </linearGradient>
        </defs>
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="#EFEFEF" strokeWidth="16" strokeLinecap="round" />
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={`url(#nps-${p.pid})`}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={`${avance} ${largo}`}
          className="trazo"
          style={{ '--largo': largo }}
        />
        <circle cx={x} cy={y} r="6" fill="#1A1A1A" stroke="#fff" strokeWidth="3" />
        <text x={cx} y={cy - 14} textAnchor="middle" className="fill-tinta" style={{ font: '600 30px Inter, sans-serif', letterSpacing: '-0.03em' }}>
          {score > 0 ? `+${Math.round(score)}` : Math.round(score)}
        </text>
        <text x={cx - r} y={cy + 15} textAnchor="middle" style={{ font: '500 10px Inter, sans-serif' }} fill="#6B6B6B">−100</text>
        <text x={cx + r} y={cy + 15} textAnchor="middle" style={{ font: '500 10px Inter, sans-serif' }} fill="#6B6B6B">+100</text>
      </svg>
      <ul className="w-full flex-1 space-y-2.5">
        {partes.map((x2) => (
          <li key={x2.k} className="flex items-center gap-3 text-[13.5px]">
            <span className={`h-3 w-3 shrink-0 rounded-full ${x2.tono}`} />
            <span className="flex-1">{x2.etiqueta}</span>
            <span className="font-semibold tabular">{num(x2.v ?? 0)}</span>
          </li>
        ))}
        <li className="border-t border-linea pt-2.5 text-[12px] text-humo">eNPS = % promotores − % detractores. Sobre {num(p.n || 0)} respuestas.</li>
      </ul>
    </div>
  )
}

function Textos({ textos = [], n }) {
  const [texto, setTexto] = useState('')
  const q = useDebounce(texto)
  const [limite, setLimite] = useState(8)
  const lista = textos.filter((t) => !q || normal(t).includes(normal(q)))
  if (!textos.length) {
    return (
      <p className="rounded-2xl bg-panel px-4 py-3 text-[13px] text-humo">
        {n ? 'Los comentarios no se muestran para esta encuesta (no es anónima y tu rol no permite verlos).' : 'Sin comentarios.'}
      </p>
    )
  }
  return (
    <div>
      {textos.length > 5 && <CampoBusqueda valor={texto} onCambio={setTexto} placeholder="Buscar en los comentarios" className="mb-3 w-full sm:w-[280px]" />}
      <ul className="space-y-2">
        {lista.slice(0, limite).map((t, i) => (
          <li key={i} style={{ '--i': i }} className="anim-entrar rounded-2xl bg-panel px-4 py-3 text-[13.5px] leading-relaxed">
            <Resaltar texto={t} q={q} />
          </li>
        ))}
      </ul>
      {lista.length === 0 && <p className="text-[13px] text-humo">Ningún comentario coincide.</p>}
      {lista.length > limite && (
        <button onClick={() => setLimite((l) => l + 20)} className="mt-3 text-[13px] font-medium text-humo hover:text-tinta">
          Ver {Math.min(20, lista.length - limite)} más de {num(lista.length)}
        </button>
      )}
    </div>
  )
}

