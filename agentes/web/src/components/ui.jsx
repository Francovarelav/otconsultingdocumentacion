import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AlertTriangle, Check, Loader2, Search, X } from 'lucide-react'
import { num } from '../lib/formato.js'
import Monito from './Monito.jsx'

// ============================================================ botones
const VARIANTES = {
  primario: 'grad-ot grad-ot-hover text-white shadow-[0_1px_2px_rgba(26,26,26,.12)] disabled:bg-none disabled:bg-gris',
  tinta: 'bg-tinta text-white hover:bg-black disabled:bg-gris',
  secundario: 'bg-white text-tinta border border-borde hover:bg-panel disabled:text-gris',
  fantasma: 'text-tinta hover:bg-panel disabled:text-gris',
  peligro: 'bg-white text-rojo-hondo border border-borde hover:bg-rojo-suave disabled:text-gris',
}
const TAMANOS = {
  ch: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-[14px] gap-2 rounded-xl',
  gr: 'h-11 px-5 text-[14.5px] gap-2 rounded-xl',
}

export function Boton({ variante = 'secundario', tam = 'md', icono: Icono, cargando, children, className = '', ...resto }) {
  const boton = (
    <button
      type="button"
      {...resto}
      disabled={resto.disabled || cargando}
      className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium transition-colors disabled:cursor-not-allowed ${VARIANTES[variante]} ${TAMANOS[tam]} ${className}`}
    >
      {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : Icono && <Icono className="h-4 w-4" strokeWidth={2} />}
      {children}
    </button>
  )
  // Un botón deshabilitado no muestra su title en todos los navegadores: lo envolvemos.
  if (resto.disabled && resto.title) return <span title={resto.title} className="inline-flex cursor-not-allowed">{boton}</span>
  return boton
}

// ============================================================ superficies
export function Tarjeta({ className = '', hundida = false, i = 0, children, style, ...resto }) {
  const tono = hundida ? 'bg-panel' : 'bg-white border border-linea transition-colors hover:border-borde'
  return (
    <section className={`anim-entrar rounded-3xl ${tono} ${className}`} style={{ '--i': i, ...style }} {...resto}>
      {children}
    </section>
  )
}

export function Rotulo({ children, nota, accion, className = '' }) {
  return (
    <header className={`mb-4 flex flex-wrap items-start justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <h3 className="text-[16px] font-semibold tracking-apretado">{children}</h3>
        {nota && <p className="mt-1 max-w-[68ch] text-[13px] text-humo">{nota}</p>}
      </div>
      {accion}
    </header>
  )
}

export function Encabezado({ titulo, subtitulo, children }) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[28px] font-semibold leading-tight tracking-titulo sm:text-[32px]">{titulo}</h1>
        {subtitulo && <p className="mt-1.5 max-w-[70ch] text-[15px] text-humo">{subtitulo}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  )
}

// ============================================================ etiquetas
const TONOS = {
  neutro: 'bg-panel text-tinta',
  contorno: 'border border-borde text-tinta',
  rojo: 'bg-rojo text-white',
  suave: 'bg-rojo-suave text-rojo-hondo',
  tinta: 'bg-tinta text-white',
  rayado: 'rayado bg-panel text-tinta',
}
export function Pastilla({ tono = 'neutro', children, className = '', ...resto }) {
  return (
    <span
      {...resto}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-medium ${TONOS[tono]} ${className}`}
    >
      {children}
    </span>
  )
}

/** Marca de dato faltante o estimado. Rayado = solo eso. */
export function Falta({ children = 'Falta', titulo }) {
  return (
    <span title={titulo || 'Dato que falta o se estimó'} className="rayado inline-flex items-center rounded-md bg-panel px-2 py-0.5 text-[12px] font-medium text-tinta">
      {children}
    </span>
  )
}

/** Muestra el valor, o el rayado de dato faltante si es nulo/vacío. */
export function Valor({ v, formato = (x) => x, falta = 'Falta' }) {
  if (v == null || v === '') return <Falta>{falta}</Falta>
  return <>{formato(v)}</>
}

// ============================================================ estados
export function Vacio({ icono: Icono, titulo, texto, children, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-3xl border border-dashed border-borde px-6 py-12 text-center ${className}`}>
      {Icono && (
        <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-panel text-humo">
          <Icono className="h-5 w-5" />
        </span>
      )}
      <p className="font-semibold tracking-apretado">{titulo}</p>
      {texto && <p className="mt-1.5 max-w-[46ch] text-[13.5px] text-humo">{texto}</p>}
      {children && <div className="mt-5">{children}</div>}
    </div>
  )
}

export function Cargando({ lineas = 3, className = '' }) {
  return (
    <div className={`space-y-2.5 ${className}`} aria-busy="true" aria-label="Cargando">
      {Array.from({ length: lineas }).map((_, i) => (
        <div key={i} className="esqueleto h-4 rounded-md" style={{ width: `${92 - (i % 5) * 14}%` }} />
      ))}
    </div>
  )
}

export function ErrorCaja({ error, children }) {
  if (!error && !children) return null
  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-rojo/30 bg-rojo-suave px-4 py-3 text-[13.5px] text-rojo-hondo">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children || error?.message || String(error)}</div>
    </div>
  )
}

// ============================================================ datos
/** Sobre cuántos registros confiables se calculó el indicador. */
export function Base({ n, de, que = 'registros', className = '' }) {
  if (n == null || de == null) return null
  const completo = Number(n) === Number(de)
  return (
    <span className={`inline-flex items-center gap-2 text-[12px] text-humo ${className}`}>
      <span className="rayado relative h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-panel">
        <span className="absolute inset-y-0 left-0 rounded-full bg-tinta" style={{ width: `${de ? Math.min((n / de) * 100, 100) : 0}%` }} />
      </span>
      {completo ? `Sobre los ${num(de)} ${que}` : `Sobre ${num(n)} de ${num(de)} ${que}`}
    </span>
  )
}

/** Barra de avance; la parte vacía va rayada si representa dato que falta. */
export function Avance({ valor, rayado = false, tono = 'bg-tinta', alto = 'h-2' }) {
  return (
    <div className={`${alto} w-full overflow-hidden rounded-full bg-panel ${rayado ? 'rayado' : ''}`}>
      <div className={`crecer-x h-full rounded-full ${tono}`} style={{ width: `${Math.max(0, Math.min(Number(valor) || 0, 100))}%` }} />
    </div>
  )
}

/** Barras horizontales: [{etiqueta, valor, sub?, resaltar?, rayado?}]. */
export function Barras({ datos, formato = num, max, vacio = 'Sin registros' }) {
  if (!datos.length) return <p className="text-[13px] text-humo">{vacio}</p>
  const tope = max ?? Math.max(...datos.map((d) => Number(d.valor) || 0), 1)
  return (
    <ul className="space-y-2.5">
      {datos.map((d, i) => (
        <li key={d.clave ?? d.etiqueta}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate">{d.etiqueta}</span>
            <span className="shrink-0 font-semibold tabular">{d.rayado && d.valor == null ? <Falta /> : formato(d.valor)}</span>
          </div>
          <div className={`h-2 overflow-hidden rounded-full bg-panel ${d.rayado ? 'rayado' : ''}`}>
            <div className={`crecer-x h-full rounded-full ${d.resaltar ? 'grad-ot-h' : 'bg-tinta'}`} style={{ '--i': i, width: `${((Number(d.valor) || 0) / tope) * 100}%` }} />
          </div>
          {d.sub && <p className="mt-1 text-[12px] text-humo">{d.sub}</p>}
        </li>
      ))}
    </ul>
  )
}

/** Columnas verticales: [{etiqueta, valor, resaltar?, rayado?}]. */
export function Columnas({ datos, alto = 160, formato = num }) {
  const [activa, setActiva] = useState(null)
  if (!datos.length) return <p className="text-[13px] text-humo">Sin registros</p>
  const tope = Math.max(...datos.map((d) => Number(d.valor) || 0), 1)
  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height: alto }}>
        {datos.map((d, i) => {
          const h = Math.max(((Number(d.valor) || 0) / tope) * (alto - 26), d.valor ? 6 : 3)
          const ver = activa === i || d.resaltar || datos.length <= 8
          return (
            <div
              key={d.etiqueta}
              tabIndex={0}
              onMouseEnter={() => setActiva(i)}
              onMouseLeave={() => setActiva(null)}
              onFocus={() => setActiva(i)}
              onBlur={() => setActiva(null)}
              className="flex h-full flex-1 flex-col items-center justify-end"
              aria-label={`${d.etiqueta}: ${formato(d.valor)}`}
            >
              <span className={`mb-1 text-[11.5px] font-semibold tabular transition-opacity ${ver ? 'opacity-100' : 'opacity-0'}`}>
                {d.valor == null ? '—' : formato(d.valor)}
              </span>
              <span
                className={`crecer-y w-full max-w-[2.75rem] rounded-lg ${d.rayado ? 'rayado bg-panel' : d.resaltar ? 'grad-ot-v' : activa === i ? 'bg-tinta' : 'bg-borde'}`}
                style={{ height: h, '--i': i }}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {datos.map((d) => (
          <span key={d.etiqueta} className="flex-1 truncate text-center text-[11px] text-humo">{d.etiqueta}</span>
        ))}
      </div>
    </div>
  )
}

/** Tabla simple: columnas [{titulo, celda(f), derecha?, clase?}]. */
export function Tabla({ columnas, filas, vacio = 'Sin registros', alClic, claveFila, activa, minimo = 520 }) {
  if (!filas.length) return <p className="py-4 text-[13px] text-humo">{vacio}</p>
  return (
    <div className="scroll-fino overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-left text-[13.5px]" style={{ minWidth: minimo }}>
        <thead>
          <tr>
            {columnas.map((c) => (
              <th key={c.titulo} className={`sticky top-0 border-b border-linea bg-white pb-2 pr-4 text-[12px] font-medium text-humo ${c.derecha ? 'text-right' : ''}`}>
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => {
            const k = claveFila ? claveFila(f) : i
            return (
              <tr
                key={k}
                onClick={alClic ? () => alClic(f) : undefined}
                style={{ '--i': i }}
                className={`anim-entrar ${alClic ? 'cursor-pointer transition-colors hover:bg-panel/70' : ''} ${activa != null && activa === k ? 'bg-panel' : ''}`}
              >
                {columnas.map((c) => (
                  <td key={c.titulo} className={`border-b border-linea py-2.5 pr-4 align-top ${c.derecha ? 'text-right tabular' : ''} ${c.clase || ''}`}>
                    {c.celda(f)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function Cifra({ etiqueta, valor, detalle, base, resaltar, className = '' }) {
  return (
    <div className={className}>
      <p className="text-[12.5px] text-humo">{etiqueta}</p>
      <p className={`mt-1 text-[28px] font-semibold leading-none tracking-titulo tabular ${resaltar ? 'text-rojo' : ''}`}>{valor}</p>
      {detalle && <p className="mt-1.5 text-[12.5px] text-humo">{detalle}</p>}
      {base && <div className="mt-2">{base}</div>}
    </div>
  )
}

// ============================================================ navegación interna
export function Pestanas({ opciones, valor, onCambio, className = '', tam = 'gr' }) {
  const caja = useRef(null)
  const [ind, setInd] = useState(null)
  useEffect(() => {
    const medir = () => {
      const el = caja.current?.querySelector('[aria-selected="true"]')
      if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth })
    }
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [valor, opciones.length])
  const texto = tam === 'ch' ? 'text-[14px] font-medium' : 'text-[17px] font-semibold tracking-apretado'
  return (
    <div ref={caja} role="tablist" className={`relative flex flex-wrap items-center gap-5 ${className}`}>
      {opciones.map((o) => (
        <button
          key={o.valor}
          role="tab"
          aria-selected={valor === o.valor}
          onClick={() => onCambio(o.valor)}
          className={`relative pb-1.5 transition-colors ${texto} ${valor === o.valor ? 'text-tinta' : 'text-gris hover:text-humo'}`}
        >
          {o.etiqueta}
          {o.n != null && <span className="ml-1.5 text-[13px] font-medium text-humo tabular">{o.n}</span>}
        </button>
      ))}
      {ind && (
        <span
          aria-hidden
          className="grad-ot-h absolute bottom-0 h-0.5 rounded-full transition-[left,width] duration-300 ease-[cubic-bezier(.2,.8,.2,1)]"
          style={{ left: ind.left, width: ind.width }}
        />
      )}
    </div>
  )
}

export function Selector({ valor, onCambio, opciones, etiqueta, className = '' }) {
  return (
    <label className={`inline-flex items-center gap-2 text-[13px] ${className}`}>
      {etiqueta && <span className="text-humo">{etiqueta}</span>}
      <select
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        className="h-9 rounded-lg border border-borde bg-white px-2.5 pr-8 text-[13px] font-medium focus:border-tinta focus:outline-none"
      >
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
        ))}
      </select>
    </label>
  )
}

/** Panel lateral derecho (detalle). */
export function Panel({ abierto, onCerrar, titulo, subtitulo, children, ancho = 'max-w-[560px]' }) {
  useEffect(() => {
    if (!abierto) return
    const f = (e) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [abierto, onCerrar])
  if (!abierto) return null
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button aria-label="Cerrar" className="anim-pagina absolute inset-0 bg-tinta/20" onClick={onCerrar} />
      <aside className={`anim-panel relative flex h-full w-full ${ancho} flex-col bg-white shadow-2xl sm:m-3 sm:h-[calc(100%-1.5rem)] sm:rounded-4xl`}>
        <header className="flex items-start justify-between gap-3 border-b border-linea px-6 py-5">
          <div className="min-w-0">
            <h2 className="truncate text-[20px] font-semibold tracking-apretado">{titulo}</h2>
            {subtitulo && <div className="mt-1 text-[13px] text-humo">{subtitulo}</div>}
          </div>
          <button onClick={onCerrar} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl hover:bg-panel" aria-label="Cerrar panel">
            <X className="h-[18px] w-[18px]" />
          </button>
        </header>
        <div className="scroll-fino flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </aside>
    </div>
  )
}

// ============================================================ markdown
export function Markdown({ children }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ node, ...p }) => (
            <div className="tabla-md">
              <table {...p} />
            </div>
          ),
          a: ({ node, ...p }) => <a {...p} target="_blank" rel="noreferrer" />,
        }}
      >
        {children || ''}
      </ReactMarkdown>
    </div>
  )
}

// ============================================================ avisos
const AvisoCtx = createContext(() => {})

export function AvisosProvider({ children }) {
  const [avisos, setAvisos] = useState([])
  const quitar = useCallback((id) => setAvisos((a) => a.filter((x) => x.id !== id)), [])
  const avisar = useCallback((texto, tono = 'ok') => {
    const id = Math.random().toString(36).slice(2)
    setAvisos((a) => [...a.slice(-3), { id, texto, tono }])
    setTimeout(() => quitar(id), tono === 'error' ? 7000 : 4200)
  }, [quitar])
  return (
    <AvisoCtx.Provider value={avisar}>
      {children}
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-[70] flex w-[min(92vw,440px)] -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
        {avisos.map((a) => <Toast key={a.id} a={a} onCerrar={() => quitar(a.id)} />)}
      </div>
    </AvisoCtx.Provider>
  )
}

/** Toast que se puede deslizar a los lados para cerrarlo. */
function Toast({ a, onCerrar }) {
  const [dx, setDx] = useState(0)
  const inicio = useRef(null)
  const soltar = () => {
    if (Math.abs(dx) > 70) onCerrar()
    else setDx(0)
    inicio.current = null
  }
  return (
    <div
      role="status"
      onPointerDown={(e) => { inicio.current = e.clientX; e.currentTarget.setPointerCapture(e.pointerId) }}
      onPointerMove={(e) => inicio.current != null && setDx(e.clientX - inicio.current)}
      onPointerUp={soltar}
      onPointerCancel={soltar}
      style={{ transform: `translateX(${dx}px)`, opacity: 1 - Math.min(Math.abs(dx) / 220, 0.7), transition: inicio.current == null ? 'transform .2s, opacity .2s' : 'none' }}
      className="anim-toast pointer-events-auto flex w-full cursor-grab touch-pan-y select-none items-start gap-2.5 rounded-2xl bg-tinta px-4 py-3 text-[13.5px] font-medium text-white shadow-[0_10px_30px_-12px_rgba(26,26,26,.45)] active:cursor-grabbing"
    >
      {a.tono === 'error' ? (
        <span className="grad-ot mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full"><AlertTriangle className="h-3 w-3" /></span>
      ) : (
        <span className="mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/15"><Check className="h-3 w-3" /></span>
      )}
      <span className="min-w-0 flex-1 leading-snug">{a.texto}</span>
      <button onClick={onCerrar} onPointerDown={(e) => e.stopPropagation()} className="-mr-1 grid h-6 w-6 shrink-0 place-items-center rounded-md text-white/60 hover:bg-white/10 hover:text-white" aria-label="Cerrar aviso">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
export const useAviso = () => useContext(AvisoCtx)

export function Campo({ etiqueta, ayuda, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium">{etiqueta}</span>
      {children}
      {ayuda && <span className="mt-1 block text-[12px] text-humo">{ayuda}</span>}
    </label>
  )
}

export const claseEntrada =
  'w-full rounded-xl border border-borde bg-white px-3.5 py-2.5 text-[14px] placeholder:text-gris focus:border-tinta focus:outline-none'

/** Nivel de habilidad 1–4 (Básico, Intermedio, Avanzado, Experto). */
export function Nivel({ n }) {
  return (
    <span className="flex gap-0.5" aria-label={`Nivel ${n} de 4`}>
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={`h-2.5 w-4 rounded-sm ${i <= n ? (n >= 3 ? 'bg-tinta' : 'bg-gris') : 'bg-linea'}`} />
      ))}
    </span>
  )
}


/** Isotipo OT sobre el degradado de marca (el rojo plano del PNG se aclara a degradado con «lighten»). */
export function Isotipo({ className = 'h-10 w-10', redondeo = 'rounded-xl' }) {
  return (
    <span className={`grad-ot relative block shrink-0 overflow-hidden ${redondeo} ${className}`}>
      <img src="/brand/isotipo.png" alt="" className="h-full w-full" style={{ mixBlendMode: 'lighten' }} />
    </span>
  )
}

/**
 * Avatar de un agente: su monito pixel art sobre un mosaico claro.
 * `estado` (quieto|pensando|hablando|feliz) y `animado` solo donde el agente está activo;
 * en listas y menús queda fijo para no distraer. `icono` se conserva por compatibilidad.
 */
// eslint-disable-next-line no-unused-vars
export function AvatarAgente({ ag, tam = 'h-9 w-9', icono, redondeo = 'rounded-xl', estado = 'quieto', animado = false }) {
  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden bg-[#FFF1EC] ring-1 ring-inset ring-[#FFD9CC] ${tam} ${redondeo}`}>
      <Monito agente={ag?.id} estado={estado} tam={null} titulo={ag?.nombre} className={`h-[86%] w-[86%] ${animado ? '' : 'monito-fijo'}`} />
    </span>
  )
}

// ============================================================ búsqueda
export function useDebounce(valor, ms = 200) {
  const [v, setV] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return v
}

const sinAcentos = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Resalta (sin importar acentos ni mayúsculas) la parte del texto que coincide con q. */
export function Resaltar({ texto, q }) {
  const t = String(texto ?? '')
  const b = sinAcentos(q).trim()
  if (!b || !t) return <>{t}</>
  // sinAcentos conserva la longitud para letras latinas comunes (NFD + quitar diacríticos ≈ 1:1 tras recomponer)
  const base = t.normalize('NFC')
  const plano = Array.from(base).map((ch) => sinAcentos(ch)).join('')
  if (plano.length !== base.length) return <>{t}</>
  const partes = []
  let i = 0
  let j = plano.indexOf(b)
  while (j !== -1) {
    if (j > i) partes.push(base.slice(i, j))
    partes.push(<mark key={j} className="resalte">{base.slice(j, j + b.length)}</mark>)
    i = j + b.length
    j = plano.indexOf(b, i)
  }
  if (i < base.length) partes.push(base.slice(i))
  return <>{partes}</>
}

export function CampoBusqueda({ valor, onCambio, placeholder = 'Buscar', className = '', etiqueta }) {
  return (
    <div className={`relative ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-humo" />
      <input
        type="search"
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        placeholder={placeholder}
        aria-label={etiqueta || placeholder}
        className="h-9 w-full rounded-xl border border-borde bg-white pl-9 pr-8 text-[13px] transition-[border-color,box-shadow] placeholder:text-humo focus:border-[#FF8A6A] focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:shadow-[0_0_0_3px_rgba(255,90,54,.12)] [&::-webkit-search-cancel-button]:hidden"
      />
      {valor && (
        <button onClick={() => onCambio('')} className="absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-humo hover:bg-panel hover:text-tinta" aria-label="Limpiar búsqueda">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

// ============================================================ contador animado
const reducido = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Número que sube de 0 a `valor` en ~600 ms al montar. */
export function Contador({ valor, formato = num, duracion = 600 }) {
  const [v, setV] = useState(() => (valor == null || reducido() ? valor : 0))
  useEffect(() => {
    if (valor == null || reducido()) return setV(valor)
    const destino = Number(valor)
    let raf
    const t0 = performance.now()
    const paso = (t) => {
      const p = Math.min((t - t0) / duracion, 1)
      const e = 1 - Math.pow(1 - p, 3)
      setV(p < 1 ? destino * e : destino)
      if (p < 1) raf = requestAnimationFrame(paso)
    }
    raf = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(raf)
  }, [valor, duracion])
  return <>{formato(v)}</>
}

/** Avatar de iniciales en degradado. */
export function Iniciales({ nombre, tam = 'h-10 w-10 text-[14px]', redondeo = 'rounded-2xl' }) {
  const ini = String(nombre || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?'
  return <span className={`grad-ot grid shrink-0 place-items-center font-semibold text-white ${tam} ${redondeo}`}>{ini}</span>
}

/** Pastilla de aviso fijo de alcance (p. ej. la prenómina no timbra). */
export function Aviso({ icono: Icono = AlertTriangle, children, className = '' }) {
  return (
    <div className={`flex items-start gap-2.5 rounded-2xl border border-linea bg-panel px-4 py-3 text-[13px] ${className}`}>
      <Icono className="mt-0.5 h-4 w-4 shrink-0 text-rojo" />
      <div>{children}</div>
    </div>
  )
}
