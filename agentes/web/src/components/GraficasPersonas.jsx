// Resúmenes tipo BI para Colaboradores, Bandeja, Cultura y Encuestas.
// Todo se calcula en el cliente con lo que la página ya lee; cada cifra dice sobre cuántos registros.
import React, { useMemo } from 'react'
import { collection } from 'firebase/firestore'
import { db } from '../firebase.js'
import { useEnVivo } from '../lib/datos.js'
import { dec, ms, num, pct } from '../lib/formato.js'
import { Barras, Base, Cifra, Columnas, Rotulo, Tarjeta } from './ui.jsx'
import { Dona, Gauge, Linea } from './Graficas.jsx'

const si = (v) => v === 1 || v === true || v === '1'
const contar = (lista, clave) => {
  const m = new Map()
  for (const x of lista) {
    const k = typeof clave === 'function' ? clave(x) : x[clave]
    m.set(k ?? null, (m.get(k ?? null) ?? 0) + 1)
  }
  return m
}
const ordenar = (m, tope = 8) =>
  [...m.entries()].filter(([k]) => k != null).sort((a, b) => b[1] - a[1]).slice(0, tope).map(([etiqueta, valor]) => ({ etiqueta, valor }))

// ============================================================ colaboradores
const RANGOS_ANTIGUEDAD = [
  ['< 1 año', 0, 12], ['1–2', 12, 24], ['2–3', 24, 36], ['3–5', 36, 60], ['5–10', 60, 120], ['10+', 120, Infinity],
]

export function ResumenPlantilla({ datos }) {
  const r = useMemo(() => {
    const plantilla = datos.filter((c) => c.es_plantilla !== 0)
    const activos = plantilla.filter((c) => c.estatus === 'Activo')
    const banca = activos.filter((c) => si(c.en_banca)).length
    const asignados = activos.filter((c) => si(c.tiene_asignacion_vigente)).length
    const conDepto = activos.filter((c) => c.departamento)
    const conAnt = activos.filter((c) => c.antiguedad_meses != null)
    const conExp = activos.filter((c) => c.pct_expediente != null)
    const expCompleto = conExp.filter((c) => Number(c.pct_expediente) >= 100).length
    const expPromedio = conExp.length ? conExp.reduce((s, c) => s + Number(c.pct_expediente), 0) / conExp.length : null
    const conCiudad = activos.filter((c) => c.ciudad)
    return {
      plantilla, activos, banca, asignados, conDepto, conAnt, conExp, expCompleto, expPromedio, conCiudad,
      sinDepto: activos.length - conDepto.length,
      deptos: ordenar(contar(conDepto, 'departamento'), 6),
      ciudades: ordenar(contar(conCiudad, 'ciudad'), 6),
      antiguedad: RANGOS_ANTIGUEDAD.map(([etiqueta, a, b]) => ({ etiqueta, valor: conAnt.filter((c) => c.antiguedad_meses >= a && c.antiguedad_meses < b).length })),
      bajas: plantilla.filter((c) => c.estatus === 'Baja').length,
    }
  }, [datos])

  if (!r.activos.length) return null
  return (
    <div className="mb-6 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tarjeta className="p-5"><Cifra etiqueta="Activos" valor={num(r.activos.length)} detalle={`${num(r.bajas)} bajas en el histórico`} base={<Base n={r.activos.length} de={r.plantilla.length} que="de plantilla" />} /></Tarjeta>
        <Tarjeta className="p-5" i={1}><Cifra etiqueta="En banca" valor={pct((r.banca / r.activos.length) * 100)} resaltar detalle={`${num(r.banca)} sin asignación vigente`} base={<Base n={r.activos.length} de={r.activos.length} que="activos" />} /></Tarjeta>
        <Tarjeta className="p-5" i={2}><Cifra etiqueta="Expediente completo" valor={`${num(r.expCompleto)} de ${num(r.conExp.length)}`} detalle={`Avance promedio ${r.expPromedio == null ? '—' : pct(r.expPromedio, 0)}`} base={<Base n={r.conExp.length} de={r.activos.length} que="activos" />} /></Tarjeta>
        <Tarjeta className="p-5" i={3}><Cifra etiqueta="Sin departamento" valor={num(r.sinDepto)} resaltar={r.sinDepto > 0} detalle="Dato que falta en la fuente (regla 5)" base={<Base n={r.conDepto.length} de={r.activos.length} que="activos con dato" />} /></Tarjeta>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <Tarjeta className="p-5">
          <Rotulo nota="Activos con y sin asignación vigente (regla 14).">Banca vs. asignados</Rotulo>
          <Dona partes={[{ etiqueta: 'Con asignación', valor: r.asignados }, { etiqueta: 'En banca', valor: r.banca, tono: '#BABABA' }]} />
        </Tarjeta>
        <Tarjeta className="p-5" i={1}>
          <Rotulo nota="Años desde la fecha de incorporación.">Antigüedad de los activos</Rotulo>
          <Columnas datos={r.antiguedad} alto={150} />
          <Base n={r.conAnt.length} de={r.activos.length} que="activos con fecha de ingreso" className="mt-3" />
        </Tarjeta>
        <Tarjeta className="p-5" i={2}>
          <Rotulo nota={r.deptos.length ? 'Solo los activos que tienen departamento capturado.' : 'Ningún activo tiene departamento; se muestra por ciudad.'}>
            {r.deptos.length ? 'Plantilla por departamento' : 'Plantilla por ciudad'}
          </Rotulo>
          <Barras datos={r.deptos.length ? r.deptos : r.ciudades} />
          <Base n={r.deptos.length ? r.conDepto.length : r.conCiudad.length} de={r.activos.length} que="activos" className="mt-3" />
        </Tarjeta>
      </div>
    </div>
  )
}

// ============================================================ bandeja
const NOMBRE_PRIORIDAD = { alta: 'Alta', media: 'Media', baja: 'Baja' }
const NOMBRE_ESTADO = { abierta: 'Abiertas', hecha: 'Hechas', descartada: 'Descartadas' }

export function ResumenBandeja({ datos, nombreTipo }) {
  const r = useMemo(() => {
    const abiertas = datos.filter((t) => t.estado === 'abierta')
    const cerradas = datos.filter((t) => t.estado === 'hecha' || t.estado === 'descartada')
    const tipos = ordenar(contar(abiertas, 'tipo'), 7).map((d) => ({ ...d, etiqueta: nombreTipo(d.etiqueta) }))
    const prioridad = ['alta', 'media', 'baja'].map((p, i) => ({ etiqueta: NOMBRE_PRIORIDAD[p], valor: abiertas.filter((t) => t.prioridad === p).length, tono: ['#FD111C', '#FF8A4C', '#BABABA'][i] }))
    const estados = Object.entries(NOMBRE_ESTADO).map(([k, etiqueta], i) => ({ etiqueta, valor: datos.filter((t) => t.estado === k).length, tono: ['#FD111C', '#1A1A1A', '#DEDEDE'][i] }))
    const agentes = abiertas.filter((t) => t.origen === 'agente').length
    return { abiertas, cerradas, tipos, prioridad, estados, agentes, altas: prioridad[0].valor }
  }, [datos, nombreTipo])

  if (!datos.length) return null
  const avance = datos.length ? (r.cerradas.length / datos.length) * 100 : null
  return (
    <div className="mb-6 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tarjeta className="p-5"><Cifra etiqueta="Abiertas" valor={num(r.abiertas.length)} base={<Base n={r.abiertas.length} de={datos.length} que="tareas" />} /></Tarjeta>
        <Tarjeta className="p-5" i={1}><Cifra etiqueta="Prioridad alta" valor={num(r.altas)} resaltar={r.altas > 0} detalle="Abiertas que bloquean un indicador" /></Tarjeta>
        <Tarjeta className="p-5" i={2}><Cifra etiqueta="Resueltas" valor={pct(avance, 0)} detalle={`${num(r.cerradas.length)} hechas o descartadas`} base={<Base n={r.cerradas.length} de={datos.length} que="tareas" />} /></Tarjeta>
        <Tarjeta className="p-5" i={3}><Cifra etiqueta="Propuestas por agentes" valor={num(r.agentes)} detalle="El resto las crea la rutina diaria" /></Tarjeta>
      </div>
      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr]">
        <Tarjeta className="p-5">
          <Rotulo nota="Reglas con más tareas abiertas.">Tareas abiertas por regla</Rotulo>
          <Barras datos={r.tipos.map((d, i) => ({ ...d, resaltar: i === 0 }))} />
        </Tarjeta>
        <Tarjeta className="p-5" i={1}>
          <Rotulo>Abiertas por prioridad</Rotulo>
          <Dona partes={r.prioridad} />
        </Tarjeta>
        <Tarjeta className="p-5" i={2}>
          <Rotulo>Estado de la bandeja</Rotulo>
          <Dona partes={r.estados} />
        </Tarjeta>
      </div>
    </div>
  )
}

// ============================================================ cultura
const lunes = (t) => {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}
const SEMANAS = 8

export function ResumenCultura({ datos }) {
  const r = useMemo(() => {
    const conFecha = datos.filter((x) => ms(x.creada))
    const hoy = lunes(Date.now())
    const semanas = Array.from({ length: SEMANAS }, (_, i) => hoy - (SEMANAS - 1 - i) * 7 * 864e5)
    const porSemana = semanas.map((s) => ({
      etiqueta: new Date(s).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }).replace('.', ''),
      valor: conFecha.filter((x) => lunes(ms(x.creada)) === s).length,
    }))
    const conValor = datos.filter((x) => x.valor)
    const personas = new Set(datos.map((x) => x.para_id_colaborador).filter(Boolean)).size
    return {
      conFecha, porSemana, conValor, personas,
      valores: ordenar(contar(conValor, 'valor'), 6),
      top: ordenar(contar(datos, (x) => x.para_nombre || x.para_id_colaborador), 5).map((d, i) => ({ ...d, resaltar: i === 0 })),
    }
  }, [datos])

  if (!datos.length) return null
  return (
    <div className="mb-6 grid gap-3 lg:grid-cols-3">
      <Tarjeta className="p-5">
        <Rotulo nota={`${num(r.personas)} personas distintas reconocidas.`}>Reconocimientos por semana</Rotulo>
        <Linea datos={r.porSemana} alto={150} />
        <Base n={r.conFecha.length} de={datos.length} que="reconocimientos con fecha" className="mt-2" />
      </Tarjeta>
      <Tarjeta className="p-5" i={1}>
        <Rotulo nota="Qué valor de la cultura se reconoce más.">Por valor</Rotulo>
        <Dona partes={r.valores} />
        <Base n={r.conValor.length} de={datos.length} que="con valor" className="mt-3" />
      </Tarjeta>
      <Tarjeta className="p-5" i={2}>
        <Rotulo>Los más reconocidos</Rotulo>
        <Barras datos={r.top} />
      </Tarjeta>
    </div>
  )
}

// ============================================================ encuestas
const quitarClave = (s) => String(s).replace(/^CB\d+\s*·\s*/, '')

/** Tira de resultados sobre la lista: eNPS, clima por pregunta y causas de salida (solo agregados). */
export function ResumenEncuestas({ encuestas }) {
  const { datos: resultados } = useEnVivo(() => collection(db, 'encuestas_resultados'), [])
  const r = useMemo(() => {
    const deTipo = (tipo) => {
      const ids = new Set(encuestas.filter((e) => e.tipo === tipo).map((e) => e.id))
      return resultados.filter((x) => ids.has(x.id) && x.total > 0).sort((a, b) => ms(b.actualizado) - ms(a.actualizado))[0] ?? null
    }
    const enps = deTipo('enps')
    const clima = deTipo('clima')
    const salida = deTipo('salida')
    const preguntas = (res) => Object.values(res?.por_pregunta ?? {})
    const pNps = preguntas(enps).find((p) => p.tipo === 'nps')
    const escalas = preguntas(clima).filter((p) => p.tipo === 'escala' && p.promedio != null)
      .sort((a, b) => a.promedio - b.promedio)
      .map((p, i) => ({ etiqueta: p.texto, valor: p.promedio, resaltar: i === 0 }))
    const pCausa = preguntas(salida).find((p) => p.tipo === 'opcion')
    const causas = Object.entries(pCausa?.distribucion ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([k, v], i) => ({ etiqueta: quitarClave(k), valor: v, resaltar: i === 0 }))
    const total = resultados.reduce((s, x) => s + (x.total || 0), 0)
    return { enps, clima, salida, pNps, escalas, pCausa, causas, total }
  }, [encuestas, resultados])

  if (!r.total) return null
  return (
    <div className="mb-6 grid gap-3 lg:grid-cols-[0.8fr_1.3fr_1.1fr]">
      <Tarjeta className="p-5">
        <Rotulo nota="Promotores (9–10) menos detractores (0–6).">eNPS</Rotulo>
        {r.pNps?.nps ? (
          <>
            <div className="flex justify-center"><Gauge valor={r.pNps.nps.score} etiqueta={`Promedio ${dec(r.pNps.promedio)} de 10`} /></div>
            <div className="mt-3 grid grid-cols-3 text-center text-[12.5px]">
              <div><p className="font-semibold tabular">{num(r.pNps.nps.promotores)}</p><p className="text-humo">Promotores</p></div>
              <div><p className="font-semibold tabular">{num(r.pNps.nps.pasivos)}</p><p className="text-humo">Pasivos</p></div>
              <div><p className="font-semibold tabular text-rojo">{num(r.pNps.nps.detractores)}</p><p className="text-humo">Detractores</p></div>
            </div>
            <Base n={r.pNps.n} de={r.enps.total} que="respuestas" className="mt-3" />
          </>
        ) : <p className="text-[13px] text-humo">Sin respuestas de eNPS.</p>}
      </Tarjeta>
      <Tarjeta className="p-5" i={1}>
        <Rotulo nota="Promedio de 1 a 5; arriba, lo peor calificado.">Clima laboral por pregunta</Rotulo>
        <Barras datos={r.escalas} max={5} formato={dec} vacio="Sin respuestas de clima." />
        {r.clima && <Base n={r.clima.total} de={r.clima.total} que="respuestas" className="mt-3" />}
      </Tarjeta>
      <Tarjeta className="p-5" i={2}>
        <Rotulo nota="Catálogo de causas de baja (regla 6).">Por qué se van</Rotulo>
        <Barras datos={r.causas} vacio="Sin respuestas de salida." />
        {r.pCausa && <Base n={r.pCausa.n} de={r.salida.total} que="respuestas" className="mt-3" />}
      </Tarjeta>
    </div>
  )
}
