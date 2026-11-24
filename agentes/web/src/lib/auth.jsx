import React, { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../firebase.js'

const Ctx = createContext(null)

/**
 * estado: 'cargando' | 'fuera' | 'sin-acceso' | 'dentro'
 * perfil: documento usuarios/{uid} ({rol, nombre?})
 */
export function SesionProvider({ children }) {
  const [sesion, setSesion] = useState({ estado: 'cargando', usuario: null, perfil: null })

  useEffect(() =>
    onAuthStateChanged(auth, async (usuario) => {
      if (!usuario) return setSesion({ estado: 'fuera', usuario: null, perfil: null })
      try {
        const snap = await getDoc(doc(db, 'usuarios', usuario.uid))
        if (!snap.exists() || !snap.data().rol || snap.data().activo === false) return setSesion({ estado: 'sin-acceso', usuario, perfil: null })
        setSesion({ estado: 'dentro', usuario, perfil: snap.data() })
      } catch {
        setSesion({ estado: 'sin-acceso', usuario, perfil: null })
      }
    }), [])

  const valor = {
    ...sesion,
    rol: sesion.perfil?.rol ?? null,
    esAdmin: sesion.perfil?.rol === 'admin',
    // admin y rh operan (aprueban, marcan tareas, suben CVs); lector solo consulta y chatea.
    puedeOperar: ['admin', 'rh'].includes(sesion.perfil?.rol),
    esColaborador: sesion.perfil?.rol === 'colaborador',
    idColaborador: sesion.perfil?.id_colaborador ?? null,
    nombre: nombreDe(sesion.usuario, sesion.perfil),
    salir: () => signOut(auth),
  }
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

function nombreDe(usuario, perfil) {
  const n = perfil?.nombre || usuario?.displayName
  if (n) return n
  const correo = usuario?.email || ''
  const base = correo.split('@')[0].split(/[._-]/)[0]
  return base ? base[0].toUpperCase() + base.slice(1) : ''
}

export const useSesion = () => useContext(Ctx)

export const ROLES = {
  admin: { nombre: 'Administrador', descripcion: 'Todo: ve sueldos, gestiona usuarios y SOPs.' },
  rh: { nombre: 'Recursos Humanos', descripcion: 'Opera: aprueba propuestas, marca tareas, usa agentes, sube CVs.' },
  lector: { nombre: 'Lector', descripcion: 'Solo consulta y chatea con los agentes.' },
  colaborador: { nombre: 'Colaborador', descripcion: 'Autoservicio: checa, pide vacaciones, ve su ficha y sus recibos.' },
}

/** Props para un botón que el rol lector no puede usar (deshabilitado con explicación). */
export function useBloqueo() {
  const { puedeOperar } = useContext(Ctx)
  return puedeOperar ? {} : { disabled: true, title: 'Tu rol solo permite consultar' }
}
