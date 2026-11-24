import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection } from 'firebase/firestore'
import { BookOpenCheck, CornerDownLeft, ListTodo, Search, User } from 'lucide-react'
import { seccionesPara } from '../lib/navegacion.js'
import { db } from '../firebase.js'
import { useSesion } from '../lib/auth.jsx'
import { useColeccion, useEnVivo } from '../lib/datos.js'
import { normal } from '../lib/formato.js'
import { AvatarAgente, Resaltar, useDebounce } from './ui.jsx'

/** Paleta de comandos global (⌘K / Ctrl+K). */
export default function Paleta({ onCerrar }) {
  const { esAdmin, rol, idColaborador, esColaborador } = useSesion()
  const navegar = useNavigate()
  const [texto, setTexto] = useState('')
  const q = useDebounce(texto, 120)
  const [sel, setSel] = useState(0)
  const entrada = useRef(null)
  const lista = useRef(null)
  const colaboradores = useColeccion(esColaborador ? null : 'colaboradores')
  const sops = useEnVivo(() => (esColaborador ? null : collection(db, 'sops')), [esColaborador])
  const tareas = useEnVivo(() => (esColaborador ? null : collection(db, 'tareas')), [esColaborador])

  useEffect(() => entrada.current?.focus(), [])

  const grupos = useMemo(() => {
    const t = normal(q)
    const pasa = (...campos) => !t || campos.some((c) => normal(c).includes(t))
    const secciones = seccionesPara({ rol, esAdmin, idColaborador })
    const pantallas = secciones.flatMap((sec) => sec.items.filter((i) => !i.ag).map((i) => ({ ...i, sec: sec.titulo })))
    const agentes = secciones.flatMap((sec) => sec.items.filter((i) => i.ag))
    const g = [
      { titulo: 'Pantallas', items: pantallas.filter((p) => pasa(p.etiqueta, p.sec)).map((p) => ({ clave: p.a, etiqueta: p.etiqueta, sub: p.sec, icono: p.icono, ir: p.a })) },
      { titulo: 'Agentes', items: agentes.filter((i) => pasa(i.ag.nombre, i.ag.descripcion)).map((i) => ({ clave: i.ag.id, etiqueta: i.ag.nombre, sub: i.ag.descripcion, ag: i.ag, ir: i.a })) },
    ]
    if (t && !esColaborador) {
      g.push({
        titulo: 'Colaboradores',
        items: colaboradores.datos.filter((c) => pasa(c.nombre, c.id_colaborador ?? c.id, c.puesto)).slice(0, 6).map((c) => ({
          clave: c.id, etiqueta: c.nombre || c.id, sub: [c.id_colaborador ?? c.id, c.puesto, c.estatus].filter(Boolean).join(' · '), icono: User, ir: `/colaboradores?id=${encodeURIComponent(c.id_colaborador ?? c.id)}`,
        })),
      })
      g.push({
        titulo: 'SOPs',
        items: sops.datos.filter((s) => pasa(s.id, s.titulo, s.objetivo)).slice(0, 5).map((s) => ({ clave: s.id, etiqueta: s.titulo, sub: s.id, icono: BookOpenCheck, ir: `/sops?id=${encodeURIComponent(s.id)}` })),
      })
      g.push({
        titulo: 'Tareas',
        items: tareas.datos.filter((x) => pasa(x.titulo, x.detalle, x.id_colaborador, x.tipo)).slice(0, 6).map((x) => ({
          clave: x.id, etiqueta: x.titulo || x.tipo, sub: [x.estado, x.prioridad && `prioridad ${x.prioridad}`, x.id_colaborador].filter(Boolean).join(' · '), icono: ListTodo, ir: `/bandeja?q=${encodeURIComponent(x.titulo || x.id)}&estado=todas`,
        })),
      })
    }
    return g.filter((x) => x.items.length)
  }, [q, esAdmin, rol, idColaborador, esColaborador, colaboradores.datos, sops.datos, tareas.datos])

  const planos = grupos.flatMap((g) => g.items)
  useEffect(() => setSel(0), [q])
  useEffect(() => {
    lista.current?.querySelector('[data-sel="1"]')?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  const ir = (item) => { navegar(item.ir); onCerrar() }
  const teclas = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, planos.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter' && planos[sel]) { e.preventDefault(); ir(planos[sel]) }
    else if (e.key === 'Escape') onCerrar()
  }

  let n = -1
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Búsqueda global">
      <button className="absolute inset-0 bg-tinta/25 backdrop-blur-[2px]" aria-label="Cerrar búsqueda" onClick={onCerrar} />
      <div className="anim-paleta relative w-full max-w-[620px] overflow-hidden rounded-3xl border border-linea bg-white shadow-[0_24px_60px_-20px_rgba(26,26,26,.35)]">
        <div className="flex items-center gap-3 border-b border-linea px-5">
          <Search className="h-[18px] w-[18px] shrink-0 text-humo" />
          <input
            ref={entrada}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={teclas}
            placeholder="Busca pantallas, agentes, colaboradores, SOPs o tareas…"
            aria-label="Buscar"
            className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-humo focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <kbd className="rounded-md border border-linea px-1.5 py-0.5 text-[11px] text-humo">Esc</kbd>
        </div>
        <ul ref={lista} className="scroll-fino max-h-[56vh] overflow-y-auto p-2">
          {planos.length === 0 && (
            <li className="px-4 py-10 text-center text-[13.5px] text-humo">{colaboradores.cargando ? 'Cargando…' : `Sin resultados para «${texto}».`}</li>
          )}
          {grupos.map((g) => (
            <li key={g.titulo}>
              <p className="px-3 pb-1 pt-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-humo">{g.titulo}</p>
              <ul>
                {g.items.map((it) => {
                  n += 1
                  const activo = n === sel
                  const idx = n
                  const Icono = it.icono
                  return (
                    <li key={g.titulo + it.clave}>
                      <button
                        data-sel={activo ? '1' : '0'}
                        onMouseMove={() => setSel(idx)}
                        onClick={() => ir(it)}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${activo ? 'bg-panel' : ''}`}
                      >
                        {it.ag ? <AvatarAgente ag={it.ag} tam="h-7 w-7" icono="h-3.5 w-3.5" redondeo="rounded-lg" /> : (
                          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${activo ? 'grad-ot text-white' : 'bg-panel text-tinta'}`}><Icono className="h-3.5 w-3.5" /></span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-medium"><Resaltar texto={it.etiqueta} q={q} /></span>
                          {it.sub && <span className="block truncate text-[12px] text-humo"><Resaltar texto={it.sub} q={q} /></span>}
                        </span>
                        {activo && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-humo" />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-4 border-t border-linea px-5 py-2.5 text-[11.5px] text-humo">
          <span><kbd className="font-sans">↑ ↓</kbd> moverte</span>
          <span><kbd className="font-sans">Enter</kbd> abrir</span>
          <span className="ml-auto">⌘K / Ctrl+K</span>
        </div>
      </div>
    </div>
  )
}
