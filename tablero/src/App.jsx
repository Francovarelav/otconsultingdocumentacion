import React, { useEffect, useState } from 'react'
import { Calidad, Captura, Costos, Cumplimiento, Habilidades, Resumen, Rotacion, Utilizacion } from './Secciones.jsx'
import { Pastilla, fecha, num } from './ui.jsx'

const trazo = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' }
const Icono = ({ d }) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" {...trazo}>
    {d.map((p) => <path key={p} d={p} />)}
  </svg>
)

const SECCIONES = [
  { id: 'resumen', titulo: 'Resumen', grupo: 'Tablero', vista: Resumen, icono: ['M4 13h6V4H4z', 'M14 20h6v-9h-6z', 'M4 20h6v-3H4z', 'M14 7h6V4h-6z'] },
  { id: 'rotacion', titulo: 'Rotación', grupo: 'Indicadores', vista: Rotacion, icono: ['M4 12a8 8 0 0 1 14-5.3L20 9', 'M20 4v5h-5', 'M20 12a8 8 0 0 1-14 5.3L4 15', 'M4 20v-5h5'] },
  { id: 'utilizacion', titulo: 'Utilización', grupo: 'Indicadores', vista: Utilizacion, icono: ['M4 19V9', 'M10 19V5', 'M16 19v-7', 'M21 19H3'] },
  { id: 'costos', titulo: 'Costos', grupo: 'Indicadores', vista: Costos, icono: ['M12 3v18', 'M16.5 7.5c-.8-1.2-2.4-2-4.5-2-2.6 0-4.5 1.3-4.5 3.2 0 4.3 9 2.1 9 6.5 0 1.900-1.900 3.300-4.5 3.300-2.200 0-3.900-.9-4.700-2.300'] },
  { id: 'habilidades', titulo: 'Habilidades', grupo: 'Indicadores', vista: Habilidades, icono: ['M12 3l2.6 5.600 6 .700-4.500 4.200 1.200 6L12 16.500 6.700 19.500l1.200-6L3.400 9.300l6-.700z'] },
  { id: 'cumplimiento', titulo: 'Cumplimiento y activos', grupo: 'Indicadores', vista: Cumplimiento, icono: ['M6 3h9l4 4v14H6z', 'M14 3v5h5', 'M9 14l2.200 2.200L15 12'] },
  { id: 'captura', titulo: 'Captura pendiente', grupo: 'Datos', vista: Captura, icono: ['M4 20h4L19 9l-4-4L4 16z', 'M13.500 6.500l4 4'] },
  { id: 'calidad', titulo: 'Calidad de datos', grupo: 'Datos', vista: Calidad, icono: ['M12 3l7 3v6c0 4.500-3 7.500-7 9-4-1.500-7-4.500-7-9V6z', 'M9 12l2.200 2.200L15 10'] },
]

export default function App() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(false)
  const [activa, setActiva] = useState(() => {
    const h = window.location.hash.slice(1)
    return SECCIONES.some((s) => s.id === h) ? h : 'resumen'
  })

  useEffect(() => {
    fetch('./datos.json').then((r) => (r.ok ? r.json() : Promise.reject())).then(setDatos).catch(() => setError(true))
  }, [])

  const ir = (id) => {
    setActiva(id)
    window.history.replaceState(null, '', `#${id}`)
    window.scrollTo({ top: 0 })
  }

  if (error) return <SinDatos />
  if (!datos) return <p className="p-10 text-humo">Cargando indicadores…</p>

  const seccion = SECCIONES.find((s) => s.id === activa)
  const Vista = seccion.vista
  const altas = datos.captura.filter((c) => c.prioridad === 'Alta').length
  const grupos = [...new Set(SECCIONES.map((s) => s.grupo))]

  return (
    <div className="min-h-screen p-0 lg:p-8">
      <div className="mx-auto max-w-[1500px] bg-casco lg:flex lg:rounded-5xl">
        <nav aria-label="Secciones" className="shrink-0 px-5 pt-6 lg:w-72 lg:px-7 lg:py-9">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-tinta text-[13px] font-bold tracking-tight text-white">RH</span>
            <div>
              <p className="font-semibold leading-tight tracking-tight">OT Consulting</p>
              <p className="text-[13px] text-humo">Recursos Humanos</p>
            </div>
          </div>

          <div className="mt-6 flex gap-2 overflow-x-auto pb-3 lg:mt-9 lg:block lg:space-y-6 lg:overflow-visible lg:pb-0">
            {grupos.map((g) => (
              <div key={g} className="flex gap-2 lg:block">
                <p className="mb-2 hidden text-[13px] text-humo lg:block">{g}</p>
                <ul className="flex gap-2 lg:block lg:space-y-1">
                  {SECCIONES.filter((s) => s.grupo === g).map((s) => {
                    const on = s.id === activa
                    return (
                      <li key={s.id}>
                        <button onClick={() => ir(s.id)} aria-current={on ? 'page' : undefined}
                          className={`flex w-full items-center gap-3 whitespace-nowrap rounded-full py-2 pl-2 pr-4 text-left font-medium transition-colors ${on ? 'bg-white shadow-ficha' : 'hover:bg-panel'}`}>
                          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${on ? 'bg-carmin text-white' : 'bg-white text-tinta'}`}>
                            <Icono d={s.icono} />
                          </span>
                          <span className="flex-1">{s.titulo}</span>
                          {s.id === 'captura' && <span className="rounded-md bg-carmin px-1.5 py-0.5 text-[12px] font-semibold text-white">{altas}</span>}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>

          <p className="mt-8 hidden text-[12.5px] leading-relaxed text-humo lg:block">
            Lo rayado es dato que falta o se estimó. Nunca se rellena para que se vea completo.
          </p>
        </nav>

        <main className="min-w-0 flex-1 rounded-t-4xl bg-[#FAF9F8] px-5 py-7 sm:px-8 lg:rounded-5xl lg:px-10 lg:py-9">
          <div className="flex flex-wrap items-center gap-2">
            <Pastilla tono="blanco">Corte al {fecha(datos.meta.corte)}</Pastilla>
            <Pastilla tono="blanco">{num(datos.plantilla.activos)} activos</Pastilla>
            <Pastilla tono="blanco">{datos.meta.con_nombres ? 'Con nombres' : 'Solo ID, sin nombres'}</Pastilla>
          </div>
          <h1 className="mb-7 mt-6 text-[40px] font-semibold leading-none tracking-tight sm:text-[52px]">{seccion.titulo}</h1>
          <Vista d={datos} ir={ir} />
        </main>
      </div>
    </div>
  )
}

function SinDatos() {
  return (
    <div className="mx-auto max-w-xl p-10">
      <h1 className="text-3xl font-semibold tracking-tight">Falta generar los datos del tablero</h1>
      <p className="mt-3 text-humo">
        El tablero lee <code>public/datos.json</code>, que se genera desde los archivos de RH y no se versiona.
        Desde la raíz del repositorio corre:
      </p>
      <pre className="mt-4 overflow-x-auto rounded-3xl bg-tinta p-5 text-[13px] leading-relaxed text-white">
{`python src/acondicionamiento_rh.py
python src/exportar_tablero.py`}
      </pre>
      <p className="mt-4 text-humo">Después recarga esta página.</p>
    </div>
  )
}
