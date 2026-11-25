// Capa de análisis (BI) para Asistencia, Vacaciones y Nómina.
// Todo se agrega en el cliente a partir de lecturas; cada indicador dice sobre cuántos registros se calculó.
// El rayado solo marca dato que falta o se estimó.
import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, query, where } from 'firebase/firestore'
import { db } from '../firebase.js'
import { useColeccion, useEnVivo } from '../lib/datos.js'
import { dinero, hoyISO, num, pct } from '../lib/formato.js'
import { MESES, deISO, diaSemana, diasHabiles, esLaboral, iso, lunesDe, minutosAHoras, sumarDias } from '../lib/fechas.js'
import { Dona, Linea } from './Graficas.jsx'
import { Barras, Base, Cargando, Cifra, Columnas, Contador, ErrorCaja, Pestanas, Rotulo, Tarjeta } from './ui.jsx'

const DIAS_ETQ = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const ddmm = (s) => `${Number(s.slice(8, 10))}/${Number(s.slice(5, 7))}`
const aMin = (h) => {
  const [a, b] = String(h || '').split(':').map(Number)
  return Number.isFinite(a) && Number.isFinite(b) ? a * 60 + b : null
}
const TIPOS = { vacaciones: 'Vacaciones', permiso_con_goce: 'Permiso con goce', permiso_sin_goce: 'Permiso sin goce', incapacidad: 'Incapacidad' }

// ============================================================ primitiva: mapa de calor
/**
 * filas: [{ etiqueta, celdas: [{ valor (0–100) | null, titulo, rayado? }] }], columnas: [etiqueta]
 * Intensidad = valor / 100. Celda rayada = dato que falta; celda vacía = no aplica (día no laboral o futuro).
 */
export function MapaCalor({ filas, columnas, formato = (v) => pct(v, 0) }) {
  if (!filas.length) return <p className="text-[13px] text-humo">Sin registros</p>
  return (
    <div className="scroll-fino overflow-x-auto">
      <table className="w-full min-w-[420px] border-separate border-spacing-1 text-[11.5px]">
        <thead>
          <tr>
            <th />
            {columnas.map((c) => <th key={c} className="pb-1 text-center font-medium text-humo">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={f.etiqueta} style={{ '--i': i }} className="anim-entrar">
              <td className="whitespace-nowrap pr-2 text-humo tabular">{f.etiqueta}</td>
              {f.celdas.map((c, k) => {
                const v = c.valor
                // Escala de alerta: 100 % casi neutro, cada punto de inasistencia enrojece la celda (tope en 85 %).
                const alerta = v == null ? 0 : Math.min(1, Math.max(0, (100 - v) / 15))
                const fondo = v == null ? undefined : `rgba(253, 17, 28, ${0.06 + alerta * 0.84})`
                return (
                  <td key={k} className="p-0">
                    <span
                      title={c.titulo}
                      className={`grid h-9 place-items-center rounded-lg font-medium tabular ${c.rayado ? 'rayado bg-panel text-humo' : v == null ? 'bg-panel/40' : v != null && v <= 93 ? 'text-white' : 'text-tinta'}`}
                      style={fondo ? { background: fondo } : undefined}
                    >
                      {c.rayado ? '—' : v == null ? '' : formato(v)}
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Kpi({ i, ...p }) {
  return <Tarjeta i={i} className="p-5"><Cifra {...p} /></Tarjeta>
}

// ============================================================ asistencia
const RANGOS = [{ valor: '14', etiqueta: '14 días' }, { valor: '30', etiqueta: '30 días' }, { valor: '60', etiqueta: '60 días' }]

export function AnalisisAsistencia({ jornada }) {
  const [rango, setRango] = useState('30')
  const hoy = hoyISO()
  const desde = iso(sumarDias(deISO(hoy), -Number(rango)))
  // Rango sobre un solo campo (sin índice compuesto).
  const asis = useEnVivo(() => query(collection(db, 'asistencia'), where('fecha', '>=', desde)), [desde])
  const vac = useEnVivo(() => query(collection(db, 'vacaciones'), where('estado', '==', 'aprobada')), [])
  const cols = useColeccion('colaboradores')

  const m = useMemo(() => {
    const activos = cols.datos.filter((c) => c.es_plantilla !== 0 && c.estatus === 'Activo')
    const idsActivos = new Set(activos.map((c) => c.id_colaborador ?? c.id))
    const regs = asis.datos.filter((r) => r.fecha >= desde && r.fecha < hoy && idsActivos.has(r.id_colaborador))
    const inicioReg = jornada.inicio_registro || null
    // Días laborales cerrados (hoy no cuenta: la jornada sigue abierta).
    const dias = []
    for (let d = deISO(desde); iso(d) < hoy; d = sumarDias(d, 1)) {
      if (esLaboral(d, jornada) && (!inicioReg || iso(d) >= inicioReg)) dias.push(iso(d))
    }
    const ausente = (id, f) => vac.datos.some((v) => v.id_colaborador === id && v.inicio <= f && v.fin >= f)
    const porDia = new Map(dias.map((f) => [f, { f, checaron: 0, puntuales: 0, esperados: 0 }]))
    for (const f of dias) {
      const d = porDia.get(f)
      for (const id of idsActivos) if (!ausente(id, f)) d.esperados++
    }
    const porPersona = new Map()
    const origen = {}
    const minutosEntrada = []
    let cerradas = 0, minutos = 0, sinSalida = 0
    for (const r of regs) {
      const d = porDia.get(r.fecha)
      // Solo cuenta a quien se esperaba ese día (activo y sin vacaciones/permiso aprobado): nunca pasa de 100 %.
      if (d && idsActivos.has(r.id_colaborador) && !ausente(r.id_colaborador, r.fecha)) { d.checaron++; if (!(r.retardo_min > 0)) d.puntuales++ }
      const p = porPersona.get(r.id_colaborador) ?? { id: r.id_colaborador, nombre: r.nombre, dias: 0, retardos: 0, min: 0 }
      p.dias++
      if (r.retardo_min > 0) { p.retardos++; p.min += r.retardo_min }
      porPersona.set(r.id_colaborador, p)
      const o = r.origen === 'rh' ? 'Registrado por RH' : r.origen === 'remoto' ? 'Remoto' : r.origen === 'qr' ? 'QR en oficina' : 'Portal'
      origen[o] = (origen[o] ?? 0) + 1
      if (r.minutos_trabajados != null) { cerradas++; minutos += r.minutos_trabajados } else sinSalida++
      const me = aMin(r.hora_entrada)
      if (me != null) minutosEntrada.push(me)
    }
    const serie = [...porDia.values()]
    const esperados = serie.reduce((s, d) => s + d.esperados, 0)
    const checaron = serie.reduce((s, d) => s + d.checaron, 0)
    const puntuales = serie.reduce((s, d) => s + d.puntuales, 0)

    // Retardos por día de la semana (% de entradas con retardo).
    const semana = DIAS_ETQ.map((etiqueta) => ({ etiqueta, n: 0, r: 0 }))
    for (const r of regs) {
      const k = diaSemana(deISO(r.fecha)) - 1
      semana[k].n++
      if (r.retardo_min > 0) semana[k].r++
    }
    const lab = (jornada.dias_laborales?.length ? jornada.dias_laborales : [1, 2, 3, 4, 5])

    // Distribución de la hora de entrada en bloques de 15 min alrededor de la hora oficial.
    const oficial = aMin(jornada.hora_entrada) ?? 540
    const bloques = []
    for (let b = oficial - 45; b <= oficial + 60; b += 15) bloques.push({ b, n: 0 })
    for (const me of minutosEntrada) {
      const k = Math.min(bloques.length - 1, Math.max(0, Math.floor((me - (oficial - 45)) / 15)))
      bloques[k].n++
    }
    const hh = (x) => `${Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`

    // Mapa de calor: semanas × días laborales, % de asistencia.
    const semanas = []
    for (const f of dias) {
      const l = iso(lunesDe(deISO(f)))
      if (!semanas.includes(l)) semanas.push(l)
    }
    const mapa = semanas.map((l) => ({
      etiqueta: `Sem ${ddmm(l)}`,
      celdas: lab.map((dn) => {
        const f = iso(sumarDias(deISO(l), dn - 1))
        const d = porDia.get(f)
        if (!d) return { valor: null, titulo: `${f}: no laboral, futuro o antes del registro` }
        const v = d.esperados ? (d.checaron / d.esperados) * 100 : null
        return { valor: v, titulo: `${f}: ${d.checaron} de ${d.esperados} esperados` }
      }),
    }))

    return {
      activos: activos.length, dias: dias.length, regs: regs.length, esperados, checaron, puntuales, cerradas, minutos, sinSalida,
      faltas: Math.max(0, esperados - checaron),
      tendencia: serie.map((d) => ({ etiqueta: ddmm(d.f), valor: d.esperados ? Math.round((d.checaron / d.esperados) * 1000) / 10 : null })),
      puntualidad: serie.map((d) => ({ etiqueta: ddmm(d.f), valor: d.checaron ? Math.round((d.puntuales / d.checaron) * 1000) / 10 : null })),
      semana: semana.filter((_, k) => lab.includes(k + 1)).map((s) => ({ etiqueta: s.etiqueta, valor: s.n ? Math.round((s.r / s.n) * 1000) / 10 : null })),
      top: [...porPersona.values()].filter((p) => p.retardos > 0).sort((a, b) => b.retardos - a.retardos || b.min - a.min).slice(0, 8),
      origen: Object.entries(origen).map(([etiqueta, valor]) => ({ etiqueta, valor })).sort((a, b) => b.valor - a.valor),
      entradas: bloques.map((x, k) => ({ etiqueta: k === bloques.length - 1 ? `${hh(x.b)}+` : hh(x.b), valor: x.n, resaltar: x.b >= oficial + 15 })),
      mapa, columnasMapa: lab.map((dn) => DIAS_ETQ[dn - 1]), minEntradas: minutosEntrada.length,
    }
  }, [asis.datos, vac.datos, cols.datos, desde, hoy, jornada])

  if (asis.error) return <ErrorCaja error={asis.error}>No se pudo leer la asistencia para el análisis.</ErrorCaja>
  if (asis.cargando || cols.cargando) return <Cargando lineas={6} />

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-humo">
          {num(m.dias)} días laborales cerrados (sin contar hoy){jornada.inicio_registro ? `, desde que inició el registro (${jornada.inicio_registro})` : ''}.
          Se descuentan vacaciones y permisos aprobados.
        </p>
        <Pestanas tam="ch" valor={rango} onCambio={setRango} opciones={RANGOS} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi i={0} etiqueta="Asistencia" valor={m.esperados ? <Contador valor={(m.checaron / m.esperados) * 100} formato={pct} /> : '—'} base={<Base n={m.checaron} de={m.esperados} que="jornadas esperadas" />} />
        <Kpi i={1} etiqueta="Puntualidad" valor={m.regs ? <Contador valor={(m.puntuales / m.regs) * 100} formato={pct} /> : '—'} detalle={`${num(m.regs - m.puntuales)} entradas con retardo de ${num(m.regs)}`} />
        <Kpi i={2} etiqueta="Jornada promedio" valor={m.cerradas ? minutosAHoras(m.minutos / m.cerradas) : '—'} base={<Base n={m.cerradas} de={m.regs} que="checadas con salida" />} />
        <Kpi i={3} etiqueta="Faltas sin justificar" valor={<Contador valor={m.faltas} />} resaltar={m.faltas > 0} detalle={`${num(m.sinSalida)} jornadas sin salida registrada`} />
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Tarjeta className="p-5">
          <Rotulo nota={`% de activos que checaron cada día laboral, sobre ${num(m.esperados)} jornadas esperadas.`}>Asistencia diaria</Rotulo>
          <Linea datos={m.tendencia} formato={(v) => pct(v)} />
        </Tarjeta>
        <Tarjeta className="p-5">
          <Rotulo nota={`% de entradas dentro de la tolerancia (${jornada.tolerancia_min ?? 10} min), sobre ${num(m.regs)} entradas.`}>Puntualidad diaria</Rotulo>
          <Linea datos={m.puntualidad} formato={(v) => pct(v)} />
        </Tarjeta>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Tarjeta className="p-5 xl:col-span-2">
          <Rotulo nota="% de activos esperados que checaron ese día; entre más rojo, más faltas (rojo pleno = 85 % o menos). Las vacías son días no laborales, futuros o previos al registro.">Mapa de asistencia por semana</Rotulo>
          <MapaCalor filas={m.mapa} columnas={m.columnasMapa} />
        </Tarjeta>
        <Tarjeta className="p-5">
          <Rotulo nota={`Sobre ${num(m.regs)} checadas.`}>Origen de la checada</Rotulo>
          <Dona partes={m.origen} />
        </Tarjeta>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Tarjeta className="p-5">
          <Rotulo nota="% de entradas con retardo según el día de la semana.">Retardos por día</Rotulo>
          <Columnas datos={m.semana} formato={(v) => pct(v, 0)} />
        </Tarjeta>
        <Tarjeta className="p-5">
          <Rotulo nota={`Bloques de 15 min; en rojo, 15 min o más después de la hora de entrada. Sobre ${num(m.minEntradas)} entradas.`}>Hora de entrada</Rotulo>
          <Columnas datos={m.entradas} />
        </Tarjeta>
        <Tarjeta className="p-5">
          <Rotulo nota="Personas con más retardos en el rango.">Más retardos</Rotulo>
          <Barras
            vacio="Nadie tiene retardos en el rango."
            datos={m.top.map((p, i) => ({ clave: p.id, etiqueta: <Link to={`/colaboradores/${encodeURIComponent(p.id)}`} className="hover:text-rojo">{p.nombre || p.id}</Link>, valor: p.retardos, resaltar: i === 0, sub: `${num(p.retardos)} de ${num(p.dias)} días · ${num(p.min / p.retardos)} min en promedio` }))}
          />
        </Tarjeta>
      </div>
    </div>
  )
}

// ============================================================ vacaciones
export function AnalisisVacaciones({ datos, jornada }) {
  const hoy = hoyISO()
  const m = useMemo(() => {
    const porTipo = {}, porEstado = {}
    for (const s of datos) {
      porTipo[TIPOS[s.tipo] ?? s.tipo] = (porTipo[TIPOS[s.tipo] ?? s.tipo] ?? 0) + 1
      porEstado[s.estado] = (porEstado[s.estado] ?? 0) + 1
    }
    const aprobadas = datos.filter((s) => s.estado === 'aprobada')
    const resueltas = datos.filter((s) => ['aprobada', 'rechazada'].includes(s.estado)).length
    // Días hábiles aprobados por mes de inicio: 4 meses atrás y 2 adelante.
    const base = deISO(hoy)
    const meses = Array.from({ length: 7 }, (_, k) => {
      const d = new Date(base.getFullYear(), base.getMonth() - 4 + k, 1)
      return { clave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, etiqueta: MESES[d.getMonth()].slice(0, 3), actual: k === 4 }
    })
    const diasMes = Object.fromEntries(meses.map((x) => [x.clave, 0]))
    for (const s of aprobadas) {
      const k = String(s.inicio).slice(0, 7)
      if (k in diasMes) diasMes[k] += Number(s.dias_habiles) || diasHabiles(s.inicio, s.fin, jornada)
    }
    const fueraHoy = aprobadas.filter((s) => s.inicio <= hoy && s.fin >= hoy)
    const limite = iso(sumarDias(base, 30))
    const proximas = aprobadas.filter((s) => s.inicio > hoy && s.inicio <= limite).sort((a, b) => a.inicio.localeCompare(b.inicio))
    const diasAprob = aprobadas.reduce((s, x) => s + (Number(x.dias_habiles) || 0), 0)
    return {
      total: datos.length, pendientes: porEstado.pendiente ?? 0, aprobadas: aprobadas.length, resueltas, diasAprob,
      tipo: Object.entries(porTipo).map(([etiqueta, valor]) => ({ etiqueta, valor })).sort((a, b) => b.valor - a.valor),
      estado: ['pendiente', 'aprobada', 'rechazada', 'cancelada'].filter((e) => porEstado[e]).map((e) => ({ etiqueta: `${e[0].toUpperCase()}${e.slice(1)}s`, valor: porEstado[e], resaltar: e === 'pendiente' })),
      meses: meses.map((x) => ({ etiqueta: x.etiqueta, valor: diasMes[x.clave], resaltar: x.actual })),
      fueraHoy, proximas,
    }
  }, [datos, hoy, jornada])

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi i={0} etiqueta="Solicitudes" valor={<Contador valor={m.total} />} detalle={`${num(m.pendientes)} pendientes de resolver`} />
        <Kpi i={1} etiqueta="Tasa de aprobación" valor={m.resueltas ? <Contador valor={(m.aprobadas / m.resueltas) * 100} formato={pct} /> : '—'} base={<Base n={m.resueltas} de={m.total} que="solicitudes resueltas" />} />
        <Kpi i={2} etiqueta="Días hábiles aprobados" valor={<Contador valor={m.diasAprob} />} detalle={`En ${num(m.aprobadas)} solicitudes aprobadas`} />
        <Kpi i={3} etiqueta="Fuera hoy" valor={<Contador valor={m.fueraHoy.length} />} resaltar={m.fueraHoy.length > 0} detalle="Con vacaciones, permiso o incapacidad aprobados" />
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        <Tarjeta className="p-5">
          <Rotulo nota={`Sobre ${num(m.total)} solicitudes.`}>Por tipo</Rotulo>
          <Dona partes={m.tipo} />
        </Tarjeta>
        <Tarjeta className="p-5">
          <Rotulo nota={`Sobre ${num(m.total)} solicitudes.`}>Por estado</Rotulo>
          <Barras datos={m.estado} />
        </Tarjeta>
        <Tarjeta className="p-5">
          <Rotulo nota="Días hábiles aprobados según el mes en que inicia la ausencia; en rojo, el mes actual.">Ausencias por mes</Rotulo>
          <Columnas datos={m.meses} />
        </Tarjeta>
      </div>
      <Tarjeta className="p-5">
        <Rotulo nota="Ausencias aprobadas que empiezan en los próximos 30 días. Sirve para planear la cobertura de proyectos.">Próximas ausencias</Rotulo>
        {m.proximas.length === 0 ? <p className="text-[13px] text-humo">Nadie tiene ausencias aprobadas en los próximos 30 días.</p> : (
          <ul className="divide-y divide-linea">
            {m.proximas.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-[13.5px]">
                <Link to={`/colaboradores/${encodeURIComponent(s.id_colaborador)}`} className="min-w-0 flex-1 font-medium hover:text-rojo">{s.nombre || s.id_colaborador}</Link>
                <span className="text-humo">{TIPOS[s.tipo] ?? s.tipo}</span>
                <span className="tabular">{s.inicio} → {s.fin}</span>
                <span className="w-24 text-right font-semibold tabular">{num(s.dias_habiles)} días</span>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </div>
  )
}

// ============================================================ nómina
const RANGOS_SUELDO = [
  [0, 20000, '< 20 k'], [20000, 40000, '20–40 k'], [40000, 60000, '40–60 k'], [60000, 80000, '60–80 k'], [80000, 100000, '80–100 k'], [100000, Infinity, '100 k +'],
]
const sumaObj = (o) => (o && typeof o === 'object' ? Object.values(o).reduce((s, v) => s + (Number(v) || 0), 0) : null)

export function AnalisisNomina({ recibos }) {
  const m = useMemo(() => {
    const total = recibos.length
    const conSueldo = recibos.filter((r) => r.sueldo_mensual > 0)
    const conCosto = recibos.filter((r) => r.costo_empresa > 0)
    const esquemas = {}
    for (const r of conCosto) {
      const k = r.esquema_nomina || 'Sin esquema capturado'
      const e = (esquemas[k] ??= { costo: 0, n: 0 })
      e.costo += Number(r.costo_empresa)
      e.n++
    }
    const sinCostoPorEsquema = {}
    for (const r of recibos.filter((x) => !(x.costo_empresa > 0))) {
      const k = r.esquema_nomina || 'Sin esquema capturado'
      sinCostoPorEsquema[k] = (sinCostoPorEsquema[k] ?? 0) + 1
    }
    const rangos = RANGOS_SUELDO.map(([a, b, etiqueta]) => ({ etiqueta, valor: conSueldo.filter((r) => r.sueldo_mensual >= a && r.sueldo_mensual < b).length }))
    const sinSueldo = total - conSueldo.length
    const ambos = recibos.filter((r) => r.costo_empresa > 0 && sumaObj(r.percepciones) > 0)
    const perc = ambos.reduce((s, r) => s + sumaObj(r.percepciones), 0)
    const costo = ambos.reduce((s, r) => s + Number(r.costo_empresa), 0)
    const inc = { Faltas: 0, Retardos: 0, 'Días de vacaciones': 0, 'Permiso con goce': 0, 'Sin goce': 0, Incapacidad: 0 }
    for (const r of recibos) {
      inc.Faltas += r.faltas || 0
      inc.Retardos += r.retardos || 0
      inc['Días de vacaciones'] += r.dias_vacaciones || 0
      inc['Permiso con goce'] += r.dias_permiso_con_goce || 0
      inc['Sin goce'] += r.dias_sin_goce || 0
      inc.Incapacidad += r.dias_incapacidad || 0
    }
    const ordenados = conSueldo.map((r) => r.sueldo_mensual).sort((a, b) => a - b)
    const mediana = ordenados.length ? (ordenados.length % 2 ? ordenados[(ordenados.length - 1) / 2] : (ordenados[ordenados.length / 2 - 1] + ordenados[ordenados.length / 2]) / 2) : null
    return {
      total, conSueldo: conSueldo.length, conCosto: conCosto.length, ambos: ambos.length, perc, costo, mediana,
      esquemas: Object.entries(esquemas).sort((a, b) => b[1].costo - a[1].costo).map(([k, e], i) => ({
        clave: k, etiqueta: k, valor: e.costo, resaltar: i === 0,
        sub: `${num(e.n)} personas con costo${sinCostoPorEsquema[k] ? ` · ${num(sinCostoPorEsquema[k])} sin dato` : ''}`,
      })),
      rangos: sinSueldo ? [...rangos, { etiqueta: 'Sin sueldo', valor: sinSueldo, rayado: true }] : rangos,
      incidencias: Object.entries(inc).filter(([, v]) => v > 0).map(([etiqueta, valor]) => ({ etiqueta, valor })),
    }
  }, [recibos])

  if (!recibos.length) return null
  const carga = m.perc ? ((m.costo - m.perc) / m.perc) * 100 : null
  return (
    <div className="mb-6 space-y-3">
      <div className="grid gap-3 xl:grid-cols-3">
        <Tarjeta className="p-5 xl:col-span-2">
          <Rotulo nota="Costo empresa de la quincena (sueldo total integrado) agrupado por esquema de nómina. Quien no tiene costo capturado no se suma.">Costo por esquema de nómina</Rotulo>
          <Barras datos={m.esquemas} formato={dinero} />
          <div className="mt-3"><Base n={m.conCosto} de={m.total} que="recibos con costo" /></div>
        </Tarjeta>
        <Tarjeta className="p-5">
          <Rotulo nota="Solo recibos que tienen percepciones y costo empresa.">Percepciones vs. costo empresa</Rotulo>
          <Barras datos={[{ etiqueta: 'Percepciones', valor: m.perc }, { etiqueta: 'Costo empresa', valor: m.costo, resaltar: true }]} formato={dinero} />
          <p className="mt-4 text-[12.5px] text-humo">Carga sobre percepciones</p>
          <p className="mt-1 text-[26px] font-semibold leading-none tracking-titulo tabular">{carga == null ? '—' : pct(carga)}</p>
          <div className="mt-2"><Base n={m.ambos} de={m.total} que="recibos" /></div>
        </Tarjeta>
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        <Tarjeta className="p-5 xl:col-span-2">
          <Rotulo nota={`Personas por sueldo mensual neto. La columna rayada son recibos sin sueldo capturado. Mediana: ${m.mediana == null ? '—' : dinero(m.mediana)}.`}>Distribución de sueldos</Rotulo>
          <Columnas datos={m.rangos} />
          <div className="mt-3"><Base n={m.conSueldo} de={m.total} que="recibos con sueldo" /></div>
        </Tarjeta>
        <Tarjeta className="p-5">
          <Rotulo nota="Días o eventos del periodo que mueven la prenómina.">Incidencias del periodo</Rotulo>
          <Dona partes={m.incidencias} />
        </Tarjeta>
      </div>
    </div>
  )
}
