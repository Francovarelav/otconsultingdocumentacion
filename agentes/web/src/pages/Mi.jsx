import React from 'react'
import { Link } from 'react-router-dom'
import { collection, query, where } from 'firebase/firestore'
import { ArrowUpRight, Award, CalendarDays, IdCard, Megaphone, Pin, ReceiptText } from 'lucide-react'
import { db } from '../firebase.js'
import { useSesion } from '../lib/auth.jsx'
import { useDocVivo, useEnVivo } from '../lib/datos.js'
import { hace, ms } from '../lib/formato.js'
import { JORNADA_BASE } from '../lib/fechas.js'
import Checador from '../components/Checador.jsx'
import Saldo from '../components/Saldo.jsx'
import Recibos from '../components/Recibos.jsx'
import { Encabezado, ErrorCaja, Markdown, Pastilla } from '../components/ui.jsx'

function saludo() {
  const h = new Date().getHours()
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
}

/** Inicio del rol colaborador: autoservicio. Con `recibos` muestra solo «Mis recibos». */
export default function Mi({ recibos = false }) {
  const { nombre, idColaborador } = useSesion()
  const jornada = { ...JORNADA_BASE, ...(useDocVivo(['config', 'jornada']).datos || {}) }

  if (!idColaborador) {
    return (
      <div>
        <Encabezado titulo="Mi espacio" />
        <ErrorCaja>Tu usuario no está ligado a un colaborador. Pide a RH que lo configure en Usuarios y roles.</ErrorCaja>
      </div>
    )
  }

  if (recibos) {
    return (
      <div>
        <Encabezado titulo="Mis recibos" subtitulo="Prenómina de control por quincena: lo que se estima con tu asistencia, vacaciones y permisos." />
        <Recibos id={idColaborador} />
      </div>
    )
  }

  return (
    <div>
      <header className="mesh rounded-4xl border border-linea px-6 py-8 sm:px-9">
        <h1 className="text-[32px] font-semibold leading-tight tracking-titulo sm:text-[38px]">
          {saludo()}{nombre ? <>, <span className="texto-grad">{nombre}</span></> : ''}.
        </h1>
        <p className="mt-1.5 text-[15px] text-humo">Tu espacio en OT Consulting: checa, pide vacaciones y revisa lo tuyo.</p>
      </header>

      <div className="mt-4">
        <Checador jornada={jornada} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <section className="rounded-3xl border border-linea p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-[16px] font-semibold tracking-apretado"><CalendarDays className="h-4 w-4 text-rojo" />Mis vacaciones</h2>
            <Link to="/vacaciones" className="inline-flex items-center gap-1 text-[13px] font-medium text-humo hover:text-tinta">Solicitar <ArrowUpRight className="h-3.5 w-3.5" /></Link>
          </div>
          <Saldo id={idColaborador} />
        </section>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <Acceso a={`/colaboradores/${encodeURIComponent(idColaborador)}`} icono={IdCard} titulo="Mi ficha" texto="Tus datos, expediente y reconocimientos." i={0} />
          <Acceso a="/mi/recibos" icono={ReceiptText} titulo="Mis recibos" texto="Prenómina por quincena con tus incidencias." i={1} />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <EncuestasAbiertas />
        <MisReconocimientos id={idColaborador} />
      </div>
      <Comunicados />
    </div>
  )
}

function Acceso({ a, icono: Icono, titulo, texto, i }) {
  return (
    <Link to={a} style={{ '--i': i }} className="anim-entrar group flex items-center gap-4 rounded-3xl border border-linea p-5 transition-colors hover:border-[#FFB59A] hover:bg-[#FFF6F2]">
      <span className="grad-ot grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white"><Icono className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold tracking-apretado">{titulo}</span>
        <span className="block text-[13px] text-humo">{texto}</span>
      </span>
      <ArrowUpRight className="h-4 w-4 text-humo group-hover:text-rojo" />
    </Link>
  )
}

function EncuestasAbiertas() {
  const { datos, cargando } = useEnVivo(() => query(collection(db, 'encuestas'), where('estado', '==', 'abierta')), [])
  return (
    <section className="rounded-3xl border border-linea p-6">
      <h2 className="mb-3 flex items-center gap-2 text-[16px] font-semibold tracking-apretado"><Megaphone className="h-4 w-4 text-rojo" />Encuestas abiertas</h2>
      {cargando ? null : datos.length === 0 ? <p className="text-[13.5px] text-humo">No hay encuestas abiertas. Gracias por responder las anteriores.</p> : (
        <ul className="space-y-2">
          {datos.map((e, i) => (
            <li key={e.id} style={{ '--i': i }} className="anim-entrar">
              <Link to={`/f/${e.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-linea px-4 py-3 transition-colors hover:border-borde hover:bg-panel/60">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{e.titulo}</span>
                  <span className="block text-[12px] text-humo">{e.anonima ? 'Anónima' : 'Con nombre'}{e.cierra && ` · cierra ${e.cierra}`}</span>
                </span>
                <Pastilla tono="rojo">Responder</Pastilla>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function MisReconocimientos({ id }) {
  const { datos } = useEnVivo(() => query(collection(db, 'reconocimientos'), where('para_id_colaborador', '==', id)), [id])
  const lista = [...datos].sort((a, b) => ms(b.creada) - ms(a.creada)).slice(0, 4)
  return (
    <section className="rounded-3xl border border-linea p-6">
      <h2 className="mb-3 flex items-center gap-2 text-[16px] font-semibold tracking-apretado"><Award className="h-4 w-4 text-rojo" />Reconocimientos para ti</h2>
      {lista.length === 0 ? <p className="text-[13.5px] text-humo">Aún no tienes reconocimientos. <Link to="/cultura" className="font-medium text-rojo">Reconoce a alguien</Link>.</p> : (
        <ul className="space-y-2">
          {lista.map((r) => (
            <li key={r.id} className="rounded-2xl bg-panel px-4 py-3 text-[13.5px]">
              <Pastilla tono="suave">{r.valor}</Pastilla>
              <p className="mt-1.5">{r.mensaje}</p>
              <p className="mt-1 text-[12px] text-humo">De {r.de_nombre} · {hace(r.creada)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Comunicados() {
  const { datos } = useEnVivo(() => collection(db, 'comunicados'), [])
  const lista = [...datos].sort((a, b) => Number(!!b.fijado) - Number(!!a.fijado) || ms(b.creada) - ms(a.creada)).slice(0, 3)
  if (!lista.length) return null
  return (
    <section className="mt-4 rounded-3xl border border-linea p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[16px] font-semibold tracking-apretado">Comunicados</h2>
        <Link to="/cultura" className="text-[13px] font-medium text-humo hover:text-tinta">Ver todos</Link>
      </div>
      <ul className="divide-y divide-linea">
        {lista.map((c) => (
          <li key={c.id} className="py-3">
            <p className="flex items-center gap-2 font-medium">{c.fijado && <Pin className="h-3.5 w-3.5 text-rojo" />}{c.titulo}</p>
            <div className="mt-1 line-clamp-3 text-[13.5px] text-humo"><Markdown>{c.cuerpo}</Markdown></div>
            <p className="mt-1 text-[12px] text-humo">{c.autor} · {hace(c.creada)}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
