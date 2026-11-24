import React, { useMemo, useState } from 'react'
import { Lock } from 'lucide-react'
import { fila, filas, useColeccion, useIndicadores } from '../lib/datos.js'
import { corto, fecha, mesCorto, normal, num, pct } from '../lib/formato.js'
import {
  Avance, Barras, Base, CampoBusqueda, Cargando, Cifra, Resaltar, useDebounce, Columnas, Encabezado, Falta, Pastilla, Rotulo, Tabla, Tarjeta, Vacio,
} from '../components/ui.jsx'

const VISTAS = [
  'v_corte', 'v_rotacion_anual', 'v_rotacion_mensual', 'v_cohorte_ingreso', 'v_bajas_por_causa', 'v_antiguedad_activos',
  'v_utilizacion', 'v_banca_por_puesto', 'v_vencimiento_asignacion', 'v_concentracion_cliente', 'v_sobreasignados',
  'v_costo_por_esquema', 'v_proyecto',
  'v_cobertura_matriz', 'v_expertos_por_habilidad', 'v_nivel_por_tecnologia',
  'v_expediente_resumen', 'v_expediente_documento', 'v_activos_resumen', 'v_equipo_pendiente_recuperar', 'v_activos_por_marca',
  'v_captura_pendiente', 'v_indicador_bloqueado',
]

const BLOQUES = [
  { id: 'rotacion', etiqueta: 'Rotación', palabras: 'bajas rotación cohorte permanencia antigüedad causa salida primer año mensual anual' },
  { id: 'utilizacion', etiqueta: 'Utilización y banca', palabras: 'banca asignación utilización puesto vencimiento cliente concentración sobreasignados proyectos' },
  { id: 'costo', etiqueta: 'Costo', palabras: 'costo nómina sueldo esquema proyecto margen dinero banca' },
  { id: 'habilidades', etiqueta: 'Habilidades', palabras: 'habilidades matriz expertos persona clave tecnología nivel evaluación oracle ebs cloud' },
  { id: 'expediente', etiqueta: 'Expediente y activos', palabras: 'expediente documentos contrato regla 5 equipo activos recuperar marca costo laptop' },
  { id: 'calidad', etiqueta: 'Calidad de datos', palabras: 'calidad completitud captura pendiente centinelas columnas faltante' },
  { id: 'bloqueados', etiqueta: 'Bloqueados', palabras: 'bloqueados indicador causa reemplazo horas facturables tarifas margen certificaciones vencimiento fecha evaluación' },
]
const COMPONENTES = { rotacion: Rotacion, utilizacion: Utilizacion, costo: Costo, habilidades: Habilidades, expediente: Expediente, calidad: Calidad, bloqueados: Bloqueados }

export default function Indicadores() {
  const { datos: d, cargando, error } = useIndicadores(VISTAS)
  const corte = fila(d.v_corte)?.corte
  const [texto, setTexto] = useState('')
  const q = useDebounce(texto)
  const visibles = BLOQUES.filter((b) => !normal(q) || normal(`${b.etiqueta} ${b.palabras}`).includes(normal(q)))

  return (
    <div>
      <Encabezado
        titulo="Indicadores"
        subtitulo={`Vistas del pipeline (otc_rh.db)${corte ? ` con corte al ${fecha(corte)}` : ''}. Cada cifra dice sobre cuántos registros confiables se calculó.`}
      />
      <div className="mb-8 flex flex-wrap items-center gap-2">
        <CampoBusqueda valor={texto} onCambio={setTexto} placeholder="Buscar indicador (banca, sueldo, expertos…)" className="w-full sm:w-[300px]" />
        <nav className="flex flex-wrap gap-1.5" aria-label="Bloques de indicadores">
          {visibles.map((b) => (
            <a key={b.id} href={`#${b.id}`} className={`rounded-full border border-linea px-3.5 py-1.5 text-[13px] font-medium transition-colors hover:border-borde hover:bg-panel ${b.id === 'bloqueados' ? 'rayado bg-panel' : ''}`}>
              <Resaltar texto={b.etiqueta} q={q} />
            </a>
          ))}
        </nav>
      </div>

      {cargando ? (
        <Cargando lineas={8} />
      ) : error ? (
        <Vacio titulo="Los indicadores aún no están cargados" texto="La colección indicadores se llena con el script de carga desde las vistas v_* de otc_rh.db." />
      ) : (
        <div className="space-y-14">
          {visibles.length === 0 && <Vacio titulo="Ningún bloque coincide" texto={`No hay indicadores relacionados con «${texto}».`} />}
          {visibles.map((b) => {
            const C = COMPONENTES[b.id]
            return <C key={b.id} d={d} />
          })}
        </div>
      )}
    </div>
  )
}

function Seccion({ id, titulo, nota, children }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="text-[22px] font-semibold tracking-titulo">{titulo}</h2>
      {nota && <p className="mt-1 max-w-[72ch] text-[14px] text-humo">{nota}</p>}
      <div className="mt-5 space-y-3">{children}</div>
    </section>
  )
}

// ------------------------------------------------------------ rotación
function Rotacion({ d }) {
  const r = fila(d.v_rotacion_anual)
  const mensual = filas(d.v_rotacion_mensual)
  const cohortes = filas(d.v_cohorte_ingreso).filter((c) => c.anio_ingreso >= 2018)
  const causas = filas(d.v_bajas_por_causa)
  return (
    <Seccion id="rotacion" titulo="Rotación" nota="¿Por qué se va la gente y cuánto cuesta? Hoy se puede medir cuánta gente se va, no por qué.">
      <div className="grid gap-3 md:grid-cols-3">
        <Tarjeta className="p-5">
          <Cifra etiqueta="Rotación 12 meses" valor={pct(r?.rotacion_anual_pct)} resaltar base={r && <Base n={r.bajas_con_fecha} de={r.bajas_totales} que="bajas con fecha" />} detalle={r && `${num(r.bajas_12m_con_fecha)} bajas sobre plantilla promedio de ${num(r.plantilla_promedio_12m)}`} />
        </Tarjeta>
        <Tarjeta className="p-5">
          <Cifra etiqueta="Bajas registradas" valor={num(r?.bajas_totales)} detalle={r && `${num(r.bajas_sin_fecha)} sin fecha de baja`} />
        </Tarjeta>
        <Tarjeta className="rayado p-5" hundida>
          <Cifra etiqueta="Bajas con causa" valor={causas.length ? num(causas.reduce((s, c) => s + (c.bajas || 0), 0)) : '0'} detalle="La causa de baja no existe en el sistema todavía." />
        </Tarjeta>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Tarjeta className="p-5">
          <Rotulo nota="Bajas con fecha entre el promedio de activos del mes.">Rotación mensual</Rotulo>
          <Columnas datos={mensual.map((m) => ({ etiqueta: mesCorto(m.mes), valor: m.rotacion_mensual_pct, resaltar: m.rotacion_mensual_pct === Math.max(...mensual.map((x) => x.rotacion_mensual_pct || 0)) }))} formato={(v) => `${Number(v).toFixed(1)}`} />
        </Tarjeta>
        <Tarjeta className="p-5">
          <Rotulo nota="De cada generación de ingreso, cuántos ya salieron.">Cohortes desde 2018</Rotulo>
          <Tabla
            minimo={420}
            filas={cohortes}
            columnas={[
              { titulo: 'Año', celda: (c) => c.anio_ingreso },
              { titulo: 'Ingresos', derecha: true, celda: (c) => num(c.ingresos) },
              { titulo: 'Bajas', derecha: true, celda: (c) => num(c.bajas) },
              { titulo: '% baja', derecha: true, celda: (c) => <span className={c.pct_baja >= 40 ? 'font-semibold text-rojo' : ''}>{pct(c.pct_baja, 0)}</span> },
              { titulo: '1er año', derecha: true, celda: (c) => (c.bajas_sin_dato_de_permanencia ? <Falta titulo={`${c.bajas_sin_dato_de_permanencia} bajas sin dato de permanencia`}>{num(c.bajas_primer_anio ?? 0)}</Falta> : num(c.bajas_primer_anio)) },
            ]}
          />
        </Tarjeta>
      </div>
      <Tarjeta className="p-5">
        <Rotulo nota="Personas activas por antigüedad.">Antigüedad de los activos</Rotulo>
        <Barras datos={filas(d.v_antiguedad_activos).map((a) => ({ etiqueta: a.rango, valor: a.personas }))} />
      </Tarjeta>
    </Seccion>
  )
}

// ------------------------------------------------------------ utilización
function Utilizacion({ d }) {
  const u = fila(d.v_utilizacion)
  const porPuesto = filas(d.v_banca_por_puesto).filter((p) => p.en_banca > 0).sort((a, b) => b.en_banca - a.en_banca).slice(0, 10)
  const vence = filas(d.v_vencimiento_asignacion)
  const clientes = filas(d.v_concentracion_cliente)
  const sobre = filas(d.v_sobreasignados)
  return (
    <Seccion id="utilizacion" titulo="Utilización y banca" nota="¿Cuánta plantilla genera ingreso? Se sabe quién está asignado; sin horas ni tarifas no se sabe cuánto factura.">
      <div className="grid gap-3 md:grid-cols-3">
        <Tarjeta className="p-5"><Cifra etiqueta="En banca" valor={pct(u?.pct_en_banca)} resaltar detalle={u && `${num(u.en_banca)} de ${num(u.plantilla_activa)} activos sin asignación vigente`} /></Tarjeta>
        <Tarjeta className="p-5"><Cifra etiqueta="Con asignación vigente" valor={num(u?.con_asignacion)} detalle="Regla 14: activo sin asignación vigente = en banca" /></Tarjeta>
        <Tarjeta className="p-5"><Cifra etiqueta="Sobreasignados" valor={num(u?.sobreasignados)} detalle={sobre.map((s) => `${s.nombre} (${pct(s.dedicacion_total_pct, 0)})`).join(', ') || 'Dedicación total mayor a 100 %'} /></Tarjeta>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Tarjeta className="p-5">
          <Rotulo nota="Los puestos en PENDIENTE quedaron como «Sin puesto».">Banca por puesto</Rotulo>
          <Barras datos={porPuesto.map((p) => ({ etiqueta: p.puesto || 'Sin puesto', valor: p.en_banca, rayado: !p.puesto, sub: `${num(p.asignados)} asignados de ${num(p.personas)}` }))} />
        </Tarjeta>
        <div className="space-y-3">
          <Tarjeta className="p-5">
            <Rotulo nota="Asignaciones por tiempo restante.">Vencimiento de asignaciones</Rotulo>
            <Barras datos={vence.map((v) => ({ etiqueta: v.vence_en, valor: v.asignaciones, resaltar: /30|60/.test(v.vence_en) }))} />
          </Tarjeta>
          <Tarjeta className="p-5">
            <Rotulo>Concentración por cliente</Rotulo>
            <Barras datos={clientes.map((c) => ({ etiqueta: c.cliente, valor: c.concentracion_cliente_pct, sub: `${num(c.colaboradores)} colaboradores · ${pct(c.pct_de_asignados, 0)} de los asignados` }))} formato={(v) => pct(v)} max={100} />
          </Tarjeta>
        </div>
      </div>
    </Seccion>
  )
}

// ------------------------------------------------------------ costo
function Costo({ d }) {
  const u = fila(d.v_utilizacion)
  const esquemas = filas(d.v_costo_por_esquema).sort((a, b) => (b.costo_nomina_por_esquema || 0) - (a.costo_nomina_por_esquema || 0))
  const proyectos = filas(d.v_proyecto).filter((p) => p.asignaciones_vigentes > 0)
  return (
    <Seccion id="costo" titulo="Costo" nota="Costo mensual = sueldo total integrado. Agregados: los costos individuales solo los ve un administrador.">
      <div className="grid gap-3 md:grid-cols-3">
        <Tarjeta className="p-5"><Cifra etiqueta="Nómina al mes" valor={corto(u?.costo_nomina_mes)} base={u && <Base n={u.personas_con_sueldo} de={u.plantilla_activa} que="activos con sueldo" />} /></Tarjeta>
        <Tarjeta className="p-5"><Cifra etiqueta="Costo de la banca al mes" valor={corto(u?.costo_banca_mes)} resaltar base={u && <Base n={u.banca_con_sueldo} de={u.en_banca} que="en banca con sueldo" />} /></Tarjeta>
        <Tarjeta className="rayado p-5" hundida><Cifra etiqueta="Margen por proyecto" valor="—" detalle="Bloqueado: faltan tarifas y horas facturables." /></Tarjeta>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Tarjeta className="p-5">
          <Rotulo>Costo por esquema de nómina</Rotulo>
          <Tabla
            minimo={420}
            filas={esquemas}
            columnas={[
              { titulo: 'Esquema', celda: (e) => e.esquema_nomina || <Falta /> },
              { titulo: 'Personas', derecha: true, celda: (e) => (e.personas_con_sueldo < e.personas ? <Falta titulo="Hay personas sin sueldo capturado">{num(e.personas_con_sueldo)} de {num(e.personas)}</Falta> : num(e.personas)) },
              { titulo: 'Al mes', derecha: true, celda: (e) => corto(e.costo_nomina_por_esquema) },
              { titulo: 'Promedio', derecha: true, celda: (e) => corto(e.costo_promedio) },
            ]}
          />
        </Tarjeta>
        <Tarjeta className="p-5">
          <Rotulo nota="Costo de personal según dedicación (estimada al 100 % si la asignación es única).">Costo de personal por proyecto</Rotulo>
          <Barras datos={proyectos.map((p) => ({ etiqueta: `${p.proyecto} · ${p.cliente}`, valor: p.costo_personal_proyecto, sub: `${num(p.asignaciones_vigentes)} asignaciones vigentes`, rayado: p.asignaciones_con_costo < p.asignaciones_vigentes }))} formato={corto} />
        </Tarjeta>
      </div>
    </Seccion>
  )
}

// ------------------------------------------------------------ habilidades
function Habilidades({ d }) {
  const c = fila(d.v_cobertura_matriz)
  const expertos = filas(d.v_expertos_por_habilidad)
  const riesgo = expertos.filter((h) => h.riesgo_persona_clave).sort((a, b) => a.expertos_por_habilidad - b.expertos_por_habilidad)
  const [tec, setTec] = useState(null)
  const porTec = useMemo(() => {
    const m = new Map()
    for (const f of filas(d.v_nivel_por_tecnologia)) {
      if (!m.has(f.tecnologia)) m.set(f.tecnologia, { tecnologia: f.tecnologia, total: 0, avanzados: 0 })
      const t = m.get(f.tecnologia)
      t.total += f.evaluaciones || 0
      if (f.nivel_num >= 3) t.avanzados += f.evaluaciones || 0
    }
    return [...m.values()].sort((a, b) => b.total - a.total)
  }, [d.v_nivel_por_tecnologia])
  return (
    <Seccion id="habilidades" titulo="Habilidades" nota="¿Tenemos el talento para lo que viene? La matriz está incompleta y ninguna evaluación tiene fecha.">
      <div className="grid gap-3 md:grid-cols-3">
        <Tarjeta className="p-5"><Cifra etiqueta="Activos con matriz" valor={c ? `${num(c.con_matriz)} de ${num(c.plantilla_activa)}` : '—'} base={c && <Base n={c.con_matriz} de={c.plantilla_activa} que="activos" />} /></Tarjeta>
        <Tarjeta className="p-5"><Cifra etiqueta="Riesgo de persona clave" valor={num(riesgo.length)} resaltar detalle={`de ${num(expertos.length)} habilidades con 1 experto o ninguno`} /></Tarjeta>
        <Tarjeta className="rayado p-5" hundida><Cifra etiqueta="Evaluaciones con fecha" valor={c ? num(c.evaluaciones - c.evaluaciones_sin_fecha) : '—'} detalle={c && `de ${num(c.evaluaciones)} evaluaciones (regla 19)`} /></Tarjeta>
      </div>
      <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr]">
        <Tarjeta className="p-5">
          <Rotulo nota="Experto = nivel Avanzado o Experto (3–4). En rojo las que no tienen a nadie.">Habilidades con riesgo de persona clave</Rotulo>
          <ul className="scroll-fino max-h-[360px] divide-y divide-linea overflow-y-auto">
            {riesgo.map((h) => (
              <li key={h.cod_habilidad} className="flex items-center justify-between gap-3 py-2 text-[13.5px]">
                <span className="min-w-0 truncate">{h.habilidad}<span className="ml-1.5 text-[12px] text-humo">{h.tecnologia}</span></span>
                <Pastilla tono={h.expertos_por_habilidad === 0 ? 'rojo' : 'suave'}>{h.expertos_por_habilidad === 0 ? 'Nadie' : '1 experto'}</Pastilla>
              </li>
            ))}
          </ul>
        </Tarjeta>
        <Tarjeta className="p-5">
          <Rotulo nota="Evaluaciones por tecnología; la parte oscura son niveles 3–4.">Nivel por tecnología</Rotulo>
          <ul className="space-y-3">
            {porTec.map((t) => (
              <li key={t.tecnologia} onMouseEnter={() => setTec(t.tecnologia)} onMouseLeave={() => setTec(null)}>
                <div className="mb-1 flex justify-between text-[13px]">
                  <span>{t.tecnologia || 'Sin tecnología'}</span>
                  <span className="tabular text-humo">{tec === t.tecnologia ? `${num(t.avanzados)} avanzados de ${num(t.total)}` : pct((t.avanzados / (t.total || 1)) * 100, 0)}</span>
                </div>
                <Avance valor={(t.avanzados / (t.total || 1)) * 100} />
              </li>
            ))}
          </ul>
        </Tarjeta>
      </div>
    </Seccion>
  )
}

// ------------------------------------------------------------ expediente y activos
function Expediente({ d }) {
  const e = fila(d.v_expediente_resumen)
  const docs = filas(d.v_expediente_documento).filter((x) => x.obligatorio).sort((a, b) => a.pct_cumplido - b.pct_cumplido)
  const a = fila(d.v_activos_resumen)
  const pendientes = filas(d.v_equipo_pendiente_recuperar)
  return (
    <Seccion id="expediente" titulo="Expediente y activos" nota="Cumplimiento de la regla 5 (puesto, departamento, esquema y sueldo), regla 9 (expediente) y regla 18 (equipo de bajas).">
      <div className="grid gap-3 md:grid-cols-4">
        <Tarjeta className="p-5"><Cifra etiqueta="Expediente completo" valor={e ? `${num(e.expedientes_completos)} de ${num(e.plantilla_activa)}` : '—'} resaltar detalle={e && `Promedio ${pct(e.pct_expediente_promedio)}`} /></Tarjeta>
        <Tarjeta className="p-5"><Cifra etiqueta="Cumplen la regla 5" valor={e ? num(e.cumple_regla_5) : '—'} detalle={e && `${num(e.falta_puesto)} sin puesto · ${num(e.falta_departamento)} sin departamento`} /></Tarjeta>
        <Tarjeta className="p-5"><Cifra etiqueta="Equipos sin costo" valor={a ? `${num(a.sin_costo)} de ${num(a.equipos)}` : '—'} base={a && <Base n={a.con_costo} de={a.equipos} que="con costo" />} /></Tarjeta>
        <Tarjeta className="p-5"><Cifra etiqueta="Por recuperar" valor={num(a?.pendientes_recuperar)} resaltar detalle={a && `${corto(a.valor_equipo_no_recuperado)} conocidos en ${num(a.pendientes_con_costo)} equipos`} /></Tarjeta>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Tarjeta className="p-5">
          <Rotulo nota="Porcentaje de activos con cada documento obligatorio; lo que falta va rayado.">Documentos del expediente</Rotulo>
          <ul className="space-y-2.5">
            {docs.map((x) => (
              <li key={x.documento}>
                <div className="mb-1 flex justify-between text-[13px]">
                  <span>{x.nombre}</span>
                  <span className="tabular text-humo">{num(x.cumplidos)} de {num(x.plantilla_activa)}</span>
                </div>
                <Avance valor={x.pct_cumplido} rayado tono={x.pct_cumplido < 50 ? 'bg-rojo' : 'bg-tinta'} />
              </li>
            ))}
          </ul>
        </Tarjeta>
        <Tarjeta className="p-5">
          <Rotulo nota="Equipos a nombre de personas dadas de baja.">Equipo pendiente de recuperar</Rotulo>
          <Tabla
            minimo={440}
            filas={pendientes}
            vacio="No hay equipo pendiente de recuperar."
            columnas={[
              { titulo: 'Equipo', celda: (p) => <span>{[p.tipo, p.marca].filter(Boolean).join(' · ')}<span className="block text-[12px] text-humo">{p.cod_activo}</span></span> },
              { titulo: 'Persona', celda: (p) => <span>{p.nombre || p.id_colaborador}<span className="block text-[12px] text-humo">Baja {fecha(p.fecha_baja)}</span></span> },
              { titulo: 'Costo', derecha: true, celda: (p) => (p.costo == null ? <Falta>Sin costo</Falta> : corto(p.costo)) },
            ]}
          />
        </Tarjeta>
      </div>
    </Seccion>
  )
}

// ------------------------------------------------------------ calidad de datos
function Calidad({ d }) {
  const calidad = useColeccion('calidad_datos')
  const peores = [...calidad.datos].sort((a, b) => (a.indice_completitud ?? 0) - (b.indice_completitud ?? 0)).slice(0, 14)
  const captura = filas(d.v_captura_pendiente)
  return (
    <Seccion id="calidad" titulo="Calidad de datos" nota="Índice de completitud = celdas válidas / esperadas, después de nulificar centinelas (PENDIENTE, 1990-01-01…).">
      <div className="grid gap-3 lg:grid-cols-2">
        <Tarjeta className="p-5">
          <Rotulo nota="Columnas con menor completitud; el rayado es lo que falta.">Completitud por columna</Rotulo>
          {calidad.cargando ? <Cargando /> : peores.length === 0 ? <p className="text-[13px] text-humo">Sin datos de calidad cargados.</p> : (
            <ul className="space-y-2.5">
              {peores.map((c) => (
                <li key={c.id}>
                  <div className="mb-1 flex justify-between gap-3 text-[13px]">
                    <span className="truncate">{c.tabla} · <span className="font-medium">{c.columna}</span></span>
                    <span className="shrink-0 tabular text-humo">
                      {pct(c.indice_completitud)}
                      {c.completitud_aparente_pct != null && c.completitud_aparente_pct !== c.indice_completitud && <span className="ml-1 text-[11.5px]">(aparente {pct(c.completitud_aparente_pct, 0)})</span>}
                    </span>
                  </div>
                  <Avance valor={c.indice_completitud} rayado tono={c.indice_completitud < 50 ? 'bg-rojo' : 'bg-tinta'} />
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
        <Tarjeta className="p-5">
          <Rotulo nota="Lo que RH tiene que capturar, por prioridad.">Captura pendiente</Rotulo>
          <Tabla
            minimo={420}
            filas={captura}
            columnas={[
              { titulo: 'Qué', celda: (c) => <span>{c.descripcion}<span className="block text-[12px] text-humo">{c.bloque} · {c.tabla}.{c.campo}</span></span> },
              { titulo: 'Faltan', derecha: true, celda: (c) => num(c.registros_faltantes) },
              { titulo: 'Prioridad', celda: (c) => <Pastilla tono={c.prioridad === 'Alta' ? 'rojo' : c.prioridad === 'Media' ? 'tinta' : 'neutro'}>{c.prioridad}</Pastilla> },
            ]}
          />
        </Tarjeta>
      </div>
    </Seccion>
  )
}

// ------------------------------------------------------------ bloqueados
function Bloqueados({ d }) {
  const b = filas(d.v_indicador_bloqueado)
  return (
    <Seccion id="bloqueados" titulo="Indicadores bloqueados" nota="Están programados contra las tablas de extensión (M14). Se activan solos en cuanto RH capture el dato.">
      {b.length === 0 ? <p className="text-[13px] text-humo">No hay indicadores bloqueados.</p> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {b.map((x) => (
            <div key={x.indicador} className="rayado rounded-3xl bg-panel p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="font-mono text-[13px] font-semibold">{x.indicador}</p>
                <Lock className="h-4 w-4 shrink-0 text-humo" />
              </div>
              <p className="mt-2 text-[13.5px]">Se desbloquea al capturar: <span className="font-medium">{String(x.dato_que_falta).toLowerCase()}</span>.</p>
              <p className="mt-3 inline-block rounded-lg bg-white px-2 py-1 text-[12px]">{x.tabla} → {x.campo}</p>
              <p className="mt-2 text-[12px] text-humo">{num(x.registros_capturados)} registros capturados</p>
            </div>
          ))}
        </div>
      )}
    </Seccion>
  )
}
