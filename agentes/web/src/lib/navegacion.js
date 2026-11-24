import {
  BookOpenCheck, BrainCircuit, CalendarDays, ChartColumn, ChartLine, CheckCheck, Clock, FileText, HeartHandshake,
  Home, IdCard, Inbox, Megaphone, ReceiptText, UserCog, Users, Wallet,
} from 'lucide-react'
import { AGENTES } from './agentes.js'

/** Secciones de la barra lateral (y de la búsqueda global) según el rol. */
export function seccionesPara({ rol, esAdmin, idColaborador }) {
  if (rol === 'colaborador') {
    return [
      {
        titulo: 'Mi espacio',
        items: [
          { a: '/mi', etiqueta: 'Mi espacio', icono: Home, fin: true },
          { a: '/asistencia', etiqueta: 'Checar', icono: Clock },
          { a: '/vacaciones', etiqueta: 'Mis vacaciones', icono: CalendarDays },
          ...(idColaborador ? [{ a: `/colaboradores/${encodeURIComponent(idColaborador)}`, etiqueta: 'Mi ficha', icono: IdCard }] : []),
          { a: '/mi/recibos', etiqueta: 'Mis recibos', icono: ReceiptText },
        ],
      },
      {
        titulo: 'Personas',
        items: [
          { a: '/encuestas', etiqueta: 'Encuestas abiertas', icono: Megaphone },
          { a: '/cultura', etiqueta: 'Cultura', icono: HeartHandshake },
        ],
      },
    ]
  }
  const s = [
    {
      titulo: 'General',
      items: [
        { a: '/', etiqueta: 'Inicio', icono: Home, fin: true },
        { a: '/colaboradores', etiqueta: 'Colaboradores', icono: Users },
        { a: '/analitica', etiqueta: 'Analítica', icono: ChartLine },
        { a: '/indicadores', etiqueta: 'Indicadores', icono: ChartColumn },
      ],
    },
    {
      titulo: 'Operación',
      items: [
        { a: '/asistencia', etiqueta: 'Asistencia', icono: Clock },
        { a: '/vacaciones', etiqueta: 'Vacaciones', icono: CalendarDays, contador: 'vacaciones' },
        ...(esAdmin ? [{ a: '/nomina', etiqueta: 'Nómina', icono: Wallet }] : []),
        { a: '/bandeja', etiqueta: 'Bandeja', icono: Inbox, contador: 'tareas' },
        { a: '/aprobaciones', etiqueta: 'Aprobaciones', icono: CheckCheck, contador: 'propuestas' },
      ],
    },
    {
      titulo: 'Personas',
      items: [
        { a: '/encuestas', etiqueta: 'Encuestas', icono: Megaphone },
        { a: '/cultura', etiqueta: 'Cultura', icono: HeartHandshake },
      ],
    },
    {
      titulo: 'Agentes IA',
      items: AGENTES.map((ag) => ({ a: `/agente/${ag.id}`, etiqueta: ag.nombre, icono: ag.icono, ag, insignia: ag.beta ? 'IA' : null })),
    },
    {
      titulo: 'Conocimiento',
      items: [
        { a: '/sops', etiqueta: 'SOPs', icono: BookOpenCheck },
        { a: '/memoria', etiqueta: 'Memoria', icono: BrainCircuit },
        { a: '/cvs', etiqueta: 'Lector de CVs', icono: FileText },
      ],
    },
  ]
  if (esAdmin) s.push({ titulo: 'Administración', items: [{ a: '/usuarios', etiqueta: 'Usuarios y roles', icono: UserCog }] })
  return s
}

