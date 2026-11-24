import React, { useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useColeccion } from '../lib/datos.js'
import { normal } from '../lib/formato.js'
import { Iniciales, Resaltar } from './ui.jsx'

const idDe = (c) => c.id_colaborador ?? c.id

/** Combo buscable de colaboradores (por defecto, solo plantilla activa). Siempre devuelve el ID, nunca el nombre. */
export default function SelectorColaborador({ valor, onCambio, soloActivos = true, placeholder = 'Elige un colaborador', className = '', requerido }) {
  const { datos, cargando } = useColeccion('colaboradores')
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [sel, setSel] = useState(0)
  const entrada = useRef(null)

  const lista = useMemo(() => {
    const t = normal(texto)
    return datos
      .filter((c) => c.es_plantilla !== 0 && (!soloActivos || c.estatus === 'Activo'))
      .filter((c) => !t || normal(c.nombre).includes(t) || normal(idDe(c)).includes(t) || normal(c.puesto).includes(t))
      .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'))
      .slice(0, 40)
  }, [datos, texto, soloActivos])
  const actual = datos.find((c) => idDe(c) === valor)

  const elegir = (c) => { onCambio(idDe(c), c); setAbierto(false); setTexto('') }

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => { setAbierto((a) => !a); setTimeout(() => entrada.current?.focus(), 0) }}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        className={`flex h-11 w-full items-center gap-2.5 rounded-xl border bg-white px-3 text-left text-[14px] transition-colors ${abierto ? 'border-[#FF8A6A] shadow-[0_0_0_3px_rgba(255,90,54,.12)]' : 'border-borde hover:border-gris'}`}
      >
        {actual ? (
          <>
            <Iniciales nombre={actual.nombre} tam="h-7 w-7 text-[11px]" redondeo="rounded-lg" />
            <span className="min-w-0 flex-1 truncate">{actual.nombre}<span className="ml-1.5 text-[12px] text-humo">{idDe(actual)}</span></span>
          </>
        ) : (
          <span className="flex-1 text-humo">{cargando ? 'Cargando…' : placeholder}</span>
        )}
        <ChevronDown className={`h-4 w-4 text-humo transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>
      {requerido && <input tabIndex={-1} aria-hidden required value={valor || ''} onChange={() => {}} className="pointer-events-none absolute bottom-0 left-4 h-px w-px opacity-0" />}
      {abierto && (
        <div className="anim-escala absolute inset-x-0 top-12 z-50 overflow-hidden rounded-2xl border border-linea bg-white shadow-[0_16px_40px_-16px_rgba(26,26,26,.3)]">
          <input
            ref={entrada}
            value={texto}
            onChange={(e) => { setTexto(e.target.value); setSel(0) }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, lista.length - 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
              if (e.key === 'Enter') { e.preventDefault(); if (lista[sel]) elegir(lista[sel]) }
              if (e.key === 'Escape') setAbierto(false)
            }}
            onBlur={() => setTimeout(() => setAbierto(false), 150)}
            placeholder="Nombre, ID o puesto"
            aria-label="Buscar colaborador"
            className="h-11 w-full border-b border-linea px-3.5 text-[13.5px] outline-none placeholder:text-humo focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <ul role="listbox" className="scroll-fino max-h-64 overflow-y-auto py-1">
            {lista.length === 0 && <li className="px-3.5 py-3 text-[13px] text-humo">Sin coincidencias</li>}
            {lista.map((c, i) => (
              <li key={c.id} role="option" aria-selected={idDe(c) === valor}>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); elegir(c) }}
                  onMouseMove={() => setSel(i)}
                  className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13.5px] ${i === sel ? 'bg-panel' : ''}`}
                >
                  <Iniciales nombre={c.nombre} tam="h-6 w-6 text-[10px]" redondeo="rounded-md" />
                  <span className="min-w-0 flex-1 truncate"><Resaltar texto={c.nombre} q={texto} /></span>
                  <span className="shrink-0 text-[11.5px] text-humo"><Resaltar texto={idDe(c)} q={texto} /></span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
