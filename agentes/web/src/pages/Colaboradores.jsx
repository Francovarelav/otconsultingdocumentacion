import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { collection, doc, getDoc, query, where } from 'firebase/firestore'
import { ArrowUpRight, Bot, Lock, Users } from 'lucide-react'
import { db } from '../firebase.js'
import { useSesion } from '../lib/auth.jsx'
import { useColeccion, useEnVivo } from '../lib/datos.js'
import { NIVELES, dinero, fecha, hace, normal, num, pct } from '../lib/formato.js'
import {
  Avance, Boton, CampoBusqueda, Cargando, Encabezado, ErrorCaja, Falta, Nivel, Pastilla, Resaltar, useDebounce, Panel, Selector, Tabla, Vacio, Valor,
} from '../components/ui.jsx'
import { ResumenPlantilla } from '../components/GraficasPersonas.jsx'

export const BANDERAS = [
  { campo: 'falta_puesto', etiqueta: 'Sin puesto' },
  { campo: 'falta_departamento', etiqueta: 'Sin departamento' },
  { campo: 'falta_esquema_nomina', etiqueta: 'Sin esquema de nómina' },
  { campo: 'falta_sueldo', etiqueta: 'Sin sueldo' },
  { campo: 'falta_fecha_incorporacion', etiqueta: 'Sin fecha de ingreso' },
  { campo: 'falta_fecha_baja', etiqueta: 'Baja sin fecha' },
  { campo: 'inconsistencia_estatus_fecha', etiqueta: 'Activo con fecha de baja' },
  { campo: 'sobreasignado', etiqueta: 'Sobreasignado' },
]
const idDe = (c) => c.id_colaborador ?? c.id
export const si = (v) => v === 1 || v === true || v === '1'

export default function Colaboradores() {
  const { datos, cargando, error } = useColeccion('colaboradores')
  const [params, setParams] = useSearchParams()
  const seleccion = params.get('id')
  const [texto, setTexto] = useState('')
  const q = useDebounce(texto)
  const [estatus, setEstatus] = useState('Activo')
  const [banca, setBanca] = useState('todos')
  const [depto, setDepto] = useState('todos')
  const [bandera, setBandera] = useState('ninguna')
  const [familiares, setFamiliares] = useState(false)

  const departamentos = useMemo(
    () => [...new Set(datos.map((c) => c.departamento).filter(Boolean))].sort(),
    [datos],
  )

  const lista = useMemo(() => {
    const t = normal(q)
    return datos
      .filter((c) => familiares || c.es_plantilla !== 0)
      .filter((c) => estatus === 'todos' || c.estatus === estatus)
      .filter((c) => banca === 'todos' || (banca === 'banca' ? si(c.en_banca) : si(c.tiene_asignacion_vigente)))
      .filter((c) => depto === 'todos' || (depto === 'sin' ? !c.departamento : c.departamento === depto))
      .filter((c) => bandera === 'ninguna' || si(c[bandera]))
      .filter((c) => !t || normal(c.nombre).includes(t) || normal(idDe(c)).includes(t) || normal(c.puesto).includes(t))
      .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'))
  }, [datos, q, estatus, banca, depto, bandera, familiares])

  const actual = datos.find((c) => idDe(c) === seleccion)
  const abrir = (c) => setParams({ id: idDe(c) })
  const cerrar = () => setParams({})

  return (
    <div>
      <Encabezado titulo="Colaboradores" subtitulo="La plantilla tal como quedó tras el acondicionamiento. El rayado marca el dato que falta.">
        <Pastilla tono="neutro" className="!text-[13px]">{num(lista.length)} de {num(datos.length)}</Pastilla>
      </Encabezado>

      {!cargando && !error && <ResumenPlantilla datos={datos} />}

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <CampoBusqueda valor={texto} onCambio={setTexto} placeholder="Nombre, ID o puesto" className="w-full sm:w-[260px]" />
        <Selector valor={estatus} onCambio={setEstatus} opciones={[{ valor: 'Activo', etiqueta: 'Activos' }, { valor: 'Baja', etiqueta: 'Bajas' }, { valor: 'todos', etiqueta: 'Todos los estatus' }]} />
        <Selector valor={banca} onCambio={setBanca} opciones={[{ valor: 'todos', etiqueta: 'Banca y asignados' }, { valor: 'banca', etiqueta: 'En banca' }, { valor: 'asignados', etiqueta: 'Con asignación' }]} />
        <Selector valor={depto} onCambio={setDepto} opciones={[{ valor: 'todos', etiqueta: 'Todos los departamentos' }, { valor: 'sin', etiqueta: 'Sin departamento' }, ...departamentos.map((d) => ({ valor: d, etiqueta: d }))]} />
        <Selector valor={bandera} onCambio={setBandera} opciones={[{ valor: 'ninguna', etiqueta: 'Cualquier bandera' }, ...BANDERAS.map((b) => ({ valor: b.campo, etiqueta: b.etiqueta }))]} />
        <label className="ml-1 inline-flex items-center gap-2 text-[13px] text-humo">
          <input type="checkbox" checked={familiares} onChange={(e) => setFamiliares(e.target.checked)} className="accent-rojo" />
          Incluir familiares (no plantilla)
        </label>
      </div>

      {error ? (
        <ErrorCaja error={error}>No se pudo leer la colección colaboradores.</ErrorCaja>
      ) : cargando ? (
        <Cargando lineas={8} />
      ) : datos.length === 0 ? (
        <Vacio icono={Users} titulo="Aún no hay colaboradores cargados" texto="La colección colaboradores se llena con el script de carga desde otc_rh.db." />
      ) : (
        <Tabla
          minimo={860}
          filas={lista}
          claveFila={idDe}
          activa={seleccion}
          alClic={abrir}
          vacio="Ningún colaborador cumple con estos filtros."
          columnas={[
            { titulo: 'ID', celda: (c) => <span className="text-humo"><Resaltar texto={idDe(c)} q={q} /></span> },
            { titulo: 'Nombre', celda: (c) => <span className="font-medium">{c.nombre ? <Resaltar texto={c.nombre} q={q} /> : <Falta />}</span> },
            { titulo: 'Puesto', celda: (c) => <Valor v={c.puesto} formato={(v) => <Resaltar texto={v} q={q} />} /> },
            { titulo: 'Departamento', celda: (c) => <Valor v={c.departamento} /> },
            { titulo: 'Estatus', celda: (c) => <Pastilla tono={c.estatus === 'Activo' ? 'contorno' : 'neutro'}>{c.estatus}</Pastilla> },
            {
              titulo: 'Asignación',
              celda: (c) =>
                c.estatus !== 'Activo' ? <span className="text-humo">—</span> : si(c.en_banca) ? (
                  <Pastilla tono="suave">En banca{c.dias_en_banca != null && ` · ${num(c.dias_en_banca)} d`}</Pastilla>
                ) : (
                  <span>{num(c.asignaciones_vigentes)} vigente{c.asignaciones_vigentes === 1 ? '' : 's'}{si(c.sobreasignado) && <Pastilla tono="rojo" className="ml-1.5">{pct(c.dedicacion_total_pct, 0)}</Pastilla>}</span>
                ),
            },
            {
              titulo: 'Expediente',
              celda: (c) => (
                <div className="flex w-28 items-center gap-2">
                  <Avance valor={c.pct_expediente} rayado />
                  <span className="w-9 shrink-0 text-right text-[12px] tabular">{c.pct_expediente == null ? '—' : `${Math.round(c.pct_expediente)}%`}</span>
                </div>
              ),
            },
            {
              titulo: 'Banderas',
              celda: (c) => {
                const n = BANDERAS.filter((b) => si(c[b.campo])).length
                return n ? <Falta titulo="Banderas de calidad">{n}</Falta> : <span className="text-humo">—</span>
              },
            },
          ]}
        />
      )}

      <Panel
        abierto={!!seleccion}
        onCerrar={cerrar}
        titulo={actual?.nombre || seleccion}
        subtitulo={actual ? `${idDe(actual)} · ${actual.estatus}${actual.puesto ? ` · ${actual.puesto}` : ''}` : null}
        ancho="max-w-[620px]"
      >
        {actual ? <Detalle c={actual} /> : cargando ? <Cargando /> : <p className="text-humo">No se encontró el colaborador {seleccion}.</p>}
      </Panel>
    </div>
  )
}

// ============================================================ detalle
function Detalle({ c }) {
  const id = idDe(c)
  const navegar = useNavigate()
  const banderas = BANDERAS.filter((b) => si(c[b.campo]))
  return (
    <div className="space-y-7">
      <Link to={`/colaboradores/${encodeURIComponent(id)}`} className="flex items-center justify-between rounded-2xl border border-linea px-4 py-3 text-[14px] font-medium transition-colors hover:border-[#FFB59A] hover:bg-[#FFF6F2]">
        Ver ficha completa <ArrowUpRight className="h-4 w-4 text-rojo" />
      </Link>
      <Boton
        variante="tinta"
        icono={Bot}
        className="w-full"
        onClick={() => navegar(`/agente/asistente?q=${encodeURIComponent(`Cuéntame todo lo relevante de ${c.nombre} (${id}): asignaciones, habilidades, banderas de calidad, expediente y lo que haya en memoria. ¿Qué debería atender RH?`)}`)}
      >
        Preguntar al asistente sobre esta persona
      </Boton>

      <Bloque titulo="Banderas de calidad">
        {banderas.length === 0 ? (
          <p className="text-[13.5px] text-humo">Sin banderas: los datos clave están completos.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {banderas.map((b) => <Falta key={b.campo}>{b.etiqueta}</Falta>)}
          </div>
        )}
      </Bloque>

      <Bloque titulo="Datos">
        <dl className="grid grid-cols-2 gap-x-5 gap-y-3 text-[13.5px]">
          <Dato t="Puesto"><Valor v={c.puesto} /></Dato>
          <Dato t="Departamento"><Valor v={c.departamento} /></Dato>
          <Dato t="Esquema de nómina"><Valor v={c.esquema_nomina} /></Dato>
          <Dato t="Tipo de contrato"><Valor v={c.tipo_contrato} /></Dato>
          <Dato t="Ingreso"><Valor v={c.fecha_incorporacion} formato={fecha} /></Dato>
          <Dato t="Baja">{c.estatus === 'Baja' ? <Valor v={c.fecha_baja} formato={fecha} falta="Sin fecha" /> : '—'}</Dato>
          <Dato t="Antigüedad"><Valor v={c.antiguedad_meses} formato={(v) => `${num(v)} meses`} /></Dato>
          <Dato t="Ciudad"><Valor v={c.ciudad} formato={(v) => [v, c.estado].filter(Boolean).join(', ')} /></Dato>
          <Dato t="Edad"><Valor v={c.edad} formato={(v) => `${num(Math.floor(v))} años`} /></Dato>
          <Dato t="Aseguradora"><Valor v={c.aseguradora} /></Dato>
        </dl>
        <div className="mt-4 rounded-2xl bg-panel p-4">
          <div className="mb-2 flex items-baseline justify-between text-[13px]">
            <span className="font-medium">Expediente</span>
            <span className="tabular text-humo">{num(c.docs_cumplidos)} de {num(c.docs_obligatorios)} obligatorios · {c.pct_expediente == null ? '—' : pct(c.pct_expediente)}</span>
          </div>
          <Avance valor={c.pct_expediente} rayado tono={si(c.expediente_completo) ? 'bg-tinta' : 'bg-rojo'} />
        </div>
      </Bloque>

      <Costos id={id} />
      <Asignaciones id={id} />
      <Habilidades id={id} />
      <Activos id={id} />
      <MemoriaPersona id={id} />
    </div>
  )
}

export function Bloque({ titulo, nota, children }) {
  return (
    <section>
      <h3 className="mb-3 text-[14.5px] font-semibold tracking-apretado">{titulo}</h3>
      {nota && <p className="-mt-2 mb-3 text-[12.5px] text-humo">{nota}</p>}
      {children}
    </section>
  )
}
export function Dato({ t, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-humo">{t}</dt>
      <dd className="mt-0.5 truncate">{children}</dd>
    </div>
  )
}

export function Costos({ id }) {
  const { esAdmin } = useSesion()
  const [estado, setEstado] = useState({ cargando: esAdmin, datos: null, bloqueado: !esAdmin })
  useEffect(() => {
    if (!esAdmin) return
    let vivo = true
    getDoc(doc(db, 'colaboradores_privado', id))
      .then((s) => vivo && setEstado({ cargando: false, datos: s.exists() ? s.data() : {}, bloqueado: false }))
      .catch(() => vivo && setEstado({ cargando: false, datos: null, bloqueado: true }))
    return () => { vivo = false }
  }, [id, esAdmin])

  const p = estado.datos
  const celda = (v, f = dinero) =>
    estado.bloqueado ? (
      <span className="rayado inline-flex items-center gap-1 rounded-md bg-panel px-2 py-0.5 text-[12px] font-medium"><Lock className="h-3 w-3" /> solo admin</span>
    ) : (
      <Valor v={v} formato={f} />
    )

  return (
    <Bloque titulo="Costo" nota="Costo mensual = sueldo total integrado; costo por hora = costo mensual / 160 (regla 10).">
      {estado.cargando ? <Cargando lineas={1} /> : (
        <dl className="grid grid-cols-3 gap-x-5 text-[13.5px]">
          <Dato t="Costo mensual">{celda(p?.costo_mensual ?? p?.sueldo_total_integrado)}</Dato>
          <Dato t="Costo por hora">{celda(p?.costo_hora)}</Dato>
          <Dato t="Inversión en equipo">{celda(p?.inversion_equipo)}</Dato>
        </dl>
      )}
    </Bloque>
  )
}

export function Asignaciones({ id }) {
  const { datos, cargando } = useEnVivo(() => query(collection(db, 'asignaciones'), where('id_colaborador', '==', id)), [id])
  const proyectos = useColeccion('proyectos')
  const clientes = useColeccion('clientes')
  const proyecto = (pid) => proyectos.datos.find((p) => (p.id_proyecto ?? p.id) === pid)
  const cliente = (cid) => clientes.datos.find((c) => (c.id_cliente ?? c.id) === cid)
  const lista = [...datos].sort((a, b) => (b.vigente || 0) - (a.vigente || 0))
  return (
    <Bloque titulo="Asignaciones">
      {cargando ? <Cargando lineas={2} /> : lista.length === 0 ? (
        <p className="text-[13.5px] text-humo">Sin asignaciones registradas.</p>
      ) : (
        <ul className="space-y-2">
          {lista.map((a) => (
            <li key={a.id} className="rounded-2xl border border-linea p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{proyecto(a.id_proyecto)?.proyecto || <Falta>Sin proyecto</Falta>}</p>
                  <p className="text-[12.5px] text-humo">{cliente(a.id_cliente)?.cliente || a.id_cliente || '—'} · {a.rol_interno || 'Rol sin capturar'}</p>
                </div>
                <Pastilla tono={si(a.vigente) ? 'tinta' : 'neutro'}>{si(a.vigente) ? 'Vigente' : a.cerrada_por_baja ? 'Cerrada por baja' : 'Terminada'}</Pastilla>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
                <span>Inicio: <Valor v={a.fecha_inicio} formato={fecha} /></span>
                <span>Fin: {si(a.es_indefinida) ? 'Indefinida' : <Valor v={a.fecha_fin} formato={fecha} />}</span>
                <span>
                  Dedicación: {si(a.pct_dedicacion_estimado) ? <Falta titulo="Estimado: asignación única">{pct(a.pct_dedicacion, 0)} est.</Falta> : pct(a.pct_dedicacion, 0)}
                </span>
                {a.dias_para_fin_asignacion != null && <span className={a.dias_para_fin_asignacion <= 60 ? 'font-medium text-rojo' : ''}>Vence en {num(a.dias_para_fin_asignacion)} días</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Bloque>
  )
}

export function Habilidades({ id }) {
  const { datos, cargando } = useEnVivo(() => query(collection(db, 'matriz'), where('id_colaborador', '==', id)), [id])
  const catalogo = useColeccion('habilidades')
  const [todas, setTodas] = useState(false)
  const nombre = (cod) => catalogo.datos.find((h) => (h.cod_habilidad ?? h.id) === cod)
  const evaluadas = datos.filter((m) => m.nivel_num != null).sort((a, b) => b.nivel_num - a.nivel_num)
  const visibles = todas ? evaluadas : evaluadas.slice(0, 10)
  const sinFecha = evaluadas.filter((m) => !m.fecha_evaluacion).length
  return (
    <Bloque titulo="Habilidades" nota={evaluadas.length ? `${num(evaluadas.length)} evaluadas · ${num(sinFecha)} sin fecha de evaluación (regla 19).` : null}>
      {cargando ? <Cargando lineas={2} /> : evaluadas.length === 0 ? (
        <div className="rayado rounded-2xl bg-panel p-4 text-[13.5px]">Sin matriz de habilidades: esta persona no ha sido evaluada.</div>
      ) : (
        <>
          <ul className="space-y-2">
            {visibles.map((m) => {
              const h = nombre(m.cod_habilidad)
              return (
                <li key={m.id} className="flex items-center gap-3 text-[13.5px]">
                  <span className="min-w-0 flex-1 truncate">{h?.habilidad || m.cod_habilidad}<span className="ml-1.5 text-[12px] text-humo">{h?.tecnologia}</span></span>
                  <Nivel n={m.nivel_num} />
                  <span className="w-20 text-right text-[12px] text-humo">{NIVELES[m.nivel_num]}</span>
                </li>
              )
            })}
          </ul>
          {evaluadas.length > 10 && (
            <button onClick={() => setTodas((t) => !t)} className="mt-3 text-[13px] font-medium text-humo hover:text-tinta">
              {todas ? 'Ver menos' : `Ver las ${evaluadas.length}`}
            </button>
          )}
        </>
      )}
    </Bloque>
  )
}

export function Activos({ id }) {
  const { datos, cargando } = useEnVivo(() => query(collection(db, 'activos'), where('id_colaborador', '==', id)), [id])
  return (
    <Bloque titulo="Equipo asignado">
      {cargando ? <Cargando lineas={1} /> : datos.length === 0 ? (
        <p className="text-[13.5px] text-humo">Sin equipos registrados.</p>
      ) : (
        <ul className="divide-y divide-linea rounded-2xl border border-linea">
          {datos.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-[13.5px]">
              <div className="min-w-0">
                <p className="truncate font-medium">{[a.tipo, a.marca, a.modelo].filter(Boolean).join(' · ') || a.descripcion}</p>
                <p className="text-[12px] text-humo">{a.cod_activo ?? a.id}{si(a.liga_difusa) && ' · liga por nombre aproximada'}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {si(a.pendiente_recuperar) && <Pastilla tono="rojo">Por recuperar</Pastilla>}
                <span className="tabular"><Valor v={a.costo} formato={dinero} falta="Sin costo" /></span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Bloque>
  )
}

export function MemoriaPersona({ id }) {
  const { datos, cargando } = useEnVivo(() => query(collection(db, 'memoria'), where('entidad', '==', id)), [id])
  return (
    <Bloque titulo="Memoria sobre esta persona">
      {cargando ? <Cargando lineas={1} /> : datos.length === 0 ? (
        <p className="text-[13.5px] text-humo">Los agentes no han guardado notas sobre esta persona.</p>
      ) : (
        <ul className="space-y-2">
          {datos.map((m) => (
            <li key={m.id} className="rounded-2xl bg-panel p-3.5 text-[13.5px]">
              <p>{m.texto}</p>
              <p className="mt-1.5 text-[12px] text-humo">{m.tema} · {m.fuente === 'agente' ? 'Agente' : m.autor || 'Usuario'} · {hace(m.creada)}</p>
            </li>
          ))}
        </ul>
      )}
    </Bloque>
  )
}

