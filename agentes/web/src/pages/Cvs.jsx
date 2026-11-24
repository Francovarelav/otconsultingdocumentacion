import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, limit, orderBy, query } from 'firebase/firestore'
import { ref, uploadBytes } from 'firebase/storage'
import { AlertTriangle, Bot, FileText, Loader2, Upload } from 'lucide-react'
import { api, db, mensajeError, storage } from '../firebase.js'
import { useBloqueo, useSesion } from '../lib/auth.jsx'
import { useEnVivo } from '../lib/datos.js'
import { NIVELES, fecha, hace, normal, num } from '../lib/formato.js'
import { Boton, CampoBusqueda, Cargando, Resaltar, useDebounce, Encabezado, ErrorCaja, Falta, Markdown, Nivel, Pastilla, Tabla, Vacio, useAviso } from '../components/ui.jsx'

const MAX_MB = 10

function nombreSeguro(nombre) {
  const base = nombre.replace(/\.pdf$/i, '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  return (base.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'cv') + '.pdf'
}

export default function Cvs() {
  const { usuario } = useSesion()
  const avisar = useAviso()
  const navegar = useNavigate()
  const cvs = useEnVivo(() => query(collection(db, 'cvs'), orderBy('creada', 'desc'), limit(50)), [])
  const [sel, setSel] = useState(null)
  const [subiendo, setSubiendo] = useState(null) // nombre del archivo en curso
  const [error, setError] = useState('')
  const [arrastrando, setArrastrando] = useState(false)
  const entrada = useRef(null)
  const bloqueo = useBloqueo()
  const [texto, setTexto] = useState('')
  const q = useDebounce(texto)
  const visibles = cvs.datos.filter((c) => {
    const b = normal(q)
    const p = c.perfil || {}
    return !b || [c.archivo, p.nombre, p.puesto_objetivo, ...(p.habilidades || []).map((h) => h.nombre)].some((x) => normal(x).includes(b))
  })

  useEffect(() => {
    if (!sel && cvs.datos.length) setSel(cvs.datos[0].id)
  }, [cvs.datos, sel])
  const actual = cvs.datos.find((c) => c.id === sel)

  const subir = async (archivo) => {
    setError('')
    if (!archivo) return
    if (archivo.type !== 'application/pdf' && !/\.pdf$/i.test(archivo.name)) return setError('Solo se aceptan archivos PDF.')
    if (archivo.size > MAX_MB * 1024 * 1024) return setError(`El PDF pesa más de ${MAX_MB} MB.`)
    setSubiendo(archivo.name)
    try {
      const ruta = `cvs/${usuario.uid}/${Date.now()}-${nombreSeguro(archivo.name)}`
      await uploadBytes(ref(storage, ruta), archivo, { contentType: 'application/pdf' })
      const res = await api.leerCv({ ruta, archivo: archivo.name })
      if (res?.id) setSel(res.id)
      avisar('CV procesado')
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setSubiendo(null)
      if (entrada.current) entrada.current.value = ''
    }
  }

  return (
    <div>
      <Encabezado titulo="Lector de CVs" subtitulo="Sube un CV en PDF: el Reclutador extrae el perfil, mapea sus habilidades al catálogo de 71 y te dice a quién cubre en la plantilla." />

      {bloqueo.disabled ? (
        <div className="flex items-center gap-3 rounded-3xl border border-dashed border-borde px-6 py-6 text-[13.5px] text-humo">
          <Upload className="h-5 w-5" /> Tu rol (lector) puede consultar los CVs procesados, pero no subir nuevos.
        </div>
      ) : (
      <label
        onDragOver={(e) => { e.preventDefault(); setArrastrando(true) }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastrando(false); subir(e.dataTransfer.files?.[0]) }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed px-6 py-10 text-center transition-colors sm:flex-row sm:text-left ${arrastrando ? 'border-rojo bg-rojo-suave' : 'border-borde bg-panel/60 hover:bg-panel'} ${subiendo ? 'pointer-events-none opacity-80' : ''}`}
      >
        <input ref={entrada} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => subir(e.target.files?.[0])} disabled={!!subiendo} />
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white text-tinta shadow-tarjeta">
          {subiendo ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
        </span>
        <span>
          <span className="block text-[16px] font-semibold tracking-apretado">
            {subiendo ? `Leyendo ${subiendo}…` : 'Arrastra un CV aquí o haz clic para elegirlo'}
          </span>
          <span className="mt-0.5 block text-[13px] text-humo">
            {subiendo ? 'El agente compara el perfil contra la matriz; puede tardar hasta un minuto.' : `Solo PDF, hasta ${MAX_MB} MB. El archivo se guarda en el almacenamiento privado del proyecto.`}
          </span>
        </span>
      </label>
      )}
      {error && <div className="mt-3"><ErrorCaja>{error}</ErrorCaja></div>}

      <div className="mt-8 grid gap-6 lg:grid-cols-[300px_1fr]">
        <div>
          <p className="mb-2 px-1 text-[11.5px] font-medium uppercase tracking-[0.06em] text-humo">CVs procesados</p>
          {cvs.datos.length > 0 && <CampoBusqueda valor={texto} onCambio={setTexto} placeholder="Nombre, puesto o habilidad" className="mb-2" />}
          {cvs.error ? <ErrorCaja error={cvs.error}>No se pudieron leer los CVs.</ErrorCaja> : cvs.cargando ? <Cargando /> : cvs.datos.length === 0 ? (
            <p className="px-1 text-[13px] text-humo">Todavía no se ha leído ningún CV.</p>
          ) : (
            <ul className="space-y-1">
              {visibles.length === 0 && <li className="px-1 text-[13px] text-humo">Ningún CV coincide.</li>}
              {visibles.map((c, i) => (
                <li key={c.id} style={{ '--i': i }} className="anim-lado">
                  <button onClick={() => setSel(c.id)} className={`flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${c.id === sel ? 'bg-linea' : 'hover:bg-panel'}`}>
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-humo" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium"><Resaltar texto={c.perfil?.nombre || c.archivo} q={q} /></span>
                      <span className="block truncate text-[12px] text-humo">{c.perfil?.puesto_objetivo && <><Resaltar texto={c.perfil.puesto_objetivo} q={q} /> · </>}{hace(c.creada)}</span>
                    </span>
                    <Estado estado={c.estado} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-w-0">
          {actual ? (
            <Detalle c={actual} onPlaticar={() => navegar(`/agente/reclutador?q=${encodeURIComponent(`Platiquemos el CV ${actual.id} (${actual.perfil?.nombre || actual.archivo}). ¿Qué tan bien cubre nuestras habilidades con riesgo de persona clave y para qué proyectos o banca lo recomiendas?`)}`)} />
          ) : !cvs.cargando && (
            <Vacio icono={FileText} titulo="Sin CV seleccionado" texto="Sube un PDF para ver el perfil, las habilidades mapeadas y la cobertura." />
          )}
        </div>
      </div>
    </div>
  )
}

function Estado({ estado }) {
  if (estado === 'procesando') return <Pastilla tono="neutro"><Loader2 className="h-3 w-3 animate-spin" />Procesando</Pastilla>
  if (estado === 'error') return <Pastilla tono="suave">Error</Pastilla>
  return null
}

function Detalle({ c, onPlaticar }) {
  if (c.estado === 'procesando') {
    return (
      <div className="flex flex-col items-center rounded-3xl border border-linea px-6 py-16 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-rojo" />
        <p className="mt-4 font-semibold">Leyendo {c.archivo}…</p>
        <p className="mt-1 text-[13px] text-humo">Esta vista se actualiza sola cuando termine.</p>
      </div>
    )
  }
  if (c.estado === 'error') {
    return (
      <div className="rounded-3xl border border-linea p-6">
        <ErrorCaja>
          <p className="font-semibold">No se pudo leer {c.archivo}.</p>
          {c.error && <p className="mt-1">{String(c.error)}</p>}
        </ErrorCaja>
      </div>
    )
  }

  const p = c.perfil || {}
  const habilidades = [...(p.habilidades || [])].sort((a, b) => (b.nivel_estimado || 0) - (a.nivel_estimado || 0))
  const certs = p.certificaciones || []
  const cobertura = [...(c.cobertura || [])].sort((a, b) => Number(!!b.riesgo_persona_clave) - Number(!!a.riesgo_persona_clave) || (a.expertos_actuales ?? 0) - (b.expertos_actuales ?? 0))
  const enRiesgo = cobertura.filter((x) => x.riesgo_persona_clave).length

  return (
    <article key={c.id} className="anim-entrar space-y-6">
      <header className="rounded-3xl border border-linea p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-[26px] font-semibold leading-tight tracking-titulo">{p.nombre || <Falta>Nombre no encontrado</Falta>}</h2>
            <p className="mt-1 text-[14px] text-humo">
              {p.puesto_objetivo || 'Puesto objetivo no indicado'}
              {p.anios_experiencia != null && ` · ${num(p.anios_experiencia)} años de experiencia`}
            </p>
          </div>
          <Boton variante="primario" icono={Bot} onClick={onPlaticar}>Platicarlo con el Reclutador</Boton>
        </div>
        {p.resumen && <p className="mt-4 text-[14px] leading-relaxed">{p.resumen}</p>}
        <p className="mt-4 text-[12px] text-humo">{c.archivo} · {fecha(c.creada)}</p>
      </header>

      {c.recomendacion && (
        <section className="rounded-3xl bg-tinta p-6 text-white">
          <p className="mb-2 text-[11.5px] font-medium uppercase tracking-[0.06em] text-white/60">Recomendación del Reclutador</p>
          <div className="[&_.md]:text-white [&_.md_a]:text-white [&_.md_code]:bg-white/10 [&_.md_th]:bg-white/10 [&_.md_th]:text-white/70 [&_.md_td]:border-white/15 [&_.md_th]:border-white/15 [&_.md_.tabla-md]:border-white/15">
            <Markdown>{c.recomendacion}</Markdown>
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-linea p-6">
        <h3 className="text-[16px] font-semibold tracking-apretado">Habilidades detectadas</h3>
        <p className="mt-1 text-[13px] text-humo">Nivel estimado 1–4 a partir de la evidencia del CV. Rayado = no existe en el catálogo de habilidades.</p>
        {habilidades.length === 0 ? <p className="mt-4 text-[13px] text-humo">No se detectaron habilidades.</p> : (
          <ul className="mt-4 divide-y divide-linea">
            {habilidades.map((h, i) => (
              <li key={`${h.cod_habilidad || h.nombre}-${i}`} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {h.nombre}
                    {h.cod_habilidad ? <span className="ml-2 font-mono text-[12px] text-humo">{h.cod_habilidad}</span> : <span className="ml-2"><Falta>Sin mapeo al catálogo</Falta></span>}
                  </p>
                  {h.evidencia && <p className="mt-0.5 text-[12.5px] text-humo">{h.evidencia}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Nivel n={h.nivel_estimado || 0} />
                  <span className="w-20 text-[12px] text-humo">{NIVELES[h.nivel_estimado] || '—'}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-3xl border border-linea p-6">
        <h3 className="text-[16px] font-semibold tracking-apretado">Certificaciones</h3>
        {certs.length === 0 ? <p className="mt-3 text-[13px] text-humo">El CV no menciona certificaciones.</p> : (
          <div className="mt-3">
            <Tabla
              minimo={460}
              filas={certs}
              columnas={[
                { titulo: 'Certificación', celda: (x) => <span className="font-medium">{x.nombre}</span> },
                { titulo: 'Emisor', celda: (x) => x.emisor || <Falta /> },
                { titulo: 'Obtención', celda: (x) => (x.fecha_obtencion ? fecha(x.fecha_obtencion) : <Falta>Sin fecha</Falta>) },
                { titulo: 'Vencimiento', celda: (x) => (x.fecha_vencimiento ? fecha(x.fecha_vencimiento) : <Falta>Sin fecha</Falta>) },
              ]}
            />
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-linea p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-[16px] font-semibold tracking-apretado">Cobertura en la plantilla</h3>
            <p className="mt-1 text-[13px] text-humo">Expertos actuales = activos con nivel 3–4 en esa habilidad. Riesgo de persona clave = 1 experto o ninguno.</p>
          </div>
          {enRiesgo > 0 && <Pastilla tono="rojo"><AlertTriangle className="h-3 w-3" />Cubre {num(enRiesgo)} en riesgo</Pastilla>}
        </div>
        <div className="mt-4">
          <Tabla
            minimo={420}
            filas={cobertura}
            vacio="Sin cobertura calculada (ninguna habilidad se mapeó al catálogo)."
            columnas={[
              {
                titulo: 'Habilidad',
                celda: (x) => (
                  <span className={x.riesgo_persona_clave ? 'font-semibold text-rojo' : ''}>
                    {x.habilidad}<span className="ml-2 font-mono text-[11.5px] font-normal text-humo">{x.cod_habilidad}</span>
                  </span>
                ),
              },
              { titulo: 'Expertos actuales', derecha: true, celda: (x) => <span className={x.riesgo_persona_clave ? 'font-semibold text-rojo' : ''}>{num(x.expertos_actuales)}</span> },
              { titulo: 'Riesgo', celda: (x) => (x.riesgo_persona_clave ? <Pastilla tono="rojo">Persona clave</Pastilla> : <span className="text-humo">—</span>) },
            ]}
          />
        </div>
      </section>
    </article>
  )
}
