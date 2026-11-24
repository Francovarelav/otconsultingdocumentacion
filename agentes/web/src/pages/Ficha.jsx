import React, { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { collection, query, where } from 'firebase/firestore'
import { ArrowLeft, Award, Bot, CheckCircle2, Circle, History, MinusCircle } from 'lucide-react'
import { db } from '../firebase.js'
import { useSesion } from '../lib/auth.jsx'
import { useColeccion, useDocVivo, useEnVivo } from '../lib/datos.js'
import { NIVELES, fecha, hace, humano, ms, num, pct } from '../lib/formato.js'
import Saldo from '../components/Saldo.jsx'
import Recibos from '../components/Recibos.jsx'
import { MisRegistros } from './Asistencia.jsx'
import { TIPOS_AUSENCIA } from './Vacaciones.jsx'
import { Activos, Asignaciones, BANDERAS, Bloque, Costos, Dato, MemoriaPersona, si } from './Colaboradores.jsx'
import { Avance, Boton, Cargando, ErrorCaja, Falta, Iniciales, Pastilla, Pestanas, Tabla, Vacio, Valor } from '../components/ui.jsx'

const DOCUMENTOS = [
  { campo: 'doc_contrato', nombre: 'Contrato' },
  { campo: 'doc_acta', nombre: 'Acta de nacimiento' },
  { campo: 'doc_ine', nombre: 'INE' },
  { campo: 'doc_curp', nombre: 'CURP' },
  { campo: 'doc_csf', nombre: 'Constancia de situación fiscal' },
  { campo: 'doc_nss', nombre: 'Número de seguro social' },
  { campo: 'doc_comprobante_domicilio', nombre: 'Comprobante de domicilio' },
  { campo: 'doc_banco', nombre: 'Datos bancarios' },
  { campo: 'doc_foto', nombre: 'Fotografía' },
  { campo: 'aviso_infonavit', nombre: 'Aviso Infonavit' },
  { campo: 'aviso_manutencion', nombre: 'Aviso de manutención' },
  { campo: 'formato_rh', nombre: 'Formato de RH' },
  { campo: 'doc_pasaporte', nombre: 'Pasaporte', opcional: true },
  { campo: 'doc_visa', nombre: 'Visa', opcional: true },
]

export default function Ficha({ id }) {
  const { esAdmin, esColaborador, idColaborador } = useSesion()
  const navegar = useNavigate()
  const { datos: c, cargando, error } = useDocVivo(['colaboradores', id])
  const propia = esColaborador && idColaborador === id
  const [pestana, setPestana] = useState('general')

  const pestanas = [
    { valor: 'general', etiqueta: 'General' },
    ...(!esColaborador ? [{ valor: 'asignaciones', etiqueta: 'Asignaciones' }, { valor: 'habilidades', etiqueta: 'Habilidades' }] : []),
    { valor: 'asistencia', etiqueta: 'Asistencia' },
    { valor: 'vacaciones', etiqueta: 'Vacaciones' },
    ...(esAdmin || propia ? [{ valor: 'nomina', etiqueta: 'Nómina' }] : []),
    { valor: 'expediente', etiqueta: 'Expediente' },
    ...(!esColaborador ? [{ valor: 'equipo', etiqueta: 'Equipo' }] : []),
    { valor: 'reconocimientos', etiqueta: 'Reconocimientos' },
    ...(!esColaborador ? [{ valor: 'memoria', etiqueta: 'Memoria' }, { valor: 'historial', etiqueta: 'Historial' }] : []),
  ]

  if (cargando) return <Cargando lineas={8} />
  if (error) return <ErrorCaja error={error}>No tienes acceso a esta ficha o no se pudo leer.</ErrorCaja>
  if (!c) return <Vacio titulo={`No existe el colaborador ${id}`} texto="Revisa el ID; las fichas se ligan siempre por ID, nunca por nombre."><Link to="/colaboradores" className="text-[13.5px] font-medium text-rojo">Ir a Colaboradores</Link></Vacio>

  const banderas = BANDERAS.filter((b) => si(c[b.campo]))
  const anios = c.antiguedad_meses != null ? Math.floor(c.antiguedad_meses / 12) : null

  return (
    <div>
      <div>
        {!esColaborador && (
          <Link to="/colaboradores" className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-humo hover:text-tinta">
            <ArrowLeft className="h-4 w-4" /> Colaboradores
          </Link>
        )}
        <header className="mesh flex flex-col gap-5 rounded-4xl border border-linea p-6 sm:flex-row sm:items-center sm:p-8">
          <Iniciales nombre={c.nombre} tam="h-20 w-20 text-[26px]" redondeo="rounded-3xl" />
          <div className="min-w-0 flex-1">
            <h1 className="text-[28px] font-semibold leading-tight tracking-titulo sm:text-[34px]">{c.nombre}</h1>
            <p className="mt-1 text-[14.5px] text-humo">
              {c.puesto || <Falta>Sin puesto</Falta>}
              {' · '}{c.departamento || <Falta>Sin departamento</Falta>}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Pastilla tono={c.estatus === 'Activo' ? 'tinta' : 'neutro'}>{c.estatus}</Pastilla>
              <Pastilla tono="contorno">{id}</Pastilla>
              {anios != null && <Pastilla tono="contorno">{anios ? `${num(anios)} año${anios === 1 ? '' : 's'}` : `${num(c.antiguedad_meses)} meses`} en OT</Pastilla>}
              {c.estatus === 'Activo' && (si(c.en_banca) ? <Pastilla tono="suave">En banca</Pastilla> : <Pastilla tono="contorno">Asignado</Pastilla>)}
              {banderas.map((b) => <Falta key={b.campo}>{b.etiqueta}</Falta>)}
            </div>
          </div>
          {!esColaborador && (
            <Boton
              variante="primario"
              icono={Bot}
              onClick={() => navegar(`/agente/asistente?q=${encodeURIComponent(`Cuéntame todo lo relevante de ${c.nombre} (${id}): asignaciones, habilidades, asistencia, vacaciones, banderas de calidad, expediente y memoria. ¿Qué debería atender RH?`)}`)}
            >
              Preguntar al agente
            </Boton>
          )}
        </header>
      </div>

      <div className="scroll-fino mt-6 overflow-x-auto pb-1">
        <Pestanas tam="ch" valor={pestana} onCambio={setPestana} opciones={pestanas} className="min-w-max flex-nowrap" />
      </div>

      <div key={pestana} className="anim-entrar mt-6">
        {pestana === 'general' && <General c={c} id={id} />}
        {pestana === 'asignaciones' && <Asignaciones id={id} />}
        {pestana === 'habilidades' && <HabilidadesBarras id={id} />}
        {pestana === 'asistencia' && <MisRegistros id={id} limite={60} />}
        {pestana === 'vacaciones' && <VacacionesPersona id={id} />}
        {pestana === 'nomina' && <Recibos id={id} />}
        {pestana === 'expediente' && <Expediente c={c} />}
        {pestana === 'equipo' && <Activos id={id} />}
        {pestana === 'reconocimientos' && <Reconocimientos id={id} />}
        {pestana === 'memoria' && <MemoriaPersona id={id} />}
        {pestana === 'historial' && <Historial id={id} />}
      </div>
    </div>
  )
}

function General({ c, id }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
      <section className="rounded-3xl border border-linea p-6">
        <Bloque titulo="Datos laborales">
          <dl className="grid grid-cols-2 gap-x-5 gap-y-4 text-[13.5px] sm:grid-cols-3">
            <Dato t="Puesto"><Valor v={c.puesto} /></Dato>
            <Dato t="Departamento"><Valor v={c.departamento} /></Dato>
            <Dato t="Esquema de nómina"><Valor v={c.esquema_nomina} /></Dato>
            <Dato t="Tipo de contrato"><Valor v={c.tipo_contrato} /></Dato>
            <Dato t="Ingreso"><Valor v={c.fecha_incorporacion} formato={fecha} /></Dato>
            <Dato t="Baja">{c.estatus === 'Baja' ? <Valor v={c.fecha_baja} formato={fecha} falta="Sin fecha" /> : '—'}</Dato>
            <Dato t="Antigüedad"><Valor v={c.antiguedad_meses} formato={(v) => `${num(v)} meses`} /></Dato>
            <Dato t="Ciudad"><Valor v={c.ciudad} formato={(v) => [v, c.estado].filter(Boolean).join(', ')} /></Dato>
            <Dato t="Aseguradora"><Valor v={c.aseguradora} /></Dato>
            <Dato t="Asignaciones vigentes">{num(c.asignaciones_vigentes)}</Dato>
            <Dato t="Dedicación total">{c.dedicacion_total_pct == null ? '—' : pct(c.dedicacion_total_pct, 0)}</Dato>
            <Dato t="Días en banca">{si(c.en_banca) ? num(c.dias_en_banca) : '—'}</Dato>
          </dl>
        </Bloque>
      </section>
      <div className="space-y-4">
        <section className="rounded-3xl border border-linea p-6">
          <Costos id={id} />
        </section>
        <section className="rounded-3xl border border-linea p-6">
          <p className="mb-2 text-[14.5px] font-semibold tracking-apretado">Expediente</p>
          <div className="mb-2 flex justify-between text-[13px]"><span className="text-humo">{num(c.docs_cumplidos)} de {num(c.docs_obligatorios)} obligatorios</span><b className="tabular">{c.pct_expediente == null ? '—' : pct(c.pct_expediente)}</b></div>
          <Avance valor={c.pct_expediente} rayado tono={si(c.expediente_completo) ? 'bg-tinta' : 'grad-ot-h'} />
        </section>
      </div>
    </div>
  )
}

function HabilidadesBarras({ id }) {
  const { datos, cargando } = useEnVivo(() => query(collection(db, 'matriz'), where('id_colaborador', '==', id)), [id])
  const catalogo = useColeccion('habilidades')
  const grupos = useMemo(() => {
    const m = new Map()
    for (const x of datos.filter((d) => d.nivel_num != null)) {
      const h = catalogo.datos.find((k) => (k.cod_habilidad ?? k.id) === x.cod_habilidad)
      const t = h?.tecnologia || 'Otras'
      if (!m.has(t)) m.set(t, [])
      m.get(t).push({ ...x, nombre: h?.habilidad || x.cod_habilidad })
    }
    return [...m.entries()].map(([t, l]) => [t, l.sort((a, b) => b.nivel_num - a.nivel_num)]).sort((a, b) => b[1].length - a[1].length)
  }, [datos, catalogo.datos])
  if (cargando) return <Cargando lineas={6} />
  if (!grupos.length) return <div className="rayado rounded-3xl bg-panel p-6 text-[14px]">Sin matriz de habilidades: esta persona no ha sido evaluada.</div>
  const sinFecha = datos.filter((d) => d.nivel_num != null && !d.fecha_evaluacion).length
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-humo">{num(datos.filter((d) => d.nivel_num != null).length)} habilidades evaluadas · {num(sinFecha)} sin fecha de evaluación (regla 19).</p>
      <div className="grid gap-4 lg:grid-cols-2">
        {grupos.map(([t, lista], g) => (
          <section key={t} style={{ '--i': g }} className="anim-entrar rounded-3xl border border-linea p-5">
            <p className="mb-3 text-[14.5px] font-semibold tracking-apretado">{t} <span className="text-[12.5px] font-normal text-humo">{lista.length}</span></p>
            <ul className="space-y-2.5">
              {lista.map((h, i) => (
                <li key={h.cod_habilidad}>
                  <div className="mb-1 flex justify-between gap-3 text-[13px]"><span className="truncate">{h.nombre}</span><span className="shrink-0 text-humo">{NIVELES[h.nivel_num]}</span></div>
                  <div className="grid grid-cols-4 gap-1">
                    {[1, 2, 3, 4].map((n) => (
                      <span key={n} className="h-2 overflow-hidden rounded-full bg-panel">
                        {n <= h.nivel_num && <span style={{ '--i': i + n }} className={`crecer-x block h-full rounded-full ${h.nivel_num >= 3 ? 'grad-ot-h' : 'bg-tinta'}`} />}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

function VacacionesPersona({ id }) {
  const { datos, cargando } = useEnVivo(() => query(collection(db, 'vacaciones'), where('id_colaborador', '==', id)), [id])
  const lista = [...datos].sort((a, b) => ms(b.creada) - ms(a.creada))
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <section className="rounded-3xl border border-linea p-6"><Saldo id={id} /></section>
      <section className="rounded-3xl border border-linea p-6">
        <p className="mb-3 text-[14.5px] font-semibold tracking-apretado">Historial de solicitudes</p>
        {cargando ? <Cargando /> : lista.length === 0 ? <p className="text-[13.5px] text-humo">Sin solicitudes registradas.</p> : (
          <ul className="divide-y divide-linea">
            {lista.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2.5 text-[13.5px]">
                <span><span className="font-medium">{TIPOS_AUSENCIA[s.tipo] || humano(s.tipo)}</span><span className="block text-[12px] text-humo">{s.inicio} → {s.fin} · {num(s.dias_habiles)} días hábiles</span></span>
                <Pastilla tono={s.estado === 'aprobada' ? 'tinta' : s.estado === 'pendiente' ? 'suave' : 'neutro'}>{humano(s.estado)}</Pastilla>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Expediente({ c }) {
  const obligatorios = DOCUMENTOS.filter((d) => !d.opcional)
  const cumplidos = obligatorios.filter((d) => si(c[d.campo])).length
  return (
    <section className="rounded-3xl border border-linea p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[14.5px] font-semibold tracking-apretado">Checklist del expediente</p>
          <p className="text-[12.5px] text-humo">Regla 9: completo = todos los obligatorios en SÍ o NO APLICA. Pasaporte y visa son opcionales.</p>
        </div>
        <p className="text-[13px]"><b className="texto-grad text-[22px] font-semibold tabular">{cumplidos}</b> <span className="text-humo">de {obligatorios.length}</span></p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {DOCUMENTOS.map((d, i) => {
          const v = c[d.campo]
          const ok = si(v)
          const falta = v == null
          return (
            <li key={d.campo} style={{ '--i': i }} className={`anim-entrar flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[13.5px] ${ok ? 'bg-panel' : falta ? 'rayado bg-panel' : 'border border-linea'}`}>
              {ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-tinta" /> : d.opcional ? <MinusCircle className="h-4 w-4 shrink-0 text-gris" /> : <Circle className="h-4 w-4 shrink-0 text-rojo" />}
              <span className="flex-1">{d.nombre}</span>
              <span className="text-[12px] text-humo">{ok ? 'Entregado' : falta ? 'Sin dato' : d.opcional ? 'Opcional' : 'Falta'}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Reconocimientos({ id }) {
  const { datos, cargando } = useEnVivo(() => query(collection(db, 'reconocimientos'), where('para_id_colaborador', '==', id)), [id])
  const lista = [...datos].sort((a, b) => ms(b.creada) - ms(a.creada))
  if (cargando) return <Cargando />
  if (!lista.length) return <Vacio icono={Award} titulo="Sin reconocimientos todavía" texto="Cualquiera puede reconocer a un compañero desde Cultura."><Link to="/cultura" className="text-[13.5px] font-medium text-rojo">Ir a Cultura</Link></Vacio>
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {lista.map((r, i) => (
        <li key={r.id} style={{ '--i': i }} className="anim-entrar rounded-3xl border border-linea p-5 transition-colors hover:border-borde">
          <Pastilla tono="suave">{r.valor}</Pastilla>
          <p className="mt-3 text-[14px] leading-relaxed">{r.mensaje}</p>
          <p className="mt-3 text-[12px] text-humo">De {r.de_nombre || 'alguien del equipo'} · {hace(r.creada)}</p>
        </li>
      ))}
    </ul>
  )
}

function Historial({ id }) {
  const { datos, cargando, error } = useEnVivo(() => query(collection(db, 'log_correcciones'), where('id_registro', '==', id)), [id])
  const lista = [...datos].sort((a, b) => String(b.fecha_correccion).localeCompare(String(a.fecha_correccion)))
  if (error) return <ErrorCaja error={error}>No se pudo leer el historial.</ErrorCaja>
  if (cargando) return <Cargando lineas={5} />
  if (!lista.length) return <Vacio icono={History} titulo="Sin correcciones registradas" texto="Cada cambio del pipeline o aprobado por RH queda aquí (M13)." />
  return (
    <div className="space-y-2">
      <p className="text-[13px] text-humo">{num(lista.length)} correcciones en log_correcciones</p>
      <Tabla
        minimo={720}
        filas={lista}
        claveFila={(f) => f.id}
        columnas={[
          { titulo: 'Campo', celda: (f) => <span className="font-mono text-[12.5px]">{f.tabla}.{f.columna}</span> },
          { titulo: 'Original', celda: (f) => (f.valor_original == null || f.valor_original === '' ? <Falta>Vacío</Falta> : String(f.valor_original)) },
          { titulo: 'Corregido', celda: (f) => (f.valor_corregido == null || f.valor_corregido === '' ? <Falta>Nulo</Falta> : <span className="font-medium">{String(f.valor_corregido)}</span>) },
          { titulo: 'Método', celda: (f) => <Pastilla tono={String(f.metodo).startsWith('M15') ? 'suave' : 'neutro'}>{String(f.metodo).split(' ')[0]}</Pastilla> },
          { titulo: 'Fecha', celda: (f) => <span className="text-humo">{fecha(f.fecha_correccion)}</span> },
        ]}
      />
    </div>
  )
}
