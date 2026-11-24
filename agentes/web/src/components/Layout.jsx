import React, { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import Paleta from './Paleta.jsx'
import { collection, query, where } from 'firebase/firestore'
import { LogOut, Menu, PanelLeft, Search } from 'lucide-react'
import { db } from '../firebase.js'
import { ROLES, useSesion } from '../lib/auth.jsx'
import { useEnVivo } from '../lib/datos.js'
import { seccionesPara } from '../lib/navegacion.js'
import { AvatarAgente, Isotipo } from './ui.jsx'

function leerPlegada() {
  try { return localStorage.getItem('otc.barraPlegada') === '1' } catch { return false }
}

export default function Layout() {
  const [plegada, setPlegada] = useState(leerPlegada)
  const [movil, setMovil] = useState(false)
  const [paleta, setPaleta] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => {
    const f = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaleta((p) => !p) }
    }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [])
  useEffect(() => setMovil(false), [pathname])
  useEffect(() => {
    try { localStorage.setItem('otc.barraPlegada', plegada ? '1' : '0') } catch { /* sin almacenamiento */ }
  }, [plegada])

  const { esColaborador } = useSesion()
  const tareas = useEnVivo(() => (esColaborador ? null : query(collection(db, 'tareas'), where('estado', '==', 'abierta'))), [esColaborador])
  const propuestas = useEnVivo(() => (esColaborador ? null : query(collection(db, 'propuestas'), where('estado', '==', 'pendiente'))), [esColaborador])
  const vacaciones = useEnVivo(() => (esColaborador ? null : query(collection(db, 'vacaciones'), where('estado', '==', 'pendiente'))), [esColaborador])
  const contadores = { tareas: tareas.datos.length, propuestas: propuestas.datos.length, vacaciones: vacaciones.datos.length }

  return (
    <div className="min-h-screen bg-lienzo lg:flex lg:gap-3 lg:p-3">
      {/* Barra superior en móvil */}
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-linea bg-barra px-4 py-3 lg:hidden">
        <button onClick={() => setMovil(true)} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-white" aria-label="Abrir menú">
          <Menu className="h-5 w-5" />
        </button>
        <Isotipo className="h-7 w-7" redondeo="rounded-lg" />
        <span className="flex-1 font-semibold tracking-apretado">OT Consulting</span>
        <button onClick={() => setPaleta(true)} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-white" aria-label="Buscar">
          <Search className="h-[18px] w-[18px]" />
        </button>
      </div>

      {movil && <button aria-label="Cerrar menú" className="fixed inset-0 z-40 bg-tinta/25 lg:hidden" onClick={() => setMovil(false)} />}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[272px] -translate-x-full p-3 transition-transform lg:sticky lg:top-3 lg:z-auto lg:h-[calc(100vh-1.5rem)] lg:translate-x-0 lg:p-0 ${movil ? 'translate-x-0' : ''} ${plegada ? 'lg:w-[76px]' : 'lg:w-[264px]'}`}
      >
        <Barra plegada={plegada && !movil} onPlegar={() => setPlegada((p) => !p)} contadores={contadores} onBuscar={() => setPaleta(true)} />
      </aside>

      <main className="min-w-0 flex-1 bg-white lg:min-h-[calc(100vh-1.5rem)] lg:rounded-5xl lg:border lg:border-linea">
        <div className="mx-auto w-full max-w-[1240px] px-4 py-7 sm:px-8 sm:py-10 lg:px-12">
          <div key={pathname} className="anim-pagina coreo">
            <Outlet />
          </div>
        </div>
      </main>
      {paleta && <Paleta onCerrar={() => setPaleta(false)} />}
    </div>
  )
}

function Barra({ plegada, onPlegar, contadores, onBuscar }) {
  const { nombre, rol, esAdmin, idColaborador, usuario, salir } = useSesion()
  const secciones = seccionesPara({ rol, esAdmin, idColaborador })
  return (
    <div className="flex h-full flex-col rounded-4xl border border-linea bg-barra p-2.5 shadow-barra">
      {/* Bloque de marca */}
      <div className={`flex items-center gap-3 rounded-3xl border border-linea bg-white p-2.5 ${plegada ? 'flex-col' : ''}`}>
        <Isotipo className="h-10 w-10" />
        {!plegada && (
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate font-semibold tracking-apretado">OT Consulting</p>
            <p className="truncate text-[12.5px] text-humo">Recursos Humanos</p>
          </div>
        )}
        <button
          onClick={onPlegar}
          className="hidden h-8 w-8 shrink-0 place-items-center rounded-lg text-humo hover:bg-panel hover:text-tinta lg:grid"
          aria-label={plegada ? 'Expandir barra lateral' : 'Plegar barra lateral'}
          title={plegada ? 'Expandir' : 'Plegar'}
        >
          <PanelLeft className="h-[18px] w-[18px]" />
        </button>
      </div>

      <button
        onClick={onBuscar}
        title={plegada ? 'Buscar (⌘K)' : undefined}
        className={`mt-2.5 flex h-11 w-full items-center gap-2.5 rounded-2xl border border-linea bg-white text-[14px] text-humo transition-colors hover:border-borde hover:text-tinta ${plegada ? 'justify-center' : 'px-3.5'}`}
        aria-label="Buscar en todo (⌘K)"
      >
        <Search className="h-4 w-4 shrink-0" />
        {!plegada && (
          <>
            <span className="flex-1 text-left">Buscar…</span>
            <kbd className="rounded-md border border-linea px-1.5 py-0.5 font-sans text-[11px]">⌘K</kbd>
          </>
        )}
      </button>

      <nav className="scroll-fino mt-3 flex-1 overflow-y-auto" aria-label="Navegación principal">
        {secciones.map((sec, k) => (
          <React.Fragment key={sec.titulo}>
            {k === 0 ? (
              !plegada && <p className="mb-1.5 mt-1 px-3 text-[11.5px] font-medium uppercase tracking-[0.06em] text-humo">{sec.titulo}</p>
            ) : (
              <Seccion plegada={plegada}>{sec.titulo}</Seccion>
            )}
            <ul className="space-y-0.5">
              {sec.items.map((i) => (
                <Item key={i.a} {...i} plegada={plegada} n={i.contador ? contadores[i.contador] : null} />
              ))}
            </ul>
          </React.Fragment>
        ))}
      </nav>

      {/* Usuario */}
      <div className={`mt-2 flex items-center gap-2.5 border-t border-linea px-1.5 pt-3 ${plegada ? 'flex-col' : ''}`}>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-tinta text-[13px] font-semibold text-white">
          {(nombre || usuario?.email || '?').slice(0, 1).toUpperCase()}
        </span>
        {!plegada && (
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13.5px] font-medium">{nombre || usuario?.email}</p>
            <p className="flex items-center gap-1.5 truncate text-[12px] text-humo">
              <span className={`h-1.5 w-1.5 rounded-full ${rol === 'admin' ? 'grad-ot' : rol === 'rh' ? 'bg-tinta' : 'bg-gris'}`} />
              {ROLES[rol]?.nombre || rol}
            </p>
          </div>
        )}
        <button onClick={salir} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-humo hover:bg-white hover:text-tinta" aria-label="Salir" title="Salir">
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function Seccion({ plegada, children }) {
  if (plegada) return <div className="mx-3 my-3 border-t border-linea" />
  return (
    <>
      <div className="mx-3 mb-3 mt-4 border-t border-linea" />
      <p className="mb-1.5 px-3 text-[11.5px] font-medium uppercase tracking-[0.06em] text-humo">{children}</p>
    </>
  )
}

function Item({ a, etiqueta, icono: Icono, fin, plegada, n, insignia, ag }) {
  return (
    <li>
      <NavLink
        to={a}
        end={fin}
        title={plegada ? etiqueta : undefined}
        className={({ isActive }) =>
          `relative flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] transition-colors ${plegada ? 'justify-center' : ''} ${isActive ? 'bg-white font-medium text-tinta shadow-barra ring-1 ring-linea' : 'text-tinta/80 hover:bg-white/70 hover:text-tinta'}`
        }
      >
        {({ isActive }) => (
          <>
            {isActive && !plegada && <span key={a} className="grad-ot-v absolute bottom-2.5 left-1 top-2.5 w-[3px] rounded-full" aria-hidden />}
            {ag ? (
              <AvatarAgente ag={ag} tam="h-6 w-6" icono="h-3.5 w-3.5" redondeo="rounded-md" />
            ) : (
              <Icono className={`h-[18px] w-[18px] shrink-0 ${isActive ? 'text-rojo' : ''}`} strokeWidth={1.8} />
            )}
            {!plegada && <span className="min-w-0 flex-1 truncate">{etiqueta}</span>}
            {!plegada && insignia && <span className="grad-ot rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold tracking-wide text-white">{insignia}</span>}
            {n > 0 &&
              (plegada ? (
                <span className="grad-ot absolute right-1.5 top-1.5 h-2 w-2 rounded-full" />
              ) : (
                <span className={`min-w-[1.5rem] rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold text-white tabular ${a === '/aprobaciones' ? 'grad-ot' : 'bg-tinta'}`}>{n > 99 ? '99+' : n}</span>
              ))}
          </>
        )}
      </NavLink>
    </li>
  )
}
