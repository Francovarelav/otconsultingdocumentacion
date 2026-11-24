import React, { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { ArrowLeft, ArrowRight, Check, Loader2, Lock, SearchX } from 'lucide-react'
import { api, db, mensajeError } from '../firebase.js'
import { useSesion } from '../lib/auth.jsx'
import { Boton, ErrorCaja, Isotipo } from '../components/ui.jsx'

// Formulario público /f/:id — sin login, fuera del layout.
export default function Formulario() {
  const { id } = useParams()
  const sesion = useSesion()
  const [carga, setCarga] = useState({ estado: 'cargando', encuesta: null, error: '' })

  useEffect(() => {
    if (sesion.estado === 'cargando') return
    let vivo = true
    ;(async () => {
      try {
        const res = await api.obtenerFormulario({ id })
        const enc = res?.encuesta || res
        if (!enc?.preguntas) throw new Error('vacía')
        if (vivo) setCarga({ estado: 'listo', encuesta: { id, ...enc }, error: '' })
      } catch (e) {
        // Encuestas internas (no públicas): quien tiene sesión las lee directo.
        if (sesion.estado === 'dentro') {
          try {
            const s = await getDoc(doc(db, 'encuestas', id))
            if (s.exists() && s.data().estado === 'abierta') {
              if (vivo) setCarga({ estado: 'listo', encuesta: { id, ...s.data() }, error: '' })
              return
            }
            if (vivo) setCarga({ estado: s.exists() ? 'cerrada' : 'no-existe', encuesta: null, error: '' })
            return
          } catch { /* sigue al error genérico */ }
        }
        const c = e?.code || ''
        if (vivo) {
          setCarga({
            estado: c.includes('not-found') ? 'no-existe' : c.includes('failed-precondition') ? 'cerrada' : 'error',
            encuesta: null,
            error: mensajeError(e),
          })
        }
      }
    })()
    return () => { vivo = false }
  }, [id, sesion.estado])

  return (
    <div className="min-h-screen bg-lienzo px-4 py-8 sm:py-14">
      <div className="mx-auto w-full max-w-[640px]">
        <header className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Isotipo className="h-10 w-10" />
            <div className="leading-tight">
              <p className="font-semibold tracking-apretado">OT Consulting</p>
              <p className="text-[12.5px] text-humo">Recursos Humanos</p>
            </div>
          </div>
          {sesion.estado === 'dentro' && (
            <Link to="/encuestas" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-humo hover:text-tinta">
              <ArrowLeft className="h-4 w-4" /> Volver
            </Link>
          )}
        </header>

        {carga.estado === 'cargando' ? (
          <Tarjeta>
            <div className="flex items-center gap-3 py-10 text-humo">
              <Loader2 className="h-5 w-5 animate-spin" /> Cargando la encuesta…
            </div>
          </Tarjeta>
        ) : carga.estado === 'listo' ? (
          <Llenar encuesta={carga.encuesta} />
        ) : (
          <Tarjeta>
            <div className="py-8 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-panel text-humo">
                {carga.estado === 'cerrada' ? <Lock className="h-5 w-5" /> : <SearchX className="h-5 w-5" />}
              </span>
              <h1 className="mt-4 text-[22px] font-semibold tracking-titulo">
                {carga.estado === 'cerrada' ? 'Esta encuesta ya cerró' : carga.estado === 'no-existe' ? 'No encontramos esta encuesta' : 'No se pudo abrir la encuesta'}
              </h1>
              <p className="mx-auto mt-2 max-w-[40ch] text-[14px] text-humo">
                {carga.estado === 'cerrada'
                  ? 'Gracias por tu interés. Ya no recibe respuestas.'
                  : carga.estado === 'no-existe'
                    ? 'Revisa que el enlace esté completo o pide uno nuevo a RH.'
                    : carga.error || 'Intenta de nuevo en un momento.'}
              </p>
            </div>
          </Tarjeta>
        )}
        <p className="mt-6 text-center text-[12px] text-humo">OT Consulting · Recursos Humanos</p>
      </div>
    </div>
  )
}

function Tarjeta({ children, className = '' }) {
  return <section className={`anim-entrar rounded-4xl border border-linea bg-white p-6 sm:p-8 ${className}`}>{children}</section>
}

const vacia = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0)

function Llenar({ encuesta }) {
  const sesion = useSesion()
  const preguntas = useMemo(() => encuesta.preguntas || [], [encuesta])
  const [paso, setPaso] = useState(-1) // -1 portada · 0..n-1 preguntas · n revisión
  const [resp, setResp] = useState({})
  const [falta, setFalta] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [listo, setListo] = useState(false)
  const n = preguntas.length

  const respondidas = preguntas.filter((p) => !vacia(resp[p.id])).length
  const pendientes = preguntas.filter((p) => p.requerida && vacia(resp[p.id]))
  const progreso = n ? (respondidas / n) * 100 : 0
  const actual = preguntas[paso]

  const poner = (pid, v) => {
    setResp((r) => ({ ...r, [pid]: v }))
    setFalta(false)
  }

  const siguiente = () => {
    if (actual && actual.requerida && vacia(resp[actual.id])) return setFalta(true)
    setFalta(false)
    setPaso((p) => Math.min(p + 1, n))
  }
  const anterior = () => { setFalta(false); setPaso((p) => Math.max(p - 1, -1)) }

  const enviar = async () => {
    if (pendientes.length) {
      setFalta(true)
      setPaso(preguntas.indexOf(pendientes[0]))
      return
    }
    setError('')
    setEnviando(true)
    try {
      const respuestas = {}
      for (const p of preguntas) if (!vacia(resp[p.id])) respuestas[p.id] = typeof resp[p.id] === 'string' ? resp[p.id].trim() : resp[p.id]
      const conId = sesion.estado === 'dentro' && sesion.esColaborador && sesion.idColaborador && !encuesta.anonima
      await api.responderEncuesta({ id: encuesta.id, respuestas, ...(conId ? { id_colaborador: sesion.idColaborador } : {}) })
      setListo(true)
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setEnviando(false)
    }
  }

  // Enter avanza (salvo en textarea, donde Ctrl/⌘+Enter avanza)
  useEffect(() => {
    if (listo || paso < 0) return
    const f = (e) => {
      if (e.key !== 'Enter') return
      const enTexto = e.target?.tagName === 'TEXTAREA'
      if (enTexto && !(e.metaKey || e.ctrlKey)) return
      if (e.target?.tagName === 'BUTTON') return
      e.preventDefault()
      if (paso >= n) enviar()
      else siguiente()
    }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  })

  if (listo) {
    return (
      <Tarjeta>
        <div className="py-8 text-center">
          <svg viewBox="0 0 64 64" className="mx-auto h-16 w-16" aria-hidden>
            <defs>
              <linearGradient id="gracias" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="#FD111C" />
                <stop offset="55%" stopColor="#FF5A36" />
                <stop offset="100%" stopColor="#FF8A4C" />
              </linearGradient>
            </defs>
            <circle cx="32" cy="32" r="30" fill="url(#gracias)" className="anim-escala" />
            <path d="M20 33 l8 8 l16 -18" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" className="trazo" style={{ '--largo': 40, animationDelay: '180ms' }} />
          </svg>
          <h1 className="mt-5 text-[26px] font-semibold tracking-titulo">¡Gracias por responder!</h1>
          <p className="mx-auto mt-2 max-w-[42ch] text-[14.5px] text-humo">
            Tus respuestas ya llegaron a RH{encuesta.anonima ? ' de forma anónima' : ''}. Nos ayudan a mejorar el lugar donde trabajamos.
          </p>
          {sesion.estado === 'dentro' && (
            <Link to="/encuestas" className="mt-6 inline-flex h-10 items-center gap-1.5 rounded-xl border border-borde px-4 text-[14px] font-medium hover:bg-panel">
              Volver a encuestas
            </Link>
          )}
        </div>
      </Tarjeta>
    )
  }

  return (
    <section className="anim-entrar overflow-hidden rounded-4xl border border-linea bg-white">
      <div className="h-1.5 bg-panel" role="progressbar" aria-valuenow={Math.round(progreso)} aria-valuemin={0} aria-valuemax={100} aria-label="Avance">
        <div className="grad-ot-h h-full transition-[width] duration-500 ease-[cubic-bezier(.2,.8,.2,1)]" style={{ width: `${paso < 0 ? 0 : progreso}%` }} />
      </div>
      <div className="p-6 sm:p-8">
        {paso < 0 ? (
          <div key="portada" className="anim-entrar">
            <h1 className="text-[28px] font-semibold leading-tight tracking-titulo">{encuesta.titulo}</h1>
            {encuesta.descripcion && <p className="mt-2 text-[15px] leading-relaxed text-humo">{encuesta.descripcion}</p>}
            <div className="mt-5 flex flex-wrap gap-2 text-[12.5px]">
              <span className="rounded-full bg-panel px-3 py-1 font-medium">{n} pregunta{n === 1 ? '' : 's'}</span>
              {encuesta.anonima && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-panel px-3 py-1 font-medium">
                  <Lock className="h-3 w-3" /> Respuestas anónimas
                </span>
              )}
            </div>
            <Boton variante="primario" tam="gr" className="mt-8 w-full sm:w-auto" onClick={() => setPaso(0)} disabled={!n}>
              Empezar <ArrowRight className="h-4 w-4" />
            </Boton>
          </div>
        ) : paso < n ? (
          <div key={actual.id} className="anim-entrar">
            <p className="text-[12.5px] font-medium text-humo">
              Pregunta {paso + 1} de {n}{actual.requerida ? '' : ' · opcional'}
            </p>
            <h2 className="mt-2 text-[21px] font-semibold leading-snug tracking-apretado">{actual.texto}</h2>
            <div className="mt-6">
              <Entrada p={actual} valor={resp[actual.id]} onCambio={(v) => poner(actual.id, v)} />
            </div>
            {falta && <p className="mt-4 text-[13px] font-medium text-rojo-hondo" role="alert">Esta pregunta es obligatoria.</p>}
            <div className="mt-8 flex items-center justify-between gap-3">
              <Boton variante="fantasma" icono={ArrowLeft} onClick={anterior}>Anterior</Boton>
              <Boton variante="primario" onClick={siguiente}>
                {paso === n - 1 ? 'Revisar' : 'Siguiente'} <ArrowRight className="h-4 w-4" />
              </Boton>
            </div>
          </div>
        ) : (
          <div key="revision" className="anim-entrar">
            <h2 className="text-[22px] font-semibold tracking-titulo">Revisa y envía</h2>
            <p className="mt-1 text-[13.5px] text-humo">Toca una respuesta para cambiarla.</p>
            <ol className="mt-5 space-y-2">
              {preguntas.map((p, i) => {
                const sin = vacia(resp[p.id])
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => setPaso(i)}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors hover:border-borde ${sin && p.requerida ? 'border-rojo/40 bg-rojo-suave' : 'border-linea'}`}
                    >
                      <span className="block text-[12.5px] text-humo">{i + 1}. {p.texto}</span>
                      <span className="mt-0.5 block text-[14px] font-medium">
                        {sin ? (p.requerida ? 'Falta responder' : 'Sin respuesta') : mostrar(p, resp[p.id])}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
            {error && <div className="mt-4"><ErrorCaja>{error}</ErrorCaja></div>}
            <div className="mt-8 flex items-center justify-between gap-3">
              <Boton variante="fantasma" icono={ArrowLeft} onClick={anterior}>Anterior</Boton>
              <Boton variante="primario" tam="gr" icono={Check} cargando={enviando} onClick={enviar}>Enviar respuestas</Boton>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function mostrar(p, v) {
  if (p.tipo === 'si_no') return v ? 'Sí' : 'No'
  if (Array.isArray(v)) return v.join(', ')
  return String(v)
}

function Entrada({ p, valor, onCambio }) {
  if (p.tipo === 'escala' || p.tipo === 'nps') {
    const min = p.tipo === 'nps' ? 0 : Number(p.min ?? 1)
    const max = p.tipo === 'nps' ? 10 : Number(p.max ?? 5)
    const valores = Array.from({ length: Math.max(max - min + 1, 0) }, (_, k) => min + k)
    return (
      <div>
        <div role="radiogroup" aria-label={p.texto} className={`grid gap-1.5 ${valores.length > 7 ? 'grid-cols-6 sm:grid-cols-11' : 'grid-cols-5'}`} style={valores.length <= 7 ? { gridTemplateColumns: `repeat(${valores.length}, minmax(0, 1fr))` } : undefined}>
          {valores.map((v) => {
            const sel = valor === v
            return (
              <button
                key={v}
                role="radio"
                aria-checked={sel}
                onClick={() => onCambio(v)}
                className={`h-12 rounded-xl border text-[15px] font-semibold tabular transition-colors ${sel ? 'grad-ot border-transparent text-white' : 'border-linea bg-white hover:border-[#FFB59A] hover:bg-[#FFF6F2]'}`}
              >
                {v}
              </button>
            )
          })}
        </div>
        <div className="mt-2 flex justify-between text-[12px] text-humo">
          <span>{p.tipo === 'nps' ? 'Nada probable' : 'Totalmente en desacuerdo'}</span>
          <span>{p.tipo === 'nps' ? 'Muy probable' : 'Totalmente de acuerdo'}</span>
        </div>
      </div>
    )
  }
  if (p.tipo === 'si_no') {
    return (
      <div role="radiogroup" aria-label={p.texto} className="grid grid-cols-2 gap-2">
        {[{ v: true, t: 'Sí' }, { v: false, t: 'No' }].map((o) => {
          const sel = valor === o.v
          return (
            <button
              key={o.t}
              role="radio"
              aria-checked={sel}
              onClick={() => onCambio(o.v)}
              className={`h-16 rounded-2xl border text-[17px] font-semibold transition-colors ${sel ? 'grad-ot border-transparent text-white' : 'border-linea bg-white hover:border-[#FFB59A] hover:bg-[#FFF6F2]'}`}
            >
              {o.t}
            </button>
          )
        })}
      </div>
    )
  }
  if (p.tipo === 'opcion' || p.tipo === 'multiple') {
    const multiple = p.tipo === 'multiple'
    const sel = multiple ? (Array.isArray(valor) ? valor : []) : valor
    const alternar = (o) => {
      if (!multiple) return onCambio(o)
      onCambio(sel.includes(o) ? sel.filter((x) => x !== o) : [...sel, o])
    }
    return (
      <div role={multiple ? 'group' : 'radiogroup'} aria-label={p.texto} className="space-y-2">
        {multiple && <p className="text-[12.5px] text-humo">Puedes elegir varias.</p>}
        {(p.opciones || []).map((o) => {
          const activo = multiple ? sel.includes(o) : sel === o
          return (
            <button
              key={o}
              role={multiple ? 'checkbox' : 'radio'}
              aria-checked={activo}
              onClick={() => alternar(o)}
              className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-[14.5px] transition-colors ${activo ? 'border-[#FF8A6A] bg-[#FFF6F2]' : 'border-linea bg-white hover:border-borde'}`}
            >
              <span className={`grid h-5 w-5 shrink-0 place-items-center ${multiple ? 'rounded-md' : 'rounded-full'} ${activo ? 'grad-ot text-white' : 'border border-borde'}`}>
                {activo && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              {o}
            </button>
          )
        })}
      </div>
    )
  }
  return (
    <div>
      <textarea
        autoFocus
        rows={5}
        value={valor || ''}
        onChange={(e) => onCambio(e.target.value)}
        placeholder="Escribe tu respuesta"
        aria-label={p.texto}
        maxLength={2000}
        className="w-full resize-y rounded-2xl border border-borde bg-white px-4 py-3 text-[15px] leading-relaxed placeholder:text-gris focus:border-[#FF8A6A] focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:shadow-[0_0_0_4px_rgba(255,90,54,.12)]"
      />
      <p className="mt-1.5 text-[12px] text-humo">Ctrl / ⌘ + Enter para continuar.</p>
    </div>
  )
}
