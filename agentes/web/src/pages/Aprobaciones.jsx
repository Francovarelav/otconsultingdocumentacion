import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection } from 'firebase/firestore'
import { ArrowRight, Check, CheckCheck, X } from 'lucide-react'
import { api, db, mensajeError } from '../firebase.js'
import { useEnVivo } from '../lib/datos.js'
import { hace, ms, normal } from '../lib/formato.js'
import { useBloqueo } from '../lib/auth.jsx'
import { nombreAgente } from '../lib/agentes.js'
import { Boton, CampoBusqueda, Cargando, Encabezado, ErrorCaja, Falta, Pastilla, Pestanas, Resaltar, Vacio, useAviso, useDebounce } from '../components/ui.jsx'

export default function Aprobaciones() {
  const { datos, cargando, error } = useEnVivo(() => collection(db, 'propuestas'), [])
  const [vista, setVista] = useState('pendiente')
  const [texto, setTexto] = useState('')
  const q = useDebounce(texto)
  const coincide = (p) => {
    const b = normal(q)
    return !b || [p.coleccion, p.id_doc, p.campo, p.motivo, p.valor_actual, p.valor_propuesto, nombreAgente(p.agente)].some((c) => normal(c).includes(b))
  }
  const pendientes = useMemo(() => datos.filter((p) => p.estado === 'pendiente').sort((a, b) => ms(a.creada) - ms(b.creada)), [datos])
  const resueltas = useMemo(() => datos.filter((p) => p.estado !== 'pendiente').sort((a, b) => ms(b.resuelta || b.creada) - ms(a.resuelta || a.creada)), [datos])
  const lista = (vista === 'pendiente' ? pendientes : resueltas).filter(coincide)

  return (
    <div>
      <Encabezado
        titulo="Aprobaciones"
        subtitulo="Los agentes nunca escriben datos: proponen. Al aprobar, el cambio se aplica y queda en log_correcciones con el método M15."
      />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <Pestanas
        valor={vista}
        onCambio={setVista}
        opciones={[
          { valor: 'pendiente', etiqueta: 'Pendientes', n: pendientes.length },
          { valor: 'resueltas', etiqueta: 'Historial', n: resueltas.length },
        ]}
      />
      <CampoBusqueda valor={texto} onCambio={setTexto} placeholder="Campo, ID, motivo o agente" className="w-full sm:w-[280px]" />
      </div>
      {error ? <ErrorCaja error={error}>No se pudieron leer las propuestas.</ErrorCaja> : cargando ? <Cargando lineas={5} /> : lista.length === 0 ? (
        <Vacio
          icono={CheckCheck}
          titulo={q ? 'Sin coincidencias' : vista === 'pendiente' ? 'Nada pendiente de aprobar' : 'Sin propuestas resueltas'}
          texto={vista === 'pendiente' ? 'Cuando un agente proponga corregir un dato, aparecerá aquí con el valor actual y el propuesto.' : 'Las propuestas aprobadas o rechazadas se quedan aquí como historial.'}
        >
          {vista === 'pendiente' && <Link to="/agente/auditor" className="text-[13.5px] font-medium text-rojo">Pedirle una revisión al Auditor de datos</Link>}
        </Vacio>
      ) : (
        <ul className="space-y-3">
          {lista.map((p, i) => <Propuesta key={p.id} p={p} i={i} q={q} />)}
        </ul>
      )}
    </div>
  )
}

function Propuesta({ p, i, q }) {
  const avisar = useAviso()
  const bloqueo = useBloqueo()
  const [ocupado, setOcupado] = useState(null)
  const resolver = async (decision) => {
    setOcupado(decision)
    try {
      await api.resolverPropuesta({ id: p.id, decision })
      avisar(decision === 'aprobar' ? 'Cambio aprobado y aplicado' : 'Propuesta rechazada')
    } catch (e) {
      avisar(mensajeError(e), 'error')
    } finally {
      setOcupado(null)
    }
  }
  const valor = (v) =>
    v == null || v === '' ? <Falta>Vacío</Falta> : <span className="break-words font-medium">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>

  return (
    <li style={{ '--i': i }} className="anim-entrar rounded-3xl border border-linea p-5 transition-colors hover:border-borde">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12.5px] text-humo">
            {p.coleccion} · {p.coleccion === 'colaboradores' ? <Link className="font-medium text-tinta hover:text-rojo" to={`/colaboradores?id=${encodeURIComponent(p.id_doc)}`}><Resaltar texto={p.id_doc} q={q} /></Link> : <span className="font-medium text-tinta"><Resaltar texto={p.id_doc} q={q} /></span>}
          </p>
          <p className="mt-0.5 font-mono text-[14px] font-semibold"><Resaltar texto={p.campo} q={q} /></p>
        </div>
        <div className="flex items-center gap-2">
          <Pastilla tono="neutro">{nombreAgente(p.agente)}</Pastilla>
          {p.estado === 'aprobada' && <Pastilla tono="tinta">Aprobada</Pastilla>}
          {p.estado === 'rechazada' && <Pastilla tono="contorno">Rechazada</Pastilla>}
        </div>
      </div>

      <div className="mt-4 grid items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
        <div className="rounded-2xl bg-panel px-4 py-3">
          <p className="mb-1 text-[11.5px] font-medium uppercase tracking-[0.05em] text-humo">Valor actual</p>
          <p className="text-[14px]">{valor(p.valor_actual)}</p>
        </div>
        <ArrowRight className="mx-auto h-4 w-4 rotate-90 text-humo sm:rotate-0" />
        <div className="rounded-2xl border border-rojo/40 bg-rojo-suave px-4 py-3">
          <p className="mb-1 text-[11.5px] font-medium uppercase tracking-[0.05em] text-rojo-hondo">Propuesto</p>
          <p className="text-[14px]">{valor(p.valor_propuesto)}</p>
        </div>
      </div>

      {p.motivo && <p className="mt-3 text-[13.5px]"><span className="text-humo">Motivo: </span><Resaltar texto={p.motivo} q={q} /></p>}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-humo">
          Propuesta {hace(p.creada)}
          {p.estado !== 'pendiente' && ` · resuelta ${hace(p.resuelta)}${p.resuelta_por ? ` por ${p.resuelta_por}` : ''}`}
        </p>
        {p.estado === 'pendiente' && (
          <div className="flex gap-2">
            <Boton tam="ch" variante="secundario" icono={X} cargando={ocupado === 'rechazar'} disabled={!!ocupado || bloqueo.disabled} title={bloqueo.title} onClick={() => resolver('rechazar')}>Rechazar</Boton>
            <Boton tam="ch" variante="primario" icono={Check} cargando={ocupado === 'aprobar'} disabled={!!ocupado || bloqueo.disabled} title={bloqueo.title} onClick={() => resolver('aprobar')}>Aprobar</Boton>
          </div>
        )}
      </div>
    </li>
  )
}

