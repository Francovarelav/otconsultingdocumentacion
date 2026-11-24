import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { collection, documentId, limit, orderBy, query, where } from 'firebase/firestore'
import { ArrowUpRight, CalendarCheck2, Inbox, MessagesSquare, Play } from 'lucide-react'
import { api, db, mensajeError } from '../firebase.js'
import { useBloqueo, useSesion } from '../lib/auth.jsx'
import MedidorGasto from '../components/Gasto.jsx'
import { fila, filas, useEnVivo, useIndicadores } from '../lib/datos.js'
import { hace, humano, ms, num, pct } from '../lib/formato.js'
import { agente, nombreAgente } from '../lib/agentes.js'
import { AvatarAgente, Base, Boton, Contador, Cargando, Markdown, Pastilla, Pestanas, Vacio, useAviso } from '../components/ui.jsx'

function saludo() {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

export default function Inicio() {
  const { nombre } = useSesion()
  const navegar = useNavigate()
  return (
    <div>
      <header className="mesh rounded-4xl border border-linea px-6 py-8 sm:px-9 sm:py-10">
        <h1 className="text-[32px] font-semibold leading-tight tracking-titulo sm:text-[40px]">
          {saludo()}{nombre ? <>, <span className="texto-grad">{nombre}</span></> : ''}.
        </h1>
        <p className="mt-1.5 text-[15.5px] text-humo">Esto es lo que los agentes revisaron por ti. Empieza por lo que más pesa.</p>
      </header>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Ayuda i={0} titulo="Ayúdame a leer un CV" texto="Sube un PDF y lo comparamos contra la matriz de 71 habilidades." onClick={() => navegar('/cvs')} dibujo={<DibujoCv />} />
        <Ayuda
          i={1}
          titulo="Encuentra quién puede cubrir un proyecto"
          texto="Staffing busca en banca por habilidad y nivel."
          onClick={() => navegar(`/agente/staffing?q=${encodeURIComponent('Encuentra quién en banca puede cubrir un proyecto nuevo de Oracle Cloud. Dime su nivel por habilidad y desde cuándo está en banca.')}`)}
          dibujo={<DibujoEquipo />}
        />
        <Ayuda
          i={2}
          titulo="Explícame por qué se va la gente"
          texto="Bajas, permanencia y qué tanto se puede saber hoy."
          onClick={() => navegar(`/agente/rotacion?q=${encodeURIComponent('Explícame por qué se va la gente y qué tan confiable es el dato.')}`)}
          dibujo={<DibujoRotacion />}
        />
      </div>

      <Rutina />
      <MedidorGasto className="mt-3" />
      <Kpis />
      <Recientes />
    </div>
  )
}

function Ayuda({ titulo, texto, onClick, dibujo, i = 0 }) {
  return (
    <button
      onClick={onClick}
      style={{ '--i': i + 1 }}
      className="anim-entrar mesh-gris group relative flex h-[200px] flex-col overflow-hidden rounded-3xl border border-linea p-6 text-left transition-colors hover:border-[#FFB59A]"
    >
      <span className="relative z-10 max-w-[13ch] text-[21px] font-semibold leading-[1.15] tracking-apretado">{titulo}</span>
      <span className="relative z-10 mt-auto max-w-[24ch] text-[13px] leading-snug text-humo">{texto}</span>
      <span className="pointer-events-none absolute bottom-0 right-0 top-0 w-[48%]">{dibujo}</span>
      <ArrowUpRight className="absolute right-4 top-4 z-10 h-4 w-4 text-humo transition-colors group-hover:text-rojo" />
    </button>
  )
}

// ------------------------------------------------------------ dibujos suaves en gris
function DibujoCv() {
  return (
    <span className="absolute -bottom-3 right-5 block h-[150px] w-[120px]">
      <span className="absolute left-4 top-0 h-full w-full rotate-6 rounded-xl border border-linea bg-white/70" />
      <span className="absolute inset-0 rounded-xl border border-linea bg-white p-3 shadow-tarjeta">
        <span className="block text-[10px] font-semibold">CV</span>
        <span className="mt-2 block h-1.5 w-4/5 rounded-full bg-linea" />
        <span className="mt-1.5 block h-1.5 w-3/5 rounded-full bg-linea" />
        <span className="mt-4 block h-1.5 w-full rounded-full bg-linea" />
        <span className="mt-1.5 block h-1.5 w-5/6 rounded-full bg-linea" />
        <span className="mt-1.5 block h-1.5 w-2/3 rounded-full bg-linea" />
      </span>
      <span className="grad-ot absolute -left-3 top-8 grid h-7 w-7 place-items-center rounded-lg text-[10px] font-bold text-white shadow-tarjeta">IA</span>
    </span>
  )
}
function DibujoEquipo() {
  const celdas = [0, 0, 1, 0, 0, 0, 0, 0, 2]
  return (
    <span className="absolute bottom-5 right-5 grid grid-cols-3 gap-2">
      {celdas.map((c, i) => (
        <span key={i} className={`grid h-9 w-9 place-items-center rounded-full ${c === 1 ? 'grad-ot' : c === 2 ? 'bg-tinta' : 'border border-linea bg-white'}`}>
          <span className={`h-3 w-3 rounded-full ${c ? 'bg-white/80' : 'bg-linea'}`} />
        </span>
      ))}
    </span>
  )
}
function DibujoRotacion() {
  const alturas = [78, 64, 70, 48, 40, 26]
  return (
    <span className="absolute bottom-5 right-5 flex h-[110px] items-end gap-1.5">
      {alturas.map((h, i) => (
        <span key={i} className={`w-3.5 rounded-md ${i === 3 ? 'grad-ot-v' : 'border border-linea bg-white'}`} style={{ height: `${h}%` }} />
      ))}
    </span>
  )
}

// ------------------------------------------------------------ rutina del día
function Rutina() {
  const avisar = useAviso()
  const bloqueo = useBloqueo()
  const [corriendo, setCorriendo] = useState(false)
  const [resultado, setResultado] = useState(null)
  const ultima = useEnVivo(() => query(collection(db, 'rutinas'), orderBy(documentId(), 'desc'), limit(1)), [])
  const r = ultima.datos[0]

  const ejecutar = async () => {
    setCorriendo(true)
    try {
      const res = await api.ejecutarRutina()
      setResultado(res)
      avisar(`Rutina lista: ${num(res?.creadas ?? 0)} tareas nuevas`)
    } catch (e) {
      avisar(mensajeError(e), 'error')
    } finally {
      setCorriendo(false)
    }
  }

  const resumen = resultado?.resumen || r?.resumen
  const creadas = resultado?.creadas ?? r?.creadas
  const total = resultado?.total ?? r?.total

  return (
    <section style={{ '--i': 4 }} className="anim-entrar relative mt-3 flex flex-col gap-5 overflow-hidden rounded-3xl border border-linea bg-white p-5 pl-6 sm:flex-row sm:p-6 sm:pl-7">
      <span className="grad-ot-v absolute inset-y-0 left-0 w-1.5" aria-hidden />
      <div className="grad-ot relative grid h-[72px] w-[72px] shrink-0 place-items-center rounded-2xl text-white">
        <CalendarCheck2 className="h-7 w-7" strokeWidth={1.6} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2.5 text-[19px] font-semibold tracking-apretado">
              Rutina del día
              <span className="pulso h-2 w-2 rounded-full bg-rojo" aria-hidden />
            </h2>
            <p className="mt-0.5 text-[13px] text-humo">
              {r ? `Última corrida: ${r.id}${r.ejecutada || r.creada ? ` · ${hace(r.ejecutada || r.creada)}` : ''}` : 'Se ejecuta sola a las 7:00 (hora de Monterrey).'}
              {creadas != null && ` · ${num(creadas)} tareas nuevas`}
              {total != null && ` · ${num(total)} abiertas`}
            </p>
            {r?.por_prioridad && !resultado && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {['alta', 'media', 'baja'].filter((k) => r.por_prioridad[k]).map((k) => (
                  <Pastilla key={k} tono={k === 'alta' ? 'suave' : 'neutro'}>{num(r.por_prioridad[k])} prioridad {k}</Pastilla>
                ))}
              </div>
            )}
          </div>
          <Boton variante="primario" icono={Play} cargando={corriendo} onClick={ejecutar} {...bloqueo}>
            {corriendo ? 'Revisando reglas…' : 'Ejecutar rutina ahora'}
          </Boton>
        </div>
        <div className="mt-3">
          {ultima.cargando ? (
            <Cargando lineas={2} />
          ) : resumen ? (
            <div className="max-h-[220px] overflow-y-auto pr-2 scroll-fino">
              <Markdown>{resumen}</Markdown>
            </div>
          ) : (
            <p className="text-[14px] text-humo">Todavía no hay resumen. Ejecuta la rutina para que el agente revise las reglas y te deje la bandeja lista.</p>
          )}
        </div>
      </div>
    </section>
  )
}

// ------------------------------------------------------------ KPIs
const VISTAS = ['v_utilizacion', 'v_rotacion_anual', 'v_expediente_resumen', 'v_activos_resumen', 'v_captura_pendiente']

function Kpis() {
  const { datos, cargando, error } = useIndicadores(VISTAS)
  const u = fila(datos.v_utilizacion)
  const r = fila(datos.v_rotacion_anual)
  const ex = fila(datos.v_expediente_resumen)
  const ac = fila(datos.v_activos_resumen)
  const causa = filas(datos.v_captura_pendiente).find((f) => f.campo === 'id_causa_baja')

  return (
    <section className="mt-10">
      <div className="mb-4 flex items-end justify-between">
        <h2 className="text-[19px] font-semibold tracking-apretado">La plantilla hoy</h2>
        <Link to="/indicadores" className="text-[13px] font-medium text-humo hover:text-tinta">Ver indicadores</Link>
      </div>
      {cargando ? (
        <Cargando lineas={3} />
      ) : error ? (
        <Vacio titulo="Los indicadores aún no están cargados" texto="Falta correr la carga de otc_rh.db a Firestore (colección indicadores)." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Kpi i={0} etiqueta="Activos" n={u?.plantilla_activa} formato={num} detalle={r ? `${num(r.bajas_totales)} bajas registradas` : null} />
          <Kpi i={1} etiqueta="En banca" n={u?.pct_en_banca} formato={pct} resaltar detalle={`${num(u?.en_banca)} personas sin asignación vigente`} base={u && <Base n={u.plantilla_activa} de={u.plantilla_activa} que="activos" />} />
          <Kpi i={2} etiqueta="Rotación 12 meses" n={r?.rotacion_anual_pct} formato={pct} detalle="Solo bajas con fecha" base={r && <Base n={r.bajas_con_fecha} de={r.bajas_totales} que="bajas con fecha" />} />
          <Kpi i={3} etiqueta="Bajas sin causa" n={causa?.registros_faltantes} formato={num} resaltar detalle="La causa de baja no se captura todavía" base={r && causa && <Base n={Math.max(r.bajas_totales - causa.registros_faltantes, 0)} de={r.bajas_totales} que="bajas con causa" />} />
          <Kpi i={4} etiqueta="Expediente completo" n={ex?.expedientes_completos} formato={num} de={ex?.plantilla_activa} detalle={ex ? `Promedio de expediente ${pct(ex.pct_expediente_promedio)}` : null} />
          <Kpi i={5} etiqueta="Equipo por recuperar" n={ac?.pendientes_recuperar} formato={num} detalle={ac ? `Equipos de bajas · ${num(ac.pendientes_con_costo)} con costo conocido` : null} base={ac && <Base n={ac.pendientes_con_costo} de={ac.pendientes_recuperar} que="con costo" />} />
        </div>
      )}
    </section>
  )
}

function Kpi({ etiqueta, n, formato, de, detalle, base, resaltar, i = 0 }) {
  return (
    <div style={{ '--i': i }} className="anim-entrar relative overflow-hidden rounded-3xl border border-linea bg-white p-5 pt-6 transition-colors hover:border-borde">
      <span className={`absolute inset-x-0 top-0 h-[3px] ${resaltar ? 'grad-ot-h' : 'bg-linea'}`} aria-hidden />
      <p className="text-[13px] font-medium text-humo">{etiqueta}</p>
      <p className={`mt-2 text-[38px] font-semibold leading-none tracking-titulo tabular ${resaltar ? 'texto-grad' : ''}`}>
        {n == null ? '—' : <Contador valor={n} formato={formato} />}
        {de != null && <span className="ml-1.5 text-[18px] font-medium tracking-apretado text-humo">de {num(de)}</span>}
      </p>
      {detalle && <p className="mt-2.5 text-[12.5px] text-humo">{detalle}</p>}
      {base && <div className="mt-2.5">{base}</div>}
    </div>
  )
}

// ------------------------------------------------------------ recientes
function Recientes() {
  const { usuario } = useSesion()
  const [pestana, setPestana] = useState('tareas')
  const tareas = useEnVivo(() => query(collection(db, 'tareas'), orderBy('actualizada', 'desc'), limit(8)), [])
  const convs = useEnVivo(() => query(collection(db, 'conversaciones'), where('uid', '==', usuario.uid)), [usuario.uid])
  const conversaciones = [...convs.datos].sort((a, b) => ms(b.actualizada) - ms(a.actualizada)).slice(0, 8)

  return (
    <section className="mt-10 border-t border-linea pt-8">
      <Pestanas
        valor={pestana}
        onCambio={setPestana}
        opciones={[
          { valor: 'tareas', etiqueta: 'Tareas recientes' },
          { valor: 'conversaciones', etiqueta: 'Conversaciones recientes' },
        ]}
      />
      <div className="mt-5">
        {pestana === 'tareas' ? (
          tareas.cargando ? <Cargando /> : tareas.datos.length === 0 ? (
            <Vacio icono={Inbox} titulo="Sin tareas todavía" texto="Cuando corra la rutina, aquí aparecerá lo que hay que atender." />
          ) : (
            <ul className="grid gap-2 md:grid-cols-2">
              {tareas.datos.map((t, i) => (
                <li key={t.id} style={{ '--i': i }} className="anim-entrar">
                  <Link to="/bandeja" className="flex h-full items-start gap-3 rounded-2xl border border-linea p-4 transition-colors hover:border-borde hover:bg-panel/60">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${t.prioridad === 'alta' ? 'bg-rojo' : t.prioridad === 'media' ? 'bg-tinta' : 'bg-gris'}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{t.titulo || humano(t.tipo)}</span>
                      <span className="mt-0.5 block text-[12.5px] text-humo">
                        {humano(t.tipo)}{t.regla != null && ` · Regla ${t.regla}`} · {hace(t.actualizada || t.creada)}
                      </span>
                    </span>
                    <Pastilla tono={t.estado === 'abierta' ? 'contorno' : 'neutro'}>{humano(t.estado)}</Pastilla>
                  </Link>
                </li>
              ))}
            </ul>
          )
        ) : convs.cargando ? <Cargando /> : conversaciones.length === 0 ? (
          <Vacio icono={MessagesSquare} titulo="Aún no platicas con ningún agente" texto="Elige un agente en la barra lateral o usa una de las tarjetas de arriba." />
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {conversaciones.map((c, i) => {
              return (
                <li key={c.id} style={{ '--i': i }} className="anim-entrar">
                  <Link to={`/agente/${c.agente}?c=${c.id}`} className="flex items-start gap-3 rounded-2xl border border-linea p-4 transition-colors hover:border-borde hover:bg-panel/60">
                    <AvatarAgente ag={agente(c.agente)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{c.titulo || 'Conversación'}</span>
                      <span className="mt-0.5 block text-[12.5px] text-humo">{nombreAgente(c.agente)} · {hace(c.actualizada)}</span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
