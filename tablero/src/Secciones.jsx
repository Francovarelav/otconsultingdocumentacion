import React, { useState } from 'react'
import {
  Avance, Base, Bloqueado, Cifra, Columnas, Dinero, Ficha, Hallazgo, Leyenda, Pastilla,
  Reparto, Renglones, Rotulo, Tabla, corto, fecha, mesCorto, num, pct, persona,
} from './ui.jsx'

const bloqueado = (d, clave) => d.bloqueados.find((b) => b.indicador.includes(clave))

// ============================================================================ Resumen
export function Resumen({ d, ir }) {
  const u = d.utilizacion.resumen
  const p = d.plantilla
  const h = d.habilidades
  const riesgo = h.lista.filter((x) => x.riesgo_persona_clave).length
  const asignacion = [
    { etiqueta: 'Con asignación vigente', valor: u.con_asignacion, tono: 'tinta' },
    { etiqueta: 'En banca', valor: u.en_banca, tono: 'carmin' },
  ]
  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <div>
          <p className="text-[19px] font-semibold tracking-tight">Costo de nómina al mes</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
            <Dinero valor={u.costo_nomina_mes} className="text-[44px] leading-none sm:text-[56px]" />
            <Pastilla tono="carmin">{pct((u.costo_banca_mes / u.costo_nomina_mes) * 100)} en banca</Pastilla>
          </div>
          <Base n={u.personas_con_sueldo} de={u.plantilla_activa} que="activos con sueldo capturado" className="mt-3" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Ficha className="!p-5">
            <Cifra etiqueta="Plantilla activa" valor={num(p.activos)} detalle={`${num(p.bajas)} bajas registradas`} />
          </Ficha>
          <Ficha oscuro className="!p-5">
            <p className="text-[13.5px] text-white/60">Costo de la banca al mes</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">{corto(u.costo_banca_mes)}</p>
            <p className="mt-1.5 text-[13px] text-white/60">{num(u.en_banca)} personas sin asignación</p>
          </Ficha>
        </div>
      </div>

      <div>
        <Reparto partes={asignacion} />
        <Leyenda partes={asignacion} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Pregunta titulo="¿Por qué se va la gente y cuánto cuesta?" onVer={() => ir('rotacion')}>
          <Cifra grande valor={pct((p.bajas_desde_2024 / p.ingresos_desde_2024) * 100)}
            etiqueta="de quienes entraron desde 2024 ya salió"
            detalle={`${num(p.bajas_desde_2024)} de ${num(p.ingresos_desde_2024)} ingresos`} />
          <Sinrespuesta>
            Causa de baja capturada en 0 de {num(p.bajas)} salidas. El porqué no se puede responder todavía.
          </Sinrespuesta>
        </Pregunta>
        <Pregunta titulo="¿Cuánta plantilla genera ingreso?" onVer={() => ir('utilizacion')}>
          <Cifra grande valor={pct(100 - u.pct_en_banca)}
            etiqueta="de los activos tiene asignación vigente"
            detalle={`${num(u.con_asignacion)} de ${num(u.plantilla_activa)} personas`} />
          <Sinrespuesta>
            No hay horas ni tarifas: se sabe quién está asignado, no cuánto factura.
          </Sinrespuesta>
        </Pregunta>
        <Pregunta titulo="¿Tenemos el talento para lo que viene?" onVer={() => ir('habilidades')}>
          <Cifra grande valor={num(riesgo)}
            etiqueta={`de ${num(h.lista.length)} habilidades dependen de una persona o de nadie`}
            detalle={`${num(h.cobertura.con_matriz)} de ${num(h.cobertura.plantilla_activa)} activos tienen matriz`} />
          <Sinrespuesta>
            Ninguna evaluación tiene fecha y las certificaciones no tienen vencimiento.
          </Sinrespuesta>
        </Pregunta>
      </div>

      <Ficha hundido>
        <Rotulo nota="El tablero no rellena huecos: lo que falta se muestra rayado y se excluye del cálculo.">
          Qué tan confiable es lo que ves
        </Rotulo>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Confiable titulo="Sueldo" n={u.personas_con_sueldo} de={u.plantilla_activa} />
          <Confiable titulo="Puesto" n={u.plantilla_activa - d.cumplimiento.resumen.falta_puesto} de={u.plantilla_activa} />
          <Confiable titulo="Departamento" n={u.plantilla_activa - d.cumplimiento.resumen.falta_departamento} de={u.plantilla_activa} />
          <Confiable titulo="Fecha de baja" n={d.rotacion.anual.bajas_con_fecha} de={d.rotacion.anual.bajas_totales} />
        </div>
      </Ficha>
    </div>
  )
}

function Pregunta({ titulo, children, onVer }) {
  return (
    <Ficha className="flex flex-col gap-5">
      <h3 className="text-[17px] font-semibold tracking-tight">{titulo}</h3>
      {children}
      <button onClick={onVer} className="mt-auto self-start rounded-full bg-tinta px-4 py-2 text-[13.5px] font-medium text-white hover:bg-carmin">
        Ver el detalle
      </button>
    </Ficha>
  )
}

const Sinrespuesta = ({ children }) => (
  <p className="rayado rounded-2xl bg-panel px-4 py-3 text-[13.5px] leading-relaxed">{children}</p>
)

function Confiable({ titulo, n, de }) {
  const v = (n / de) * 100
  return (
    <div className="rounded-3xl bg-white p-4 shadow-ficha">
      <div className="flex items-baseline justify-between">
        <p className="font-medium">{titulo}</p>
        <p className="text-[13px] text-humo">{num(n)} de {num(de)}</p>
      </div>
      <p className="my-2 text-2xl font-semibold tracking-tight">{pct(v)}</p>
      <Avance valor={v} rayado tono={v < 60 ? 'bg-carmin' : 'bg-tinta'} />
    </div>
  )
}

// ============================================================================ Rotación
export function Rotacion({ d }) {
  const r = d.rotacion
  const max = Math.max(...r.mensual.map((m) => m.bajas_mes))
  const meses = r.mensual.map((m) => ({
    etiqueta: mesCorto(m.mes), titulo: m.mes, valor: m.bajas_mes, resaltar: m.bajas_mes === max && max > 0,
  }))
  const cohortes = r.cohortes.filter((c) => c.anio_ingreso >= 2021)
  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[1fr_1.6fr]">
        <Ficha>
          <Cifra grande etiqueta="Rotación de los últimos 12 meses" valor={pct(r.anual.rotacion_anual_pct, 1)}
            detalle={`${num(r.anual.bajas_12m_con_fecha)} bajas sobre una plantilla promedio de ${num(r.anual.plantilla_promedio_12m)}`} />
          <Base n={r.anual.bajas_con_fecha} de={r.anual.bajas_totales} que="bajas con fecha" className="mt-4" />
          <Hallazgo className="mt-4">
            {num(r.anual.bajas_sin_fecha)} bajas no tienen fecha, así que no se pueden ubicar en ningún mes.
            La rotación real es mayor que la que se alcanza a medir.
          </Hallazgo>
        </Ficha>
        <Ficha>
          <Rotulo nota="Solo bajas con fecha. El mes resaltado concentra la mayor salida.">Bajas por mes</Rotulo>
          <Columnas datos={meses} unidad="bajas" />
        </Ficha>
      </div>

      <Ficha hundido>
        <Rotulo nota="De cada generación de ingreso, cuántos siguen y cuántos salieron.">
          Permanencia por año de ingreso
        </Rotulo>
        <div className="space-y-3">
          {cohortes.map((c) => (
            <div key={c.anio_ingreso} className="grid items-center gap-3 sm:grid-cols-[4rem_1fr_11rem]">
              <p className="font-semibold">{c.anio_ingreso}</p>
              <Reparto alto="h-11" partes={[
                { etiqueta: 'Siguen', valor: c.activos, tono: 'blanco' },
                { etiqueta: 'Salieron', valor: c.bajas, tono: 'carmin' },
              ]} />
              <p className="text-[13px] text-humo">
                {pct(c.pct_baja)} salió
                {c.bajas_con_permanencia > 0 && ` · ${c.permanencia_meses} meses en promedio`}
              </p>
            </div>
          ))}
        </div>
        <Leyenda partes={[{ etiqueta: 'Siguen activos', tono: 'blanco' }, { etiqueta: 'Salieron', tono: 'carmin' }]} />
        <p className="mt-3 text-[13px] text-humo">
          El promedio de meses usa solo las bajas con fecha. Bajas en el primer año confirmadas: {num(d.plantilla.bajas_primer_anio)} de {num(d.plantilla.bajas_con_permanencia)} con
          permanencia conocida.
        </p>
      </Ficha>

      <div className="grid gap-5 lg:grid-cols-2">
        <Ficha>
          <Rotulo>Antigüedad de la plantilla activa</Rotulo>
          <Columnas alto={170} unidad="personas"
            datos={r.antiguedad.map((a) => ({ etiqueta: a.rango.split(' · ')[1], valor: a.personas }))} />
        </Ficha>
        <div className="grid content-start gap-3">
          <Bloqueado titulo="Bajas voluntarias e involuntarias" {...leer(bloqueado(d, 'es_baja_voluntaria'))} />
          <Bloqueado titulo="Costo de reemplazo por baja" {...leer(bloqueado(d, 'costo_reemplazo'))} />
        </div>
      </div>
    </div>
  )
}

const leer = (b) => ({ falta: b.dato_que_falta, tabla: b.tabla, campo: b.campo })

// ============================================================================ Utilización
export function Utilizacion({ d }) {
  const u = d.utilizacion
  const r = u.resumen
  const [todos, setTodos] = useState(false)
  const banca = [...u.banca].sort((a, b) => (b.costo_mensual || 0) - (a.costo_mensual || 0))
  const visibles = todos ? banca : banca.slice(0, 8)
  const puestos = u.por_puesto.filter((p) => p.en_banca > 0).slice(0, 7)
  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-3">
        <Ficha>
          <Cifra grande etiqueta="Activos con asignación vigente" valor={pct(100 - r.pct_en_banca)}
            detalle={`${num(r.con_asignacion)} de ${num(r.plantilla_activa)} personas`} />
        </Ficha>
        <Ficha oscuro>
          <p className="text-[13.5px] text-white/60">En banca</p>
          <p className="mt-1 text-5xl font-semibold tracking-tight">{num(r.en_banca)}</p>
          <p className="mt-1.5 text-[13px] text-white/60">
            {corto(r.costo_banca_mes)} al mes, sobre {num(r.banca_con_sueldo)} con sueldo capturado
          </p>
        </Ficha>
        <Ficha>
          <Cifra grande etiqueta="Sobreasignados" valor={num(r.sobreasignados)}
            detalle={u.sobreasignados.map((s) => `${persona(s)}: ${s.asignaciones_vigentes} asignaciones al mismo tiempo`).join(' · ') || 'Nadie pasa de 100%'} />
        </Ficha>
      </div>

      <Hallazgo>
        «En banca» incluye a personal administrativo que no se asigna a clientes. Para separarlo hace falta el
        departamento, que hoy solo tienen {num(r.plantilla_activa - d.cumplimiento.resumen.falta_departamento)} de {num(r.plantilla_activa)} activos.
        La dedicación tampoco se captura: cada asignación se toma al 100%.
      </Hallazgo>

      <div className="grid gap-5 lg:grid-cols-2">
        <Ficha hundido>
          <Rotulo nota="Personas asignadas por cliente y su peso entre quienes están asignados.">Concentración por cliente</Rotulo>
          <Renglones datos={u.clientes.map((c) => ({
            clave: c.id_cliente, etiqueta: c.cliente, sub: `${c.industria} · ${corto(c.costo_personal_mes)} de costo de personal al mes`,
            valor: num(c.colaboradores), marca: pct(c.pct_de_asignados), tono: c.pct_de_asignados > 50 ? 'carmin' : 'neutro',
          }))} />
        </Ficha>
        <Ficha hundido>
          <Rotulo nota="Puestos con más gente sin asignación vigente.">Banca por puesto</Rotulo>
          <Renglones datos={puestos.map((p) => ({
            etiqueta: p.puesto, sub: `${num(p.personas)} activos en el puesto`, valor: num(p.en_banca),
            marca: pct((p.en_banca / p.personas) * 100), tono: p.puesto.startsWith('Sin') ? 'rayado' : 'neutro',
          }))} />
        </Ficha>
      </div>

      <Ficha>
        <Rotulo nota="Proyectos con gente asignada hoy y lo que falta capturar de cada uno.">Proyectos</Rotulo>
        <Tabla filas={u.proyectos.filter((p) => p.asignaciones_vigentes > 0 || p.estatus_proyecto === 'En Curso')} columnas={[
          { titulo: 'Proyecto', celda: (p) => <><p className="font-medium">{p.proyecto}</p><p className="text-humo">{p.cliente} · {p.id_proyecto}</p></> },
          { titulo: 'Estatus', clase: 'whitespace-nowrap', celda: (p) => p.estatus_proyecto },
          { titulo: 'Termina', clase: 'whitespace-nowrap', celda: (p) => (p.fecha_fin ? fecha(p.fecha_fin) : <span className="text-humo">Sin fecha</span>) },
          { titulo: 'Asignados', derecha: true, celda: (p) => num(p.asignaciones_vigentes) },
          { titulo: 'Costo de personal al mes', derecha: true, celda: (p) => (p.costo_personal_proyecto ? corto(p.costo_personal_proyecto) : '—') },
          { titulo: 'Por corregir', celda: (p) => (
            <span className="flex flex-wrap gap-1">
              {p.fin_vencido_en_curso ? <Pastilla tono="carmin">En curso con fin vencido</Pastilla> : null}
              {p.falta_pm ? <Pastilla tono="rayado">Sin PM</Pastilla> : null}
              {p.falta_fecha_inicio ? <Pastilla tono="rayado">Sin fecha de inicio</Pastilla> : null}
            </span>) },
        ]} />
      </Ficha>

      <Ficha>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <Rotulo nota="Ordenado por costo mensual. Los días cuentan desde el ingreso cuando no hay asignación anterior registrada.">
            Quién está en banca
          </Rotulo>
          <button onClick={() => setTodos(!todos)} className="rounded-full bg-panel px-4 py-2 text-[13.5px] font-medium hover:bg-tinta hover:text-white">
            {todos ? 'Ver solo los primeros 8' : `Ver los ${banca.length}`}
          </button>
        </div>
        <Tabla filas={visibles} columnas={[
          { titulo: 'Colaborador', celda: (f) => <><p className="font-medium">{persona(f)}</p>{f.nombre && <p className="text-humo">{f.id_colaborador}</p>}</> },
          { titulo: 'Puesto', celda: (f) => f.puesto || <Pastilla tono="rayado">Sin puesto</Pastilla> },
          { titulo: 'Ingreso', celda: (f) => fecha(f.fecha_incorporacion) },
          { titulo: 'Días sin asignación', derecha: true, celda: (f) => num(f.dias_en_banca) },
          { titulo: 'Costo al mes', derecha: true, celda: (f) => (f.costo_mensual ? corto(f.costo_mensual) : <Pastilla tono="rayado">Sin sueldo</Pastilla>) },
        ]} />
      </Ficha>

      <div className="grid gap-3 lg:grid-cols-2">
        <Bloqueado titulo="Horas facturables" {...leer(bloqueado(d, 'pct_horas_facturables'))} />
        <Bloqueado titulo="Ingreso y margen por proyecto" {...leer(bloqueado(d, 'margen_proyecto_pct'))} />
      </div>
    </div>
  )
}

// ============================================================================ Costos
export function Costos({ d }) {
  const c = d.costos.composicion
  const u = d.utilizacion.resumen
  const partes = [
    { etiqueta: 'Neto por IMSS', valor: c.neto_imss, tono: 'tinta' },
    { etiqueta: 'Asimilados o sindicato', valor: c.asimilados_sindicato, tono: 'carmin' },
    { etiqueta: 'Complementos', valor: c.complementos, tono: 'bruma' },
    { etiqueta: 'Impuestos IMSS', valor: c.impuestos_imss, tono: 'blanco' },
    { etiqueta: 'Comisión de nómina', valor: c.comision_nomina, tono: 'bruma' },
  ]
  const neto = c.neto_imss + c.asimilados_sindicato + c.complementos
  const max = Math.max(...d.costos.esquema.map((e) => e.costo_nomina_por_esquema || 0))
  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr_1fr]">
        <Ficha>
          <p className="text-[13.5px] text-humo">Costo integrado de la plantilla activa al mes</p>
          <Dinero valor={c.total_integrado} className="mt-1 block text-4xl" />
          <Base n={u.personas_con_sueldo} de={u.plantilla_activa} que="activos con sueldo" className="mt-3" />
        </Ficha>
        <Ficha>
          <Cifra etiqueta="Costo promedio por persona" valor={corto(c.total_integrado / u.personas_con_sueldo)}
            detalle={`${corto(c.total_integrado / u.personas_con_sueldo / 160)} por hora, a 160 horas al mes`} />
        </Ficha>
        <Ficha oscuro>
          <p className="text-[13.5px] text-white/60">Del sueldo neto se paga fuera de IMSS</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight">{pct((c.asimilados_sindicato / neto) * 100)}</p>
          <p className="mt-1.5 text-[13px] text-white/60">por asimilados o sindicato</p>
        </Ficha>
      </div>

      <Ficha hundido>
        <Rotulo nota="Cómo se compone el costo integrado de un mes.">De qué está hecho el costo</Rotulo>
        <Reparto partes={partes} formato={corto} />
        <Leyenda partes={partes.map((x) => ({ ...x, formato: corto }))} />
      </Ficha>

      <Ficha>
        <Rotulo nota="Costo mensual de la plantilla activa por esquema de nómina.">Costo por esquema</Rotulo>
        <div className="space-y-3">
          {d.costos.esquema.map((e) => (
            <div key={e.esquema_nomina} className="grid items-center gap-x-4 gap-y-1 sm:grid-cols-[14rem_1fr_7rem]">
              <div>
                <p className="font-medium">{e.esquema_nomina}</p>
                <p className="text-[12.5px] text-humo">{num(e.personas_con_sueldo)} de {num(e.personas)} con sueldo</p>
              </div>
              <Avance valor={((e.costo_nomina_por_esquema || 0) / max) * 100} rayado={!e.costo_nomina_por_esquema} />
              <p className="text-right font-semibold">{e.costo_nomina_por_esquema ? corto(e.costo_nomina_por_esquema) : 'Sin sueldo'}</p>
            </div>
          ))}
        </div>
      </Ficha>

      <Ficha hundido>
        <Rotulo nota="Costo mensual de las personas asignadas a cada cliente. Sin tarifas no se puede comparar contra lo que se factura.">
          Costo de personal por cliente
        </Rotulo>
        <Reparto formato={corto} partes={[
          ...d.utilizacion.clientes.map((x, i) => ({ etiqueta: x.cliente, valor: x.costo_personal_mes, tono: ['tinta', 'blanco', 'bruma'][i % 3] })),
          { etiqueta: 'Banca', valor: u.costo_banca_mes, tono: 'carmin' },
        ]} />
        <Leyenda partes={[
          ...d.utilizacion.clientes.map((x, i) => ({ etiqueta: x.cliente, valor: x.costo_personal_mes, formato: corto, tono: ['tinta', 'blanco', 'bruma'][i % 3] })),
          { etiqueta: 'Banca (sin asignación)', valor: u.costo_banca_mes, formato: corto, tono: 'carmin' },
        ]} />
      </Ficha>
    </div>
  )
}

// ============================================================================ Habilidades
export function Habilidades({ d }) {
  const h = d.habilidades
  const riesgo = h.lista.filter((x) => x.riesgo_persona_clave)
  const fuertes = [...h.lista].sort((a, b) => b.expertos_por_habilidad - a.expertos_por_habilidad).slice(0, 8)
  const tecnologias = [...new Set(h.niveles.map((n) => n.tecnologia))].filter((t) => t.startsWith('Oracle') || t.startsWith('Plataformas'))
  const tonos = { 1: 'blanco', 2: 'bruma', 3: 'tinta', 4: 'carmin' }
  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-3">
        <Ficha>
          <Cifra grande etiqueta="Activos con matriz de habilidades" valor={pct((h.cobertura.con_matriz / h.cobertura.plantilla_activa) * 100)}
            detalle={`${num(h.cobertura.con_matriz)} de ${num(h.cobertura.plantilla_activa)} · ${num(h.cobertura.sin_matriz)} sin evaluar`} />
        </Ficha>
        <Ficha oscuro>
          <p className="text-[13.5px] text-white/60">Habilidades en riesgo de persona clave</p>
          <p className="mt-1 text-5xl font-semibold tracking-tight">{num(riesgo.length)}</p>
          <p className="mt-1.5 text-[13px] text-white/60">con un solo experto disponible, o ninguno</p>
        </Ficha>
        <Ficha>
          <Cifra grande etiqueta="Evaluaciones registradas" valor={num(h.cobertura.evaluaciones)}
            detalle={`${num(h.cobertura.evaluaciones_sin_fecha)} sin fecha de evaluación`} />
        </Ficha>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Ficha hundido>
          <Rotulo nota="Experto disponible: activo con nivel Avanzado o Experto.">Dependen de una persona o de nadie</Rotulo>
          <Renglones datos={riesgo.map((x) => ({
            clave: x.cod_habilidad, etiqueta: x.habilidad, sub: `${x.tecnologia} · ${num(x.evaluados)} evaluados`,
            valor: num(x.expertos_por_habilidad), marca: x.expertos_por_habilidad ? 'un experto' : 'nadie',
            tono: x.expertos_por_habilidad ? 'neutro' : 'carmin',
          }))} />
        </Ficha>
        <Ficha hundido>
          <Rotulo nota="Las habilidades con más expertos disponibles hoy.">Donde hay más profundidad</Rotulo>
          <Renglones datos={fuertes.map((x) => ({
            clave: x.cod_habilidad, etiqueta: x.habilidad, sub: `${x.tecnologia} · ${num(x.evaluados)} evaluados`,
            valor: num(x.expertos_por_habilidad), marca: 'expertos',
          }))} />
        </Ficha>
      </div>

      <Ficha>
        <Rotulo nota="Evaluaciones de la plantilla activa por nivel. Vacío en la matriz es «no evaluado», no nivel cero.">
          Niveles por tecnología
        </Rotulo>
        <div className="space-y-3">
          {tecnologias.map((t) => (
            <div key={t} className="grid items-center gap-3 sm:grid-cols-[13rem_1fr]">
              <p className="font-medium">{t}</p>
              <Reparto alto="h-11" partes={h.niveles.filter((n) => n.tecnologia === t)
                .map((n) => ({ etiqueta: n.nivel, valor: n.evaluaciones, tono: tonos[n.nivel_num] }))} />
            </div>
          ))}
        </div>
        <Leyenda partes={[{ etiqueta: 'Básico', tono: 'blanco' }, { etiqueta: 'Intermedio', tono: 'bruma' }, { etiqueta: 'Avanzado', tono: 'tinta' }, { etiqueta: 'Experto', tono: 'carmin' }]} />
      </Ficha>

      <div className="grid gap-3 lg:grid-cols-2">
        <Bloqueado titulo="Certificaciones por vencer" {...leer(bloqueado(d, 'dias_vencim_cert'))} />
        <Bloqueado titulo="Matriz actualizada en los últimos 12 meses" {...leer(bloqueado(d, 'matriz_actualizada'))} />
      </div>
    </div>
  )
}

// ============================================================================ Cumplimiento y activos
export function Cumplimiento({ d }) {
  const c = d.cumplimiento
  const a = d.activos
  const obligatorios = c.documentos.filter((x) => x.obligatorio)
  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-3">
        <Ficha oscuro>
          <p className="text-[13.5px] text-white/60">Expedientes completos</p>
          <p className="mt-1 text-5xl font-semibold tracking-tight">{num(c.resumen.expedientes_completos)}<span className="text-white/40"> de {num(c.resumen.plantilla_activa)}</span></p>
          <p className="mt-1.5 text-[13px] text-white/60">Avance promedio del expediente: {pct(c.resumen.pct_expediente_promedio)}</p>
        </Ficha>
        <Ficha>
          <Cifra grande etiqueta="Activos con puesto, departamento, esquema y sueldo" valor={num(c.resumen.cumple_regla_5)}
            detalle={`de ${num(c.resumen.plantilla_activa)}. Lo que más falta es el departamento (${num(c.resumen.falta_departamento)}).`} />
        </Ficha>
        <Ficha>
          <Cifra grande etiqueta="Equipo por recuperar de bajas" valor={num(a.resumen.pendientes_recuperar)}
            detalle={`${corto(a.resumen.valor_equipo_no_recuperado)} conocidos, sobre ${num(a.resumen.pendientes_con_costo)} equipos con costo`} />
        </Ficha>
      </div>

      <Ficha>
        <Rotulo nota="Porcentaje de activos con cada documento obligatorio entregado. «No aplica» cuenta como cumplido.">
          Documentos del expediente
        </Rotulo>
        <div className="grid gap-x-10 gap-y-3 md:grid-cols-2">
          {obligatorios.map((x) => (
            <div key={x.documento} className="grid grid-cols-[1fr_3.5rem] items-center gap-x-3 gap-y-1">
              <p className="font-medium">{x.nombre}</p>
              <p className="text-right font-semibold">{pct(x.pct_cumplido)}</p>
              <div className="col-span-2"><Avance valor={x.pct_cumplido} tono={x.pct_cumplido < 50 ? 'bg-carmin' : 'bg-tinta'} /></div>
            </div>
          ))}
        </div>
      </Ficha>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <Ficha hundido>
          <Rotulo nota={`${num(a.resumen.equipos)} equipos en el inventario.`}>Inventario de equipo</Rotulo>
          <Reparto alto="h-12" partes={[
            { etiqueta: 'En uso', valor: a.resumen.en_uso - a.resumen.pendientes_recuperar, tono: 'tinta' },
            { etiqueta: 'Por recuperar', valor: a.resumen.pendientes_recuperar, tono: 'carmin' },
            { etiqueta: 'Sin asignar', valor: a.resumen.equipos - a.resumen.en_uso, tono: 'blanco' },
          ]} />
          <Leyenda partes={[{ etiqueta: 'En uso', valor: a.resumen.en_uso - a.resumen.pendientes_recuperar, tono: 'tinta' }, { etiqueta: 'Por recuperar', valor: a.resumen.pendientes_recuperar, tono: 'carmin' }, { etiqueta: 'Sin asignar o devuelto', valor: a.resumen.equipos - a.resumen.en_uso, tono: 'blanco' }]} />
          <div className="mt-5 space-y-2">
            {a.marcas.map((m) => (
              <div key={m.marca} className="flex items-center justify-between rounded-2xl bg-white px-4 py-2.5 shadow-ficha">
                <p className="font-medium">{m.marca}</p>
                <p className="text-[13px] text-humo">{num(m.equipos)} equipos · {num(m.sin_costo)} sin costo</p>
              </div>
            ))}
          </div>
          <Base n={a.resumen.con_costo} de={a.resumen.equipos} que="equipos con costo de compra" className="mt-4" />
        </Ficha>
        <Ficha>
          <Rotulo nota="Equipo que sigue a nombre de alguien que ya causó baja.">Equipo por recuperar</Rotulo>
          <Tabla filas={a.pendientes} columnas={[
            { titulo: 'Equipo', celda: (f) => <><p className="font-medium">{f.marca} {f.modelo}</p><p className="text-humo">{f.cod_activo} · {f.tipo}</p></> },
            { titulo: 'A nombre de', celda: (f) => persona(f) },
            { titulo: 'Baja', celda: (f) => (f.fecha_baja ? fecha(f.fecha_baja) : <span className="text-humo">Sin fecha</span>) },
            { titulo: 'Costo', derecha: true, celda: (f) => (f.costo ? corto(f.costo) : <Pastilla tono="rayado">Sin costo</Pastilla>) },
          ]} />
        </Ficha>
      </div>
    </div>
  )
}

// ============================================================================ Captura pendiente
export function Captura({ d }) {
  const bloques = [...new Set(d.captura.map((c) => c.bloque))]
  const [bloque, setBloque] = useState('Todos')
  const filas = d.captura.filter((c) => bloque === 'Todos' || c.bloque === bloque)
    .sort((a, b) => (a.prioridad === b.prioridad ? (b.registros_faltantes || 0) - (a.registros_faltantes || 0) : a.prioridad === 'Alta' ? -1 : 1))
  return (
    <div className="space-y-5">
      <p className="max-w-[70ch] text-humo">
        Lo que RH tiene que capturar para que el tablero responda las tres preguntas del negocio. Cada renglón dice
        el campo exacto y la tabla donde vive.
      </p>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Bloque">
        {['Todos', ...bloques].map((b) => (
          <button key={b} role="tab" aria-selected={bloque === b} onClick={() => setBloque(b)}
            className={`rounded-full px-4 py-2 text-[13.5px] font-medium ${bloque === b ? 'bg-tinta text-white' : 'bg-white shadow-ficha hover:bg-panel'}`}>
            {b}
          </button>
        ))}
      </div>
      <Ficha>
        <Tabla filas={filas} columnas={[
          { titulo: 'Qué falta', celda: (f) => <><p className="font-medium">{f.descripcion}</p><p className="text-humo">{f.bloque}</p></> },
          { titulo: 'Tabla y campo', celda: (f) => <><p>{f.tabla}</p><p className="text-humo">{f.campo}</p></> },
          { titulo: 'Registros', derecha: true, celda: (f) => (f.registros_faltantes == null ? 'Todos' : num(f.registros_faltantes)) },
          { titulo: 'Prioridad', celda: (f) => <Pastilla tono={f.prioridad === 'Alta' ? 'carmin' : 'neutro'}>{f.prioridad}</Pastilla> },
        ]} />
      </Ficha>
      <div>
        <h3 className="mb-3 text-[17px] font-semibold tracking-tight">Indicadores listos para activarse</h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {d.bloqueados.map((b) => <Bloqueado key={b.indicador} titulo={b.indicador} {...leer(b)} />)}
        </div>
      </div>
    </div>
  )
}

// ============================================================================ Calidad de datos
const METODOS = {
  M1: 'Normalización de texto', M2: 'Centinelas a nulo', M3: 'Catálogos', M5: 'Llaves reconstruidas',
  M6: 'Habilidades repetidas', M7: 'Familiares fuera de plantilla', M8: 'Coherencia de fechas',
  M10: 'Cierre por baja', M11: 'Montos en $0 a nulo', M12: 'Matriz a formato largo',
}

export function Calidad({ d }) {
  const q = d.calidad
  const total = q.metodos.reduce((s, m) => s + m.correcciones, 0)
  const peores = [...q.columnas].filter((c) => c.centinelas > 0 || c.indice_completitud < 60)
    .sort((a, b) => a.indice_completitud - b.indice_completitud)
  const pasan = q.validaciones.filter((v) => v.resultado === 0).length
  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-3">
        <Ficha oscuro>
          <p className="text-[13.5px] text-white/60">Validaciones en cero</p>
          <p className="mt-1 text-5xl font-semibold tracking-tight">{pasan}<span className="text-white/40"> de {q.validaciones.length}</span></p>
          <p className="mt-1.5 text-[13px] text-white/60">Ningún registro se borró ni se inventó</p>
        </Ficha>
        <Ficha>
          <Cifra grande etiqueta="Correcciones con trazabilidad" valor={num(total)} detalle="Cada una guarda el valor original, el corregido y el método" />
        </Ficha>
        <Ficha>
          <Cifra grande etiqueta="Registros de entrada" valor={num(Object.values(d.meta.filas_fuente).reduce((s, v) => s + v, 0))}
            detalle={`en 7 archivos · ${num(d.plantilla.familiares)} familiares fuera de la plantilla`} />
        </Ficha>
      </div>

      <Ficha>
        <Rotulo nota="La columna parecía llena porque tenía texto como PENDIENTE, fechas de 1990 o montos en $0. Lo rayado es lo que en realidad no era dato.">
          Completitud aparente contra completitud real
        </Rotulo>
        <div className="space-y-3.5">
          {peores.map((c) => (
            <div key={c.tabla + c.columna} className="grid items-center gap-x-4 gap-y-1 sm:grid-cols-[13rem_1fr_13rem]">
              <div>
                <p className="font-medium">{c.columna}</p>
                <p className="text-[12.5px] text-humo">{c.tabla}</p>
              </div>
              <div className="relative h-3 overflow-hidden rounded-full bg-panel">
                <div className="rayado absolute inset-y-0 left-0 rounded-full bg-bruma/50" style={{ width: `${c.completitud_aparente_pct}%` }} />
                <div className="absolute inset-y-0 left-0 rounded-full bg-tinta" style={{ width: `${c.indice_completitud}%` }} />
              </div>
              <p className="whitespace-nowrap text-right text-[13px]">
                <span className="font-semibold">{pct(c.indice_completitud)}</span>
                <span className="text-humo"> real · {pct(c.completitud_aparente_pct)} aparente</span>
              </p>
            </div>
          ))}
        </div>
      </Ficha>

      <div className="grid gap-5 lg:grid-cols-2">
        <Ficha hundido>
          <Rotulo>Correcciones por método</Rotulo>
          <Renglones datos={[...q.metodos].sort((a, b) => b.correcciones - a.correcciones).map((m) => ({
            clave: m.metodo, etiqueta: METODOS[m.metodo] || m.metodo, sub: m.metodo, valor: num(m.correcciones),
            marca: pct((m.correcciones / total) * 100),
          }))} />
        </Ficha>
        <Ficha hundido>
          <Rotulo nota="Consultas que deben regresar cero después del acondicionamiento.">Validaciones</Rotulo>
          <ul className="space-y-1.5">
            {q.validaciones.map((v) => (
              <li key={v.validacion} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-2.5 shadow-ficha">
                <span>{v.validacion}</span>
                <Pastilla tono={v.resultado === 0 ? 'tinta' : 'carmin'}>{v.resultado === 0 ? 'En cero' : num(v.resultado)}</Pastilla>
              </li>
            ))}
          </ul>
        </Ficha>
      </div>
    </div>
  )
}
