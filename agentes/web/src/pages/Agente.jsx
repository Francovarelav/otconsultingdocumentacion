import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { collection, query, where } from 'firebase/firestore'
import {
  ArrowUp, ArrowUpRight, Award, BookOpenCheck, Brain, BrainCircuit, Briefcase, ChartColumn, ChevronDown, FileText,
  GitPullRequestArrow, ListPlus, ListTodo, MessageSquarePlus, Search, ShieldCheck, User, Wrench,
} from 'lucide-react'
import { api, db, mensajeError } from '../firebase.js'
import { useSesion } from '../lib/auth.jsx'
import { useDocVivo, useEnVivo } from '../lib/datos.js'
import { hace, ms, normal } from '../lib/formato.js'
import { agente as buscarAgente } from '../lib/agentes.js'
import Monito from '../components/Monito.jsx'
import { AvatarAgente, Boton, CampoBusqueda, Cargando, ErrorCaja, Markdown, Resaltar, useDebounce } from '../components/ui.jsx'

export default function Agente() {
  const { id } = useParams()
  const ag = buscarAgente(id)
  if (!ag) return <Navigate to="/" replace />
  return <Chat key={id} ag={ag} />
}

function Chat({ ag }) {
  const { usuario } = useSesion()
  const [params, setParams] = useSearchParams()
  const conversacionId = params.get('c')
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  // Mensajes locales mientras Firestore todavía no refleja la vuelta del agente.
  const [local, setLocal] = useState({ desde: 0, mensajes: [], conv: null })
  const final = useRef(null)
  const caja = useRef(null)
  const autoEnviado = useRef(false)

  const lista = useEnVivo(
    () => query(collection(db, 'conversaciones'), where('uid', '==', usuario.uid), where('agente', '==', ag.id)),
    [usuario.uid, ag.id],
  )
  const [buscar, setBuscar] = useState('')
  const qh = useDebounce(buscar)
  const conversaciones = useMemo(() => {
    const b = normal(qh)
    return [...lista.datos]
      .filter((c) => !b || normal(c.titulo).includes(b) || (c.mensajes || []).some((m) => normal(m.texto).includes(b)))
      .sort((a, b2) => ms(b2.actualizada) - ms(a.actualizada))
  }, [lista.datos, qh])
  const conv = useDocVivo(conversacionId ? ['conversaciones', conversacionId] : null)

  const base = conv.datos?.mensajes ?? []
  const aplicaLocal = local.mensajes.length > 0 && (local.conv ?? null) === (conversacionId ?? local.conv)
  const mensajes = aplicaLocal && base.length < local.desde + local.mensajes.length
    ? [...base.slice(0, local.desde), ...local.mensajes]
    : base

  const enviar = async (mensaje) => {
    const m = mensaje.trim()
    if (!m || enviando) return
    setError(null)
    setTexto('')
    setEnviando(true)
    const desde = base.length
    const usuarioMsg = { rol: 'usuario', texto: m }
    setLocal({ desde, mensajes: [usuarioMsg], conv: conversacionId })
    try {
      const res = await api.chatAgente({ agente: ag.id, mensaje: m, ...(conversacionId ? { conversacionId } : {}) })
      setLocal({ desde, mensajes: [usuarioMsg, { rol: 'agente', texto: res?.respuesta ?? '', pasos: res?.pasos ?? [] }], conv: res?.conversacionId ?? conversacionId })
      if (res?.conversacionId && res.conversacionId !== conversacionId) {
        setParams({ c: res.conversacionId }, { replace: true })
      }
    } catch (e) {
      setError(mensajeError(e))
      setTexto(m)
      setLocal({ desde: 0, mensajes: [], conv: null })
    } finally {
      setEnviando(false)
    }
  }

  // ?q= prellena y envía una sola vez
  useEffect(() => {
    const q = params.get('q')
    if (q && !autoEnviado.current) {
      autoEnviado.current = true
      const sig = new URLSearchParams(params)
      sig.delete('q')
      setParams(sig, { replace: true })
      enviar(q)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    final.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [mensajes.length, enviando, conversacionId])

  // Textarea autoajustable (hasta ~6 líneas)
  useLayoutEffect(() => {
    const el = caja.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`
  }, [texto])

  const nueva = () => {
    setParams({}, { replace: false })
    setLocal({ desde: 0, mensajes: [], conv: null })
    setError(null)
  }

  const vacia = mensajes.length === 0 && !conv.cargando

  return (
    <div className="grid gap-6 xl:grid-cols-[220px_1fr]">
      {/* Conversaciones del agente */}
      <aside className="order-2 xl:order-1">
        <Boton variante="secundario" tam="ch" icono={MessageSquarePlus} onClick={nueva} className="w-full">Nueva conversación</Boton>
        <p className="mb-1.5 mt-5 px-2 text-[11px] font-medium uppercase tracking-[0.06em] text-humo">Historial</p>
        {lista.datos.length > 3 && <CampoBusqueda valor={buscar} onCambio={setBuscar} placeholder="Buscar en el historial" className="mb-2" />}
        {lista.cargando ? (
          <Cargando lineas={3} />
        ) : conversaciones.length === 0 ? (
          <p className="px-2 text-[12.5px] text-humo">{qh ? 'Sin coincidencias.' : 'Sin conversaciones con este agente.'}</p>
        ) : (
          <ul className="scroll-fino max-h-[62vh] space-y-px overflow-y-auto">
            {conversaciones.map((c, i) => {
              const activa = c.id === conversacionId
              return (
                <li key={c.id} style={{ '--i': i }} className="anim-lado">
                  <button
                    onClick={() => { setParams({ c: c.id }); setLocal({ desde: 0, mensajes: [], conv: null }) }}
                    className={`relative flex w-full items-baseline gap-2 rounded-lg py-1.5 pl-3 pr-2 text-left transition-colors ${activa ? 'bg-panel' : 'hover:bg-panel/60'}`}
                  >
                    {activa && <span className="grad-ot-v absolute bottom-1.5 left-0 top-1.5 w-[3px] rounded-full" aria-hidden />}
                    <span className={`min-w-0 flex-1 truncate text-[13px] ${activa ? 'font-medium' : 'text-tinta/85'}`}><Resaltar texto={c.titulo || 'Conversación'} q={qh} /></span>
                    <span className="shrink-0 text-[11px] text-humo">{haceCorto(c.actualizada)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </aside>

      {/* Chat */}
      <section className="order-1 flex min-h-[calc(100vh-10rem)] flex-col xl:order-2">
        <header className="flex items-center gap-3 border-b border-linea pb-4">
          <AvatarAgente ag={ag} tam="h-11 w-11" estado={enviando ? 'pensando' : 'quieto'} animado />
          <div className="min-w-0">
            <h1 className="text-[20px] font-semibold tracking-apretado">{ag.nombre}</h1>
            <p className="truncate text-[13px] text-humo">{ag.descripcion}</p>
          </div>
        </header>

        <div className="flex-1 py-6">
          {conv.cargando && conversacionId && !aplicaLocal ? (
            <div className="mx-auto max-w-[780px]"><Cargando lineas={4} /></div>
          ) : vacia ? (
            <div className="mesh mx-auto max-w-[720px] rounded-4xl border border-linea px-6 py-10 sm:px-10">
              <Monito agente={ag.id} estado="quieto" tam={88} titulo={ag.nombre} />
              <p className="mt-5 text-[28px] font-semibold leading-tight tracking-titulo">
                ¿En qué te <span className="texto-grad">ayudo</span>?
              </p>
              <p className="mt-2 max-w-[56ch] text-[14px] text-humo">
                Respondo con los datos reales y te digo sobre cuántos registros confiables calculé. No escribo datos: si algo debe cambiar, lo propongo y tú lo apruebas.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {ag.sugerencias.map((s) => (
                  <button
                    key={s}
                    onClick={() => enviar(s)}
                    className="group inline-flex max-w-full items-center gap-2 rounded-full border border-linea bg-white py-2 pl-3 pr-3.5 text-left text-[13px] leading-snug transition-colors hover:border-[#FFB59A] hover:bg-[#FFF6F2]"
                  >
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-humo group-hover:text-rojo" />
                    <span className="min-w-0">{s}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ol className="mx-auto max-w-[780px] space-y-5">
              {mensajes.map((m, i) => <Mensaje key={i} m={m} ag={ag} ultimo={i === mensajes.length - 1 && !enviando} />)}
              {enviando && <Pensando ag={ag} />}
            </ol>
          )}
          <div ref={final} className="h-1" />
        </div>

        <div className="sticky bottom-0 bg-gradient-to-t from-white via-white to-white/0 pb-1 pt-4">
          <div className="mx-auto max-w-[780px]">
            {error && <div className="mb-2"><ErrorCaja>{error}</ErrorCaja></div>}
            <form
              onSubmit={(e) => { e.preventDefault(); enviar(texto) }}
              className="flex items-end gap-2 rounded-[26px] border border-borde bg-white p-1.5 pl-5 shadow-[0_1px_2px_rgba(26,26,26,.05),0_8px_24px_-16px_rgba(26,26,26,.18)] transition-[border-color,box-shadow] focus-within:border-[#FF8A6A] focus-within:shadow-[0_0_0_4px_rgba(255,90,54,.12)]"
            >
              <textarea
                ref={caja}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); enviar(texto) }
                }}
                rows={1}
                placeholder={`Pregúntale a ${ag.nombre}…`}
                aria-label="Mensaje"
                className="block max-h-[168px] min-h-[42px] flex-1 resize-none border-0 bg-transparent py-[10px] text-[14.5px] leading-[22px] outline-none placeholder:text-humo focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <button
                type="submit"
                disabled={!texto.trim() || enviando}
                aria-label="Enviar"
                className="grad-ot grad-ot-hover grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full text-white transition-opacity disabled:bg-none disabled:bg-linea disabled:text-gris"
              >
                <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2.2} />
              </button>
            </form>
            <p className="mt-1.5 px-2 text-[11.5px] text-humo">Enter para enviar · Shift + Enter para salto de línea</p>
          </div>
        </div>
      </section>
    </div>
  )
}

function haceCorto(v) {
  const t = hace(v)
  return t.replace('hace un momento', 'ahora').replace('hace ', '')
}

function Mensaje({ m, ag, ultimo }) {
  // La última respuesta "habla" un momento y luego queda contenta.
  const [habla, setHabla] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setHabla(false), 2400)
    return () => clearTimeout(t)
  }, [])
  if (m.rol === 'usuario') {
    return (
      <li className="anim-entrar flex justify-end">
        <div className="grad-ot max-w-[82%] whitespace-pre-wrap rounded-[22px] rounded-br-md px-4 py-2.5 text-[14.5px] leading-relaxed text-white shadow-[0_1px_2px_rgba(26,26,26,.10)]">
          {m.texto}
        </div>
      </li>
    )
  }
  return (
    <li className="anim-entrar flex gap-3">
      <AvatarAgente ag={ag} tam="h-8 w-8" redondeo="rounded-lg" estado={ultimo ? (habla ? 'hablando' : 'feliz') : 'quieto'} animado={ultimo} />
      <div className="min-w-0 flex-1 rounded-[22px] rounded-tl-md border border-linea bg-white px-5 py-4 shadow-[0_1px_2px_rgba(26,26,26,.04)]">
        {m.pasos?.length > 0 && <Pasos pasos={m.pasos} />}
        <Markdown>{m.texto}</Markdown>
      </div>
    </li>
  )
}

const ICONOS_HERRAMIENTA = {
  consultar_indicador: ChartColumn,
  buscar_colaboradores: Search,
  ver_colaborador: User,
  buscar_por_habilidad: Award,
  ver_proyectos: Briefcase,
  listar_tareas: ListTodo,
  crear_tarea: ListPlus,
  proponer_cambio: GitPullRequestArrow,
  recordar: BrainCircuit,
  buscar_memoria: Brain,
  listar_sops: BookOpenCheck,
  leer_sop: BookOpenCheck,
  ver_cvs: FileText,
  calidad_datos: ShieldCheck,
}
const nombreHerramienta = (h) => String(h || 'herramienta').replace(/_/g, ' ')

function Pasos({ pasos }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <div className="mb-3 border-b border-linea pb-3">
      <button
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        className="flex w-full flex-wrap items-center gap-1.5 text-left"
      >
        <span className="mr-1 text-[12px] font-medium text-humo">Pasos del agente ({pasos.length})</span>
        {!abierto && pasos.slice(0, 6).map((p, i) => {
          const I = ICONOS_HERRAMIENTA[p.herramienta] || Wrench
          return (
            <span key={i} title={nombreHerramienta(p.herramienta)} style={{ '--i': i }} className="anim-entrar grid h-6 w-6 place-items-center rounded-md bg-panel text-tinta/75">
              <I className="h-3.5 w-3.5" />
            </span>
          )
        })}
        {!abierto && pasos.length > 6 && <span className="text-[11.5px] text-humo">+{pasos.length - 6}</span>}
        <ChevronDown className={`ml-auto h-3.5 w-3.5 text-humo transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>
      {abierto && (
        <ol className="relative mt-3 space-y-2.5 pl-1">
          <span className="absolute bottom-2 left-[13px] top-2 w-px bg-linea" aria-hidden />
          {pasos.map((p, i) => {
            const I = ICONOS_HERRAMIENTA[p.herramienta] || Wrench
            return (
              <li key={i} style={{ '--i': i }} className="anim-lado relative flex gap-3">
                <span className="relative z-10 grid h-[26px] w-[26px] shrink-0 place-items-center rounded-lg border border-linea bg-white text-tinta">
                  <I className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 pt-0.5 text-[12.5px]">
                  <span className="inline-flex items-center rounded-full bg-panel px-2 py-0.5 font-mono text-[11.5px] font-medium">{p.herramienta}</span>
                  {p.entrada && Object.keys(p.entrada).length > 0 && (
                    <span className="ml-1.5 break-all font-mono text-[11px] text-humo">{resumirEntrada(p.entrada)}</span>
                  )}
                  {p.resumen && <p className="mt-1 text-humo">{p.resumen}</p>}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

function resumirEntrada(e) {
  try {
    const s = typeof e === 'string' ? e : JSON.stringify(e)
    return s.length > 140 ? `${s.slice(0, 140)}…` : s
  } catch {
    return ''
  }
}

const FASES = ['Consultando datos…', 'Revisando reglas y SOPs…', 'Cruzando registros por ID…', 'Redactando la respuesta…']

function Pensando({ ag }) {
  const [seg, setSeg] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setSeg((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const fase = FASES[Math.min(Math.floor(seg / 6), FASES.length - 1)]
  return (
    <li className="anim-entrar flex gap-3" aria-live="polite">
      <AvatarAgente ag={ag} tam="h-8 w-8" redondeo="rounded-lg" estado="pensando" animado />
      <div className="w-full max-w-[360px] rounded-[22px] rounded-tl-md border border-linea bg-white px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-[13.5px] font-medium">
            <span className="inline-flex gap-1">
              <span className="punto grad-ot h-1.5 w-1.5 rounded-full" />
              <span className="punto grad-ot h-1.5 w-1.5 rounded-full" />
              <span className="punto grad-ot h-1.5 w-1.5 rounded-full" />
            </span>
            {fase}
          </span>
          <span className="text-[11.5px] text-humo tabular">{seg} s</span>
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-panel">
          <div className="shimmer h-full w-full rounded-full" />
        </div>
        <p className="mt-2 text-[11.5px] text-humo">Puede tardar entre 10 y 40 segundos.</p>
      </div>
    </li>
  )
}
