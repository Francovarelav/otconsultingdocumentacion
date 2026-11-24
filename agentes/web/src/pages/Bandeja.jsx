import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { collection } from 'firebase/firestore'
import { Bot, Check, ChevronDown, Inbox, X } from 'lucide-react'
import { api, db, mensajeError } from '../firebase.js'
import { useEnVivo } from '../lib/datos.js'
import { hace, humano, ms, normal, num } from '../lib/formato.js'
import { useBloqueo } from '../lib/auth.jsx'
import { agenteParaTarea, nombreAgente } from '../lib/agentes.js'
import { Boton, CampoBusqueda, Cargando, Encabezado, ErrorCaja, Pastilla, Resaltar, Selector, Vacio, useAviso, useDebounce } from '../components/ui.jsx'

// Nombres legibles para los tipos que crea la rutina (si llega otro, se muestra humanizado).
const TIPOS = {
  causa_baja: 'Bajas sin causa',
  fecha_baja: 'Bajas sin fecha',
  estatus: 'Estatus por confirmar',
  datos_basicos: 'Activos con datos básicos incompletos',
  banca: 'Activos en banca',
  sobreasignado: 'Sobreasignados',
  asignacion_vence: 'Asignaciones por vencer',
  equipo_recuperar: 'Equipo por recuperar',
  matriz: 'Activos sin matriz de habilidades',
  expediente: 'Expedientes incompletos',
  captura: 'Captura pendiente (desbloquea indicadores)',
  falta: 'Faltas por justificar',
  sin_salida: 'Salidas sin registrar',
  vacaciones_pendiente: 'Vacaciones por resolver',
}
const nombreTipo = (t) => TIPOS[t] || humano(t) || 'Otras'
const ORDEN_PRIORIDAD = { alta: 0, media: 1, baja: 2 }

export default function Bandeja() {
  const { datos, cargando, error } = useEnVivo(() => collection(db, 'tareas'), [])
  const [params] = useSearchParams()
  const [texto, setTexto] = useState(() => params.get('q') || '')
  const q = useDebounce(texto)
  const [estado, setEstado] = useState(() => params.get('estado') || 'abierta')
  useEffect(() => {
    if (params.get('q')) setTexto(params.get('q'))
    if (params.get('estado')) setEstado(params.get('estado'))
  }, [params])
  const [prioridad, setPrioridad] = useState('todas')
  const [origen, setOrigen] = useState('todos')

  const grupos = useMemo(() => {
    const lista = datos
      .filter((t) => estado === 'todas' || t.estado === estado)
      .filter((t) => prioridad === 'todas' || t.prioridad === prioridad)
      .filter((t) => origen === 'todos' || t.origen === origen)
      .filter((t) => {
        const b = normal(q)
        return !b || [t.titulo, t.detalle, t.id_colaborador, t.tipo, nombreTipo(t.tipo)].some((c) => normal(c).includes(b))
      })
    const m = new Map()
    for (const t of lista) {
      const k = t.tipo || 'otro'
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(t)
    }
    const res = [...m.entries()].map(([tipo, tareas]) => ({
      tipo,
      tareas: tareas.sort((a, b) => (ORDEN_PRIORIDAD[a.prioridad] ?? 3) - (ORDEN_PRIORIDAD[b.prioridad] ?? 3) || ms(b.actualizada) - ms(a.actualizada)),
      altas: tareas.filter((t) => t.prioridad === 'alta').length,
    }))
    return res.sort((a, b) => b.altas - a.altas || b.tareas.length - a.tareas.length)
  }, [datos, estado, prioridad, origen, q])

  const total = grupos.reduce((s, g) => s + g.tareas.length, 0)
  const abiertas = datos.filter((t) => t.estado === 'abierta').length

  return (
    <div>
      <Encabezado titulo="Bandeja" subtitulo="Lo que la rutina diaria y los agentes encontraron al revisar las 20 reglas. Cada tarea dice qué regla incumple.">
        <Pastilla tono="tinta" className="!text-[13px]">{num(abiertas)} abiertas</Pastilla>
      </Encabezado>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <CampoBusqueda valor={texto} onCambio={setTexto} placeholder="Buscar tarea, persona o ID" className="w-full sm:w-[260px]" />
        <Selector valor={estado} onCambio={setEstado} opciones={[{ valor: 'abierta', etiqueta: 'Abiertas' }, { valor: 'hecha', etiqueta: 'Hechas' }, { valor: 'descartada', etiqueta: 'Descartadas' }, { valor: 'todas', etiqueta: 'Todos los estados' }]} />
        <Selector valor={prioridad} onCambio={setPrioridad} opciones={[{ valor: 'todas', etiqueta: 'Todas las prioridades' }, { valor: 'alta', etiqueta: 'Prioridad alta' }, { valor: 'media', etiqueta: 'Prioridad media' }, { valor: 'baja', etiqueta: 'Prioridad baja' }]} />
        <Selector valor={origen} onCambio={setOrigen} opciones={[{ valor: 'todos', etiqueta: 'Rutina y agentes' }, { valor: 'rutina', etiqueta: 'De la rutina' }, { valor: 'agente', etiqueta: 'De un agente' }]} />
        <span className="ml-1 text-[13px] text-humo">{num(total)} tareas</span>
      </div>

      {error ? <ErrorCaja error={error}>No se pudo leer la bandeja de tareas.</ErrorCaja> : cargando ? <Cargando lineas={6} /> : grupos.length === 0 ? (
        <Vacio icono={Inbox} titulo={estado === 'abierta' ? 'Bandeja al día' : 'Sin tareas con estos filtros'} texto={datos.length === 0 ? 'Todavía no corre la rutina. Ejecútala desde Inicio para llenar la bandeja.' : 'Cambia los filtros para ver otras tareas.'}>
          {datos.length === 0 && <Link to="/" className="text-[13.5px] font-medium text-rojo">Ir a Inicio</Link>}
        </Vacio>
      ) : (
        <div className="space-y-3">
          {grupos.map((g, i) => <Grupo key={g.tipo} {...g} i={i} q={q} />)}
        </div>
      )}
    </div>
  )
}

function Grupo({ tipo, tareas, altas, i, q }) {
  const [abierto, setAbierto] = useState(tareas.length <= 8 || altas > 0 || !!q)
  const [limite, setLimite] = useState(12)
  return (
    <section style={{ '--i': i }} className="anim-entrar rounded-3xl border border-linea transition-colors hover:border-borde">
      <button onClick={() => setAbierto((a) => !a)} aria-expanded={abierto} className="flex w-full items-center gap-3 px-5 py-4 text-left">
        <span className="min-w-0 flex-1">
          <span className="text-[16px] font-semibold tracking-apretado">{nombreTipo(tipo)}</span>
          <span className="ml-2 text-[13px] text-humo tabular">{num(tareas.length)}</span>
        </span>
        {altas > 0 && <Pastilla tono="rojo">{num(altas)} alta{altas === 1 ? '' : 's'}</Pastilla>}
        <ChevronDown className={`h-4 w-4 text-humo transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>
      {abierto && (
        <ul className="divide-y divide-linea border-t border-linea">
          {tareas.slice(0, limite).map((t, j) => <Tarea key={t.id} t={t} i={j} q={q} />)}
          {tareas.length > limite && (
            <li className="px-5 py-3">
              <button onClick={() => setLimite((l) => l + 20)} className="text-[13px] font-medium text-humo hover:text-tinta">Ver {Math.min(20, tareas.length - limite)} más</button>
            </li>
          )}
        </ul>
      )}
    </section>
  )
}

function Tarea({ t, i, q }) {
  const navegar = useNavigate()
  const avisar = useAviso()
  const bloqueo = useBloqueo()
  const [ocupado, setOcupado] = useState(null)
  const ag = agenteParaTarea(t)

  const cambiar = async (estado) => {
    setOcupado(estado)
    try {
      await api.actualizarTarea({ id: t.id, estado })
      avisar(estado === 'hecha' ? 'Tarea marcada como hecha' : estado === 'abierta' ? 'Tarea reabierta' : 'Tarea descartada')
    } catch (e) {
      avisar(mensajeError(e), 'error')
    } finally {
      setOcupado(null)
    }
  }

  const resolver = () => {
    const q = `Ayúdame a resolver esta tarea de la bandeja (${t.id}): «${t.titulo}». ${t.detalle || ''} ${t.regla != null ? `Regla ${t.regla}.` : ''} ${t.id_colaborador ? `Colaborador ${t.id_colaborador}.` : ''} Sigue el SOP que corresponda y, si hay que corregir un dato, propón el cambio para aprobación.`
    navegar(`/agente/${ag}?q=${encodeURIComponent(q.replace(/\s+/g, ' ').trim())}`)
  }

  return (
    <li style={{ '--i': i }} className="anim-entrar flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-panel/40 sm:flex-row sm:items-start">
      <span className={`mt-1.5 hidden h-2 w-2 shrink-0 rounded-full sm:block ${t.prioridad === 'alta' ? 'bg-rojo' : t.prioridad === 'media' ? 'bg-tinta' : 'bg-gris'}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium"><Resaltar texto={t.titulo || nombreTipo(t.tipo)} q={q} /></p>
        {t.detalle && <p className="mt-0.5 text-[13px] text-humo"><Resaltar texto={t.detalle} q={q} /></p>}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
          <Pastilla tono={t.prioridad === 'alta' ? 'suave' : 'neutro'}>Prioridad {t.prioridad || '—'}</Pastilla>
          {t.regla != null && <Pastilla tono="contorno">Regla {t.regla}</Pastilla>}
          {t.id_colaborador && <Link to={`/colaboradores?id=${encodeURIComponent(t.id_colaborador)}`} className="rounded-full border border-borde px-2.5 py-0.5 font-medium hover:bg-panel">{t.id_colaborador}</Link>}
          <span className="text-humo">{t.origen === 'agente' ? 'Creada por un agente' : 'Rutina'} · {hace(t.actualizada || t.creada)}</span>
          {t.estado !== 'abierta' && <Pastilla tono="neutro">{humano(t.estado)}</Pastilla>}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 sm:justify-end">
        {t.estado === 'abierta' ? (
          <>
            <Boton tam="ch" variante="tinta" icono={Bot} onClick={resolver} title={`Abre el chat de ${nombreAgente(ag)}`}>Que el agente lo resuelva</Boton>
            <Boton tam="ch" icono={Check} cargando={ocupado === 'hecha'} disabled={!!ocupado || bloqueo.disabled} title={bloqueo.title} onClick={() => cambiar('hecha')}>Hecha</Boton>
            <Boton tam="ch" variante="fantasma" icono={X} cargando={ocupado === 'descartada'} disabled={!!ocupado || bloqueo.disabled} title={bloqueo.title} onClick={() => cambiar('descartada')}>Descartar</Boton>
          </>
        ) : (
          <Boton tam="ch" cargando={ocupado === 'abierta'} {...bloqueo} onClick={() => cambiar('abierta')}>Reabrir</Boton>
        )}
      </div>
    </li>
  )
}
