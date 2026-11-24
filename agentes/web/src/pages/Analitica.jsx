import React, { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, query, where } from 'firebase/firestore'
import { CalendarClock, Smile } from 'lucide-react'
import { db } from '../firebase.js'
import { useSesion } from '../lib/auth.jsx'
import { fila, filas, useDocVivo, useEnVivo, useIndicadores } from '../lib/datos.js'
import { corto, mesCorto, ms, normal, num, pct } from '../lib/formato.js'
import { JORNADA_BASE, deISO, iso, minutosAHoras, sumarDias } from '../lib/fechas.js'
import { Dona, Gauge, Linea } from '../components/Graficas.jsx'
import {
  Barras, Base, CampoBusqueda, Cargando, Columnas, Contador, Encabezado, Resaltar, Rotulo, Tarjeta, Vacio, useDebounce,
} from '../components/ui.jsx'

const SECCIONES = [
  { id: 'asistencia', etiqueta: 'Puntualidad y ausentismo', palabras: 'asistencia retardos puntualidad faltas checadas horas salida' },
  { id: 'vacaciones', etiqueta: 'Vacaciones', palabras: 'vacaciones permisos incapacidad ausencias solicitudes' },
  { id: 'nomina', etiqueta: 'Nómina', palabras: 'nómina neto costo periodo esquema sueldo', admin: true },
  { id: 'rotacion', etiqueta: 'Rotación', palabras: 'rotación bajas cohorte mensual permanencia' },
  { id: 'banca', etiqueta: 'Banca', palabras: 'banca puesto asignación utilización' },
  { id: 'clima', etiqueta: 'Clima', palabras: 'clima enps encuestas promotores detractores' },
]

const VISTAS = ['v_costo_por_esquema', 'v_rotacion_mensual', 'v_cohorte_ingreso', 'v_rotacion_anual', 'v_banca_por_puesto', 'v_utilizacion']

export default function Analitica() {
  const { esAdmin } = useSesion()
  const [texto, setTexto] = useState('')
  const q = useDebounce(texto)
  const ind = useIndicadores(VISTAS)
  const visibles = SECCIONES.filter((s) => (!s.admin || esAdmin) && (!normal(q) || normal(`${s.etiqueta} ${s.palabras}`).includes(normal(q))))

  const componentes = { asistencia: Asistencia, vacaciones: Vacaciones, nomina: Nomina, rotacion: Rotacion, banca: Banca, clima: Clima }

  return (
    <div>
      <Encabezado titulo="Analítica" subtitulo="Asistencia, vacaciones, nómina, rotación y clima en un solo lugar. Cada gráfica dice sobre cuántos registros se calculó." />
      <div className="sticky top-0 z-10 -mx-1 mb-8 flex flex-wrap items-center gap-2 bg-white/90 px-1 py-2 backdrop-blur">
        <CampoBusqueda valor={texto} onCambio={setTexto} placeholder="Buscar sección (retardos, eNPS…)" className="w-full sm:w-[280px]" />
        <nav className="flex flex-wrap gap-1.5" aria-label="Secciones">
          {visibles.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="rounded-full border border-linea px-3.5 py-1.5 text-[13px] font-medium transition-colors hover:border-borde hover:bg-panel">
              <Resaltar texto={s.etiqueta} q={q} />
            </a>
          ))}
        </nav>
      </div>
      <div className="space-y-14">
        {visibles.length === 0 && <Vacio titulo="Ninguna sección coincide" texto={`No hay gráficas relacionadas con «${texto}».`} />}
        {visibles.map((s) => {
          const C = componentes[s.id]
          return <C key={s.id} ind={ind} />
        })}
      </div>
    </div>
  )
}

function Seccion({ id, titulo, nota, children }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="text-[22px] font-semibold tracking-titulo">{titulo}</h2>
      {nota && <p className="mt-1 max-w-[72ch] text-[14px] text-humo">{nota}</p>}
      <div className="mt-5 space-y-3">{children}</div>
    </section>
  )
}

function Kpi({ etiqueta, children, detalle, i }) {
  return (
    <Tarjeta i={i} className="p-5">
      <p className="text-[12.5px] text-humo">{etiqueta}</p>
      <p className="mt-1 text-[28px] font-semibold leading-none tracking-titulo tabular">{children}</p>
      {detalle && <div className="mt-2 text-[12px] text-humo">{detalle}</div>}
    </Tarjeta>
  )
}

// ------------------------------------------------------------ asistencia
function Asistencia() {
  const desde = useMemo(() => iso(sumarDias(new Date(), -30)), [])
  const hoy = iso(new Date())
  const { datos, cargando } = useEnVivo(() => query(collection(db, 'asistencia'), where('fecha', '>=', desde)), [desde])
  const jornada = useDocVivo(['config', 'jornada']).datos || JORNADA_BASE
  const tol = Number(jornada.tolerancia_min ?? JORNADA_BASE.tolerancia_min)

  const m = useMemo(() => {
    const conRetardo = datos.filter((a) => a.retardo_min != null)
    const puntuales = conRetardo.filter((a) => Number(a.retardo_min) <= tol)
    const tarde = conRetardo.filter((a) => Number(a.retardo_min) > tol)
    const cerradas = datos.filter((a) => a.estado === 'cerrada' && a.minutos_trabajados != null)
    const sinSalida = datos.filter((a) => a.estado === 'abierta' && a.fecha < hoy)
    const porDia = new Map()
    for (const a of conRetardo) {
      if (!porDia.has(a.fecha)) porDia.set(a.fecha, { n: 0, ok: 0 })
      const d = porDia.get(a.fecha)
      d.n += 1
      if (Number(a.retardo_min) <= tol) d.ok += 1
    }
    const serie = [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([f, d]) => ({ etiqueta: `${deISO(f).getDate()}/${deISO(f).getMonth() + 1}`, valor: (d.ok / d.n) * 100 }))
    const porPersona = new Map()
    for (const a of tarde) {
      const k = a.id_colaborador
      if (!porPersona.has(k)) porPersona.set(k, { nombre: a.nombre || k, n: 0, min: 0 })
      const p = porPersona.get(k)
      p.n += 1
      p.min += Number(a.retardo_min)
    }
    const top = [...porPersona.values()].sort((a, b) => b.n - a.n || b.min - a.min).slice(0, 8)
    return {
      total: datos.length,
      conRetardo: conRetardo.length,
      pctPuntual: conRetardo.length ? (puntuales.length / conRetardo.length) * 100 : null,
      retardoProm: tarde.length ? tarde.reduce((s, a) => s + Number(a.retardo_min), 0) / tarde.length : null,
      horasProm: cerradas.length ? cerradas.reduce((s, a) => s + Number(a.minutos_trabajados), 0) / cerradas.length : null,
      cerradas: cerradas.length,
      sinSalida: sinSalida.length,
      serie,
      top,
    }
  }, [datos, tol, hoy])

  return (
    <Seccion id="asistencia" titulo="Puntualidad y ausentismo" nota={`Últimos 30 días. Puntual = llegó a más tardar ${tol} min después de las ${jornada.hora_entrada || JORNADA_BASE.hora_entrada}.`}>
      {cargando ? <Cargando lineas={4} /> : datos.length === 0 ? (
        <Vacio icono={CalendarClock} titulo="Sin checadas en los últimos 30 días" texto="La asistencia se llena con el uso; aún no hay checadas." />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Kpi i={0} etiqueta="Registros" detalle={`${num(m.total)} checadas desde ${desde}`}><Contador valor={m.total} /></Kpi>
            <Kpi i={1} etiqueta="Puntualidad" detalle={<Base n={m.conRetardo} de={m.total} que="con hora de entrada" />}>{m.pctPuntual == null ? '—' : <Contador valor={m.pctPuntual} formato={pct} />}</Kpi>
            <Kpi i={2} etiqueta="Retardo promedio" detalle="Solo entre quienes llegaron tarde">{m.retardoProm == null ? '—' : `${Math.round(m.retardoProm)} min`}</Kpi>
            <Kpi i={3} etiqueta="Horas por jornada" detalle={`Sobre ${num(m.cerradas)} jornadas cerradas`}>{m.horasProm == null ? '—' : minutosAHoras(m.horasProm)}</Kpi>
            <Kpi i={4} etiqueta="Salidas sin registrar" detalle="Jornadas de días pasados aún abiertas">
              <span className={m.sinSalida ? 'texto-grad' : ''}><Contador valor={m.sinSalida} /></span>
            </Kpi>
          </div>
          <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
            <Tarjeta className="p-5">
              <Rotulo nota={`% de entradas puntuales por día, sobre ${num(m.conRetardo)} entradas.`}>Puntualidad diaria</Rotulo>
              <Linea datos={m.serie} formato={(v) => pct(v, 0)} />
            </Tarjeta>
            <Tarjeta className="p-5">
              <Rotulo nota="Personas con más retardos en el periodo.">Retardos por persona</Rotulo>
              <Barras datos={m.top.map((p, i) => ({ clave: i, etiqueta: p.nombre, valor: p.n, sub: `${num(p.min)} min acumulados`, resaltar: i === 0 }))} vacio="Nadie llegó tarde en el periodo." />
            </Tarjeta>
          </div>
        </>
      )}
    </Seccion>
  )
}

// ------------------------------------------------------------ vacaciones
const TIPOS_VAC = { vacaciones: 'Vacaciones', permiso_con_goce: 'Permiso con goce', permiso_sin_goce: 'Permiso sin goce', incapacidad: 'Incapacidad' }

function Vacaciones() {
  const { datos, cargando } = useEnVivo(() => collection(db, 'vacaciones'), [])
  const m = useMemo(() => {
    const estados = { pendiente: 0, aprobada: 0, rechazada: 0, cancelada: 0 }
    for (const v of datos) estados[v.estado] = (estados[v.estado] || 0) + 1
    const aprobadas = datos.filter((v) => v.estado === 'aprobada')
    const porMes = new Map()
    const porTipo = new Map()
    for (const v of aprobadas) {
      const mes = String(v.inicio || '').slice(0, 7)
      if (mes) porMes.set(mes, (porMes.get(mes) || 0) + (Number(v.dias_habiles) || 0))
      porTipo.set(v.tipo, (porTipo.get(v.tipo) || 0) + (Number(v.dias_habiles) || 0))
    }
    return {
      estados,
      aprobadas: aprobadas.length,
      dias: aprobadas.reduce((s, v) => s + (Number(v.dias_habiles) || 0), 0),
      porMes: [...porMes.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([mes, d]) => ({ etiqueta: mesCorto(mes), valor: d })),
      porTipo: [...porTipo.entries()].map(([t, d]) => ({ etiqueta: TIPOS_VAC[t] || t, valor: d })),
    }
  }, [datos])

  return (
    <Seccion id="vacaciones" titulo="Vacaciones y ausencias" nota="Solicitudes registradas en el sistema. El saldo y el pasivo de días disponibles por persona están en Vacaciones (LFT art. 76).">
      {cargando ? <Cargando lineas={3} /> : datos.length === 0 ? (
        <Vacio icono={CalendarClock} titulo="Sin solicitudes todavía" texto="Las vacaciones y permisos se llenan con el uso; la exportación no trae historial." />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi i={0} etiqueta="Solicitudes" detalle={`${num(m.estados.pendiente)} pendientes · ${num(m.estados.rechazada)} rechazadas`}><Contador valor={datos.length} /></Kpi>
            <Kpi i={1} etiqueta="Aprobadas" detalle={<Base n={m.aprobadas} de={datos.length} que="solicitudes" />}><Contador valor={m.aprobadas} /></Kpi>
            <Kpi i={2} etiqueta="Días hábiles aprobados" detalle="Suma de todas las ausencias aprobadas"><Contador valor={m.dias} /></Kpi>
            <Kpi i={3} etiqueta="Pendientes de resolver" detalle="Esperan a RH"><span className={m.estados.pendiente ? 'texto-grad' : ''}><Contador valor={m.estados.pendiente} /></span></Kpi>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <Tarjeta className="p-5">
              <Rotulo nota={`Días hábiles aprobados por mes de inicio, sobre ${num(m.aprobadas)} solicitudes aprobadas.`}>Ausencias por mes</Rotulo>
              <Columnas datos={m.porMes} />
            </Tarjeta>
            <Tarjeta className="p-5">
              <Rotulo nota="Días hábiles aprobados por tipo.">Por tipo de ausencia</Rotulo>
              <Dona partes={m.porTipo} />
            </Tarjeta>
          </div>
        </>
      )}
    </Seccion>
  )
}

// ------------------------------------------------------------ nómina (admin)
function Nomina({ ind }) {
  const { datos, cargando } = useEnVivo(() => collection(db, 'nomina_periodos'), [])
  const periodos = [...datos].sort((a, b) => a.id.localeCompare(b.id))
  const esquemas = filas(ind.datos.v_costo_por_esquema).sort((a, b) => (b.costo_nomina_por_esquema || 0) - (a.costo_nomina_por_esquema || 0))
  return (
    <Seccion id="nomina" titulo="Nómina" nota="Prenómina de control por periodo (no timbra CFDI) y costo mensual por esquema según la plantilla.">
      <div className="grid gap-3 lg:grid-cols-2">
        <Tarjeta className="p-5">
          <Rotulo nota={`Neto estimado por periodo, sobre ${num(periodos.length)} periodos calculados.`}>Neto por periodo</Rotulo>
          {cargando ? <Cargando /> : periodos.length === 0 ? <p className="text-[13px] text-humo">Aún no se calcula ninguna prenómina.</p> : (
            <>
              <Linea datos={periodos.map((p) => ({ etiqueta: p.id.slice(5), valor: p.totales?.neto }))} formato={corto} />
              <p className="mt-2 text-[12px] text-humo">
                Último: costo empresa {corto(periodos[periodos.length - 1].totales?.costo_empresa)} · {num(periodos[periodos.length - 1].totales?.con_sueldo)} de {num(periodos[periodos.length - 1].totales?.colaboradores)} con sueldo
              </p>
            </>
          )}
        </Tarjeta>
        <Tarjeta className="p-5">
          <Rotulo nota="Costo mensual (sueldo total integrado) por esquema de nómina.">Por esquema</Rotulo>
          {ind.cargando ? <Cargando /> : (
            <Barras datos={esquemas.map((e, i) => ({ clave: e.esquema_nomina || i, etiqueta: e.esquema_nomina || 'Sin esquema', valor: e.costo_nomina_por_esquema, rayado: e.personas_con_sueldo < e.personas, sub: `${num(e.personas_con_sueldo)} de ${num(e.personas)} personas con sueldo` }))} formato={corto} />
          )}
        </Tarjeta>
      </div>
    </Seccion>
  )
}

// ------------------------------------------------------------ rotación
function Rotacion({ ind }) {
  const r = fila(ind.datos.v_rotacion_anual)
  const mensual = filas(ind.datos.v_rotacion_mensual)
  const cohortes = filas(ind.datos.v_cohorte_ingreso).filter((c) => c.anio_ingreso >= 2018)
  return (
    <Seccion id="rotacion" titulo="Rotación" nota="Bajas con fecha sobre la plantilla promedio. Las bajas sin fecha quedan fuera del cálculo.">
      {ind.cargando ? <Cargando lineas={3} /> : (
        <>
          {r && <Base n={r.bajas_con_fecha} de={r.bajas_totales} que="bajas con fecha" />}
          <div className="grid gap-3 lg:grid-cols-2">
            <Tarjeta className="p-5">
              <Rotulo nota={r ? `Rotación 12 meses: ${pct(r.rotacion_anual_pct)}.` : null}>Rotación mensual</Rotulo>
              <Linea datos={mensual.map((x) => ({ etiqueta: mesCorto(x.mes), valor: x.rotacion_mensual_pct }))} formato={(v) => pct(v)} />
            </Tarjeta>
            <Tarjeta className="p-5">
              <Rotulo nota={`% de cada generación de ingreso que ya salió, sobre ${num(cohortes.reduce((s, c) => s + (c.ingresos || 0), 0))} ingresos desde 2018.`}>Bajas por cohorte</Rotulo>
              <Columnas datos={cohortes.map((c) => ({ etiqueta: String(c.anio_ingreso).slice(2), valor: c.pct_baja, resaltar: c.pct_baja >= 40 }))} formato={(v) => `${Math.round(v)}%`} />
            </Tarjeta>
          </div>
        </>
      )}
    </Seccion>
  )
}

// ------------------------------------------------------------ banca
function Banca({ ind }) {
  const u = fila(ind.datos.v_utilizacion)
  const porPuesto = filas(ind.datos.v_banca_por_puesto).filter((p) => p.en_banca > 0).sort((a, b) => b.en_banca - a.en_banca).slice(0, 12)
  return (
    <Seccion id="banca" titulo="Banca por puesto" nota="Activos sin asignación vigente (regla 14).">
      {ind.cargando ? <Cargando lineas={3} /> : (
        <Tarjeta className="p-5">
          <Rotulo nota={u ? `${num(u.en_banca)} de ${num(u.plantilla_activa)} activos en banca (${pct(u.pct_en_banca)}).` : null}>Personas en banca</Rotulo>
          {u && <div className="mb-4"><Base n={u.plantilla_activa} de={u.plantilla_activa} que="activos" /></div>}
          <Barras datos={porPuesto.map((p, i) => ({ clave: p.puesto || `sin-${i}`, etiqueta: p.puesto || 'Sin puesto', valor: p.en_banca, rayado: !p.puesto, resaltar: i === 0, sub: `${num(p.asignados)} asignados de ${num(p.personas)}` }))} />
        </Tarjeta>
      )}
    </Seccion>
  )
}

// ------------------------------------------------------------ clima
function Clima() {
  const enps = useEnVivo(() => query(collection(db, 'encuestas'), where('tipo', '==', 'enps')), [])
  const [res, setRes] = useState({ cargando: true, encuesta: null, resultado: null })

  useEffect(() => {
    if (enps.cargando) return
    let vivo = true
    const candidatas = [...enps.datos].sort((a, b) => ms(b.creada) - ms(a.creada))
    ;(async () => {
      for (const e of candidatas) {
        try {
          const s = await getDoc(doc(db, 'encuestas_resultados', e.id))
          if (s.exists() && (s.data().total || 0) > 0) {
            if (vivo) setRes({ cargando: false, encuesta: e, resultado: s.data() })
            return
          }
        } catch { /* sin permiso o sin resultados: siguiente */ }
      }
      if (vivo) setRes({ cargando: false, encuesta: null, resultado: null })
    })()
    return () => { vivo = false }
  }, [enps.cargando, enps.datos])

  const preguntaNps = res.resultado
    ? Object.values(res.resultado.por_pregunta || {}).find((p) => p.tipo === 'nps' || p.nps)
    : null
  const nps = preguntaNps?.nps

  return (
    <Seccion id="clima" titulo="Clima (eNPS)" nota="Employee Net Promoter Score: % de promotores (9–10) menos % de detractores (0–6).">
      {enps.cargando || res.cargando ? <Cargando lineas={3} /> : !nps ? (
        <Vacio icono={Smile} titulo="Aún no hay resultados de eNPS" texto="Abre una encuesta eNPS en Encuestas y comparte el enlace; los resultados aparecen aquí." />
      ) : (
        <Tarjeta className="p-5">
          <Rotulo nota={`${res.encuesta.titulo} · sobre ${num(preguntaNps.n ?? res.resultado.total)} respuestas.`}>eNPS más reciente</Rotulo>
          <div className="flex flex-wrap items-center gap-8">
            <Gauge valor={nps.score} etiqueta="eNPS" />
            <Dona
              partes={[
                { etiqueta: 'Promotores (9–10)', valor: nps.promotores || 0, tono: '#FD111C' },
                { etiqueta: 'Pasivos (7–8)', valor: nps.pasivos || 0, tono: '#BABABA' },
                { etiqueta: 'Detractores (0–6)', valor: nps.detractores || 0, tono: '#1A1A1A' },
              ]}
            />
          </div>
        </Tarjeta>
      )}
    </Seccion>
  )
}
