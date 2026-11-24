import React, { useMemo, useState } from 'react'
import { collection } from 'firebase/firestore'
import { Award, Compass, Eye, Megaphone, Pencil, Pin, PinOff, Plus, Target, Trash2 } from 'lucide-react'
import { api, db, mensajeError } from '../firebase.js'
import { useSesion } from '../lib/auth.jsx'
import { useColeccion, useDocVivo, useEnVivo } from '../lib/datos.js'
import { hace, ms, normal, num } from '../lib/formato.js'
import {
  Boton, CampoBusqueda, Campo, Cargando, Encabezado, ErrorCaja, Iniciales, Markdown, Panel, Pastilla, Pestanas, Resaltar,
  Vacio, claseEntrada, useAviso, useDebounce,
} from '../components/ui.jsx'

export default function Cultura() {
  const [pestana, setPestana] = useState('reconocimientos')
  const cultura = useDocVivo(['config', 'cultura'])
  return (
    <div>
      <Encabezado titulo="Cultura" subtitulo="Quiénes somos, a quién reconocemos y lo que comunicamos a todo el equipo." />
      <Pestanas
        className="mb-7"
        valor={pestana}
        onCambio={setPestana}
        opciones={[
          { valor: 'reconocimientos', etiqueta: 'Reconocimientos' },
          { valor: 'comunicados', etiqueta: 'Comunicados' },
          { valor: 'mision', etiqueta: 'Misión y valores' },
        ]}
      />
      <div key={pestana} className="anim-entrar">
        {pestana === 'mision' && <Mision cultura={cultura} />}
        {pestana === 'reconocimientos' && <Reconocimientos valores={(cultura.datos?.valores || []).map((v) => v?.nombre).filter(Boolean)} />}
        {pestana === 'comunicados' && <Comunicados />}
      </div>
    </div>
  )
}

// ============================================================ misión, visión y valores
function Mision({ cultura }) {
  const { puedeOperar } = useSesion()
  const [editando, setEditando] = useState(false)
  const c = cultura.datos
  if (cultura.cargando) return <Cargando lineas={5} />
  if (editando) return <EditarCultura c={c} onListo={() => setEditando(false)} />
  const vacia = !c || (!c.mision && !c.vision && !(c.valores || []).length)
  if (vacia) {
    return (
      <Vacio icono={Compass} titulo="Aún no hay misión ni valores" texto="Cuando RH los capture, aparecerán aquí para todo el equipo.">
        {puedeOperar && <Boton variante="primario" icono={Pencil} onClick={() => setEditando(true)}>Capturar misión y valores</Boton>}
      </Vacio>
    )
  }
  return (
    <div className="space-y-4">
      {puedeOperar && (
        <div className="flex justify-end">
          <Boton tam="ch" icono={Pencil} onClick={() => setEditando(true)}>Editar</Boton>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <Declaracion i={0} icono={Target} titulo="Misión" texto={c.mision} />
        <Declaracion i={1} icono={Eye} titulo="Visión" texto={c.vision} />
      </div>
      {(c.valores || []).length > 0 && (
        <section>
          <h2 className="mb-3 mt-6 text-[19px] font-semibold tracking-apretado">Nuestros valores</h2>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {c.valores.map((v, i) => (
              <li key={i} style={{ '--i': i + 2 }} className="anim-entrar rounded-3xl border border-linea bg-white p-5 transition-colors hover:border-borde">
                <span className="grad-ot grid h-8 w-8 place-items-center rounded-lg text-[13px] font-semibold text-white tabular">{i + 1}</span>
                <p className="mt-3 text-[16px] font-semibold tracking-apretado">{v.nombre}</p>
                {v.descripcion && <p className="mt-1 text-[13.5px] leading-relaxed text-humo">{v.descripcion}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function Declaracion({ icono: Icono, titulo, texto, i }) {
  return (
    <section style={{ '--i': i }} className="mesh anim-entrar rounded-3xl border border-linea p-6">
      <div className="flex items-center gap-2">
        <span className="grad-ot grid h-8 w-8 place-items-center rounded-lg text-white"><Icono className="h-4 w-4" /></span>
        <h2 className="text-[15px] font-semibold tracking-apretado">{titulo}</h2>
      </div>
      <p className="mt-4 text-[17px] leading-relaxed">{texto || <span className="text-humo">Sin capturar.</span>}</p>
    </section>
  )
}

function EditarCultura({ c, onListo }) {
  const avisar = useAviso()
  const [f, setF] = useState(() => ({
    mision: c?.mision || '',
    vision: c?.vision || '',
    valores: (c?.valores || []).length ? c.valores.map((v) => ({ nombre: v.nombre || '', descripcion: v.descripcion || '' })) : [{ nombre: '', descripcion: '' }],
  }))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const setValor = (i, k, v) => setF((x) => ({ ...x, valores: x.valores.map((y, j) => (j === i ? { ...y, [k]: v } : y)) }))

  const guardar = async (e) => {
    e.preventDefault()
    setError('')
    setGuardando(true)
    try {
      await api.guardarCultura({
        mision: f.mision.trim(),
        vision: f.vision.trim(),
        valores: f.valores.map((v) => ({ nombre: v.nombre.trim(), descripcion: v.descripcion.trim() })).filter((v) => v.nombre),
      })
      avisar('Cultura guardada')
      onListo()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={guardar} className="space-y-5 rounded-3xl border border-linea p-6 sm:p-8">
      <div className="grid gap-4 md:grid-cols-2">
        <Campo etiqueta="Misión"><textarea rows={4} value={f.mision} onChange={(e) => setF({ ...f, mision: e.target.value })} className={claseEntrada} /></Campo>
        <Campo etiqueta="Visión"><textarea rows={4} value={f.vision} onChange={(e) => setF({ ...f, vision: e.target.value })} className={claseEntrada} /></Campo>
      </div>
      <div>
        <p className="mb-2 text-[13px] font-medium">Valores</p>
        <ul className="space-y-2">
          {f.valores.map((v, i) => (
            <li key={i} className="grid gap-2 rounded-2xl bg-panel p-3 sm:grid-cols-[220px_1fr_auto]">
              <input value={v.nombre} onChange={(e) => setValor(i, 'nombre', e.target.value)} placeholder="Nombre del valor" aria-label={`Nombre del valor ${i + 1}`} className={claseEntrada} />
              <input value={v.descripcion} onChange={(e) => setValor(i, 'descripcion', e.target.value)} placeholder="Qué significa en el día a día" aria-label={`Descripción del valor ${i + 1}`} className={claseEntrada} />
              <button type="button" onClick={() => setF((x) => ({ ...x, valores: x.valores.filter((_, j) => j !== i) }))} className="grid h-11 w-11 place-items-center rounded-xl text-humo hover:bg-white hover:text-rojo" aria-label="Quitar valor">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
        <Boton tam="ch" icono={Plus} className="mt-2" onClick={() => setF((x) => ({ ...x, valores: [...x.valores, { nombre: '', descripcion: '' }] }))}>Agregar valor</Boton>
      </div>
      {error && <ErrorCaja>{error}</ErrorCaja>}
      <div className="flex justify-end gap-2">
        <Boton onClick={onListo}>Cancelar</Boton>
        <Boton type="submit" variante="primario" cargando={guardando}>Guardar</Boton>
      </div>
    </form>
  )
}

// ============================================================ reconocimientos
function Reconocimientos({ valores }) {
  const { datos, cargando, error } = useEnVivo(() => collection(db, 'reconocimientos'), [])
  const [texto, setTexto] = useState('')
  const q = useDebounce(texto)
  const [nuevo, setNuevo] = useState(false)

  const lista = useMemo(() => {
    const b = normal(q)
    return datos
      .filter((r) => !b || [r.para_nombre, r.de_nombre, r.valor, r.mensaje].some((c) => normal(c).includes(b)))
      .sort((a, b2) => ms(b2.creada) - ms(a.creada))
  }, [datos, q])

  const mes = useMemo(() => {
    const ahora = new Date()
    return datos.filter((r) => {
      const d = new Date(ms(r.creada))
      return d.getMonth() === ahora.getMonth() && d.getFullYear() === ahora.getFullYear()
    }).length
  }, [datos])

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <CampoBusqueda valor={texto} onCambio={setTexto} placeholder="Persona, valor o mensaje" className="w-full sm:w-[280px]" />
        <span className="text-[13px] text-humo">{num(datos.length)} reconocimientos · {num(mes)} este mes</span>
        <Boton variante="primario" icono={Award} className="ml-auto" onClick={() => setNuevo(true)}>Reconocer a alguien</Boton>
      </div>

      {error ? (
        <ErrorCaja error={error}>No se pudieron leer los reconocimientos.</ErrorCaja>
      ) : cargando ? (
        <Cargando lineas={5} />
      ) : datos.length === 0 ? (
        <Vacio icono={Award} titulo="El muro está vacío" texto="Reconoce el trabajo de un compañero; aparecerá aquí para todo el equipo.">
          <Boton variante="primario" icono={Award} onClick={() => setNuevo(true)}>Reconocer a alguien</Boton>
        </Vacio>
      ) : lista.length === 0 ? (
        <Vacio titulo="Sin coincidencias" texto="Prueba con otro nombre o valor." />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {lista.map((r, i) => (
            <li key={r.id} style={{ '--i': i }} className="anim-entrar flex flex-col rounded-3xl border border-linea bg-white p-5 transition-colors hover:border-borde">
              <div className="flex items-center gap-3">
                <Iniciales nombre={r.para_nombre} tam="h-11 w-11 text-[14px]" />
                <div className="min-w-0">
                  <p className="truncate font-semibold tracking-apretado"><Resaltar texto={r.para_nombre || r.para_id_colaborador} q={q} /></p>
                  {r.valor && <Pastilla tono="suave" className="mt-1"><Resaltar texto={r.valor} q={q} /></Pastilla>}
                </div>
              </div>
              <p className="mt-4 flex-1 whitespace-pre-wrap text-[14px] leading-relaxed"><Resaltar texto={r.mensaje} q={q} /></p>
              <p className="mt-4 text-[12px] text-humo">De <Resaltar texto={r.de_nombre || 'alguien del equipo'} q={q} /> · {hace(r.creada)}</p>
            </li>
          ))}
        </ul>
      )}

      <Panel abierto={nuevo} onCerrar={() => setNuevo(false)} titulo="Reconocer a alguien" subtitulo="Lo verá todo el equipo en el muro.">
        {nuevo && <NuevoReconocimiento valores={valores} onListo={() => setNuevo(false)} />}
      </Panel>
    </div>
  )
}

function NuevoReconocimiento({ valores, onListo }) {
  const avisar = useAviso()
  const { idColaborador } = useSesion()
  const colaboradores = useColeccion('colaboradores')
  const [busca, setBusca] = useState('')
  const q = useDebounce(busca, 120)
  const [para, setPara] = useState(null)
  const [valor, setValor] = useState(valores[0] || '')
  const [mensaje, setMensaje] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  const activos = useMemo(
    () => colaboradores.datos.filter((c) => c.es_plantilla !== 0 && c.estatus === 'Activo' && (c.id_colaborador ?? c.id) !== idColaborador),
    [colaboradores.datos, idColaborador],
  )
  const opciones = useMemo(() => {
    const b = normal(q)
    return activos
      .filter((c) => !b || normal(c.nombre).includes(b) || normal(c.id_colaborador ?? c.id).includes(b))
      .sort((a, b2) => String(a.nombre).localeCompare(String(b2.nombre), 'es'))
      .slice(0, 8)
  }, [activos, q])

  const enviar = async (e) => {
    e.preventDefault()
    setError('')
    if (!para) return setError('Elige a quién reconoces.')
    if (!valor.trim()) return setError('Elige o escribe el valor.')
    if (mensaje.trim().length < 10) return setError('Cuenta un poco más: al menos 10 caracteres.')
    setEnviando(true)
    try {
      await api.crearReconocimiento({ para_id_colaborador: para.id_colaborador ?? para.id, valor: valor.trim(), mensaje: mensaje.trim() })
      avisar(`Reconocimiento enviado a ${para.nombre}`)
      onListo()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-5">
      <div>
        <p className="mb-1.5 text-[13px] font-medium">Para</p>
        {para ? (
          <div className="flex items-center gap-3 rounded-2xl border border-[#FF8A6A] bg-[#FFF6F2] p-3">
            <Iniciales nombre={para.nombre} tam="h-9 w-9 text-[13px]" redondeo="rounded-xl" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{para.nombre}</span>
              <span className="block text-[12px] text-humo">{para.id_colaborador ?? para.id}{para.puesto ? ` · ${para.puesto}` : ''}</span>
            </span>
            <Boton tam="ch" variante="fantasma" onClick={() => setPara(null)}>Cambiar</Boton>
          </div>
        ) : (
          <div>
            <CampoBusqueda valor={busca} onCambio={setBusca} placeholder="Busca por nombre o ID" />
            <ul className="mt-2 max-h-[260px] space-y-1 overflow-y-auto scroll-fino">
              {colaboradores.cargando && <li className="px-2 text-[13px] text-humo">Cargando…</li>}
              {!colaboradores.cargando && opciones.length === 0 && <li className="px-2 text-[13px] text-humo">Nadie coincide.</li>}
              {opciones.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => setPara(c)} className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-panel">
                    <Iniciales nombre={c.nombre} tam="h-8 w-8 text-[12px]" redondeo="rounded-lg" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium"><Resaltar texto={c.nombre} q={q} /></span>
                      <span className="block truncate text-[12px] text-humo"><Resaltar texto={c.id_colaborador ?? c.id} q={q} />{c.puesto ? ` · ${c.puesto}` : ''}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div>
        <p className="mb-1.5 text-[13px] font-medium">Valor</p>
        {valores.length ? (
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Valor">
            {valores.map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={valor === v}
                onClick={() => setValor(v)}
                className={`rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors ${valor === v ? 'grad-ot border-transparent text-white' : 'border-linea hover:border-borde hover:bg-panel'}`}
              >
                {v}
              </button>
            ))}
          </div>
        ) : (
          <input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ej. Colaboración" className={claseEntrada} />
        )}
      </div>

      <Campo etiqueta="Mensaje" ayuda="¿Qué hizo y por qué importa?">
        <textarea rows={4} value={mensaje} onChange={(e) => setMensaje(e.target.value)} maxLength={600} className={claseEntrada} />
      </Campo>

      {error && <ErrorCaja>{error}</ErrorCaja>}
      <Boton type="submit" variante="primario" icono={Award} cargando={enviando} className="w-full">Enviar reconocimiento</Boton>
    </form>
  )
}

// ============================================================ comunicados
function Comunicados() {
  const { puedeOperar } = useSesion()
  const { datos, cargando, error } = useEnVivo(() => collection(db, 'comunicados'), [])
  const [texto, setTexto] = useState('')
  const q = useDebounce(texto)
  const [editando, setEditando] = useState(null) // null | 'nuevo' | comunicado

  const lista = useMemo(() => {
    const b = normal(q)
    return datos
      .filter((c) => !b || normal(c.titulo).includes(b) || normal(c.cuerpo).includes(b))
      .sort((a, b2) => Number(!!b2.fijado) - Number(!!a.fijado) || ms(b2.creada) - ms(a.creada))
  }, [datos, q])

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <CampoBusqueda valor={texto} onCambio={setTexto} placeholder="Buscar comunicado" className="w-full sm:w-[280px]" />
        {puedeOperar && <Boton variante="primario" icono={Megaphone} className="ml-auto" onClick={() => setEditando('nuevo')}>Publicar comunicado</Boton>}
      </div>

      {error ? (
        <ErrorCaja error={error}>No se pudieron leer los comunicados.</ErrorCaja>
      ) : cargando ? (
        <Cargando lineas={5} />
      ) : datos.length === 0 ? (
        <Vacio icono={Megaphone} titulo="Sin comunicados" texto={puedeOperar ? 'Publica avisos para todo el equipo; puedes fijar los importantes arriba.' : 'Cuando RH publique un aviso, aparecerá aquí.'} />
      ) : lista.length === 0 ? (
        <Vacio titulo="Sin coincidencias" texto="Prueba con otras palabras." />
      ) : (
        <ul className="space-y-3">
          {lista.map((c, i) => (
            <Comunicado key={c.id} c={c} i={i} q={q} puedeOperar={puedeOperar} onEditar={() => setEditando(c)} />
          ))}
        </ul>
      )}

      <Panel
        abierto={!!editando}
        onCerrar={() => setEditando(null)}
        titulo={editando === 'nuevo' ? 'Nuevo comunicado' : 'Editar comunicado'}
        subtitulo="El cuerpo acepta markdown: **negritas**, listas y enlaces."
        ancho="max-w-[640px]"
      >
        {editando && <EditarComunicado c={editando === 'nuevo' ? null : editando} onListo={() => setEditando(null)} />}
      </Panel>
    </div>
  )
}

function Comunicado({ c, i, q, puedeOperar, onEditar }) {
  const avisar = useAviso()
  const [ocupado, setOcupado] = useState(false)
  const fijar = async () => {
    setOcupado(true)
    try {
      await api.publicarComunicado({ id: c.id, titulo: c.titulo, cuerpo: c.cuerpo, fijado: !c.fijado })
      avisar(c.fijado ? 'Comunicado desfijado' : 'Comunicado fijado')
    } catch (err) {
      avisar(mensajeError(err), 'error')
    } finally {
      setOcupado(false)
    }
  }
  return (
    <li style={{ '--i': i }} className={`anim-entrar relative overflow-hidden rounded-3xl border bg-white p-6 transition-colors hover:border-borde ${c.fijado ? 'border-[#FFB59A]' : 'border-linea'}`}>
      {c.fijado && <span className="grad-ot-h absolute inset-x-0 top-0 h-[3px]" aria-hidden />}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {c.fijado && <Pastilla tono="suave" className="mb-2"><Pin className="h-3 w-3" />Fijado</Pastilla>}
          <h3 className="text-[18px] font-semibold tracking-apretado"><Resaltar texto={c.titulo} q={q} /></h3>
          <p className="mt-0.5 text-[12.5px] text-humo">{c.autor || 'RH'} · {hace(c.creada)}</p>
        </div>
        {puedeOperar && (
          <div className="flex gap-1.5">
            <Boton tam="ch" variante="fantasma" icono={c.fijado ? PinOff : Pin} cargando={ocupado} onClick={fijar}>{c.fijado ? 'Desfijar' : 'Fijar'}</Boton>
            <Boton tam="ch" icono={Pencil} onClick={onEditar}>Editar</Boton>
          </div>
        )}
      </div>
      <div className="mt-4">
        <Markdown>{c.cuerpo}</Markdown>
      </div>
    </li>
  )
}

function EditarComunicado({ c, onListo }) {
  const avisar = useAviso()
  const [f, setF] = useState({ titulo: c?.titulo || '', cuerpo: c?.cuerpo || '', fijado: !!c?.fijado })
  const [vista, setVista] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const guardar = async (e) => {
    e.preventDefault()
    setError('')
    if (!f.titulo.trim() || !f.cuerpo.trim()) return setError('Escribe el título y el cuerpo.')
    setGuardando(true)
    try {
      await api.publicarComunicado({ ...(c ? { id: c.id } : {}), titulo: f.titulo.trim(), cuerpo: f.cuerpo.trim(), fijado: f.fijado })
      avisar(c ? 'Comunicado actualizado' : 'Comunicado publicado')
      onListo()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setGuardando(false)
    }
  }
  return (
    <form onSubmit={guardar} className="space-y-4">
      <Campo etiqueta="Título"><input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} className={claseEntrada} /></Campo>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[13px] font-medium">Cuerpo</span>
          <button type="button" onClick={() => setVista((v) => !v)} className="text-[12.5px] font-medium text-humo hover:text-tinta">{vista ? 'Editar' : 'Vista previa'}</button>
        </div>
        {vista ? (
          <div className="min-h-[200px] rounded-xl border border-linea p-4"><Markdown>{f.cuerpo || '*Sin contenido*'}</Markdown></div>
        ) : (
          <textarea rows={10} value={f.cuerpo} onChange={(e) => setF({ ...f, cuerpo: e.target.value })} className={`${claseEntrada} font-mono text-[13px]`} />
        )}
      </div>
      <label className="flex items-center gap-2 text-[13.5px]">
        <input type="checkbox" checked={f.fijado} onChange={(e) => setF({ ...f, fijado: e.target.checked })} className="accent-rojo" />
        Fijar arriba
      </label>
      {error && <ErrorCaja>{error}</ErrorCaja>}
      <div className="flex justify-end gap-2">
        <Boton onClick={onListo}>Cancelar</Boton>
        <Boton type="submit" variante="primario" icono={Megaphone} cargando={guardando}>{c ? 'Guardar' : 'Publicar'}</Boton>
      </div>
    </form>
  )
}
