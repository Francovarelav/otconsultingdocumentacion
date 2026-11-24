import { useEffect, useState } from 'react'
import { collection, doc, getDoc, getDocs, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase.js'

const conId = (s) => ({ id: s.id, ...s.data() })

/**
 * Escucha en tiempo real una consulta. `crear` devuelve la Query (o null para no consultar).
 * Las consultas evitan orderBy combinado con where para no exigir índices compuestos:
 * el orden se aplica en el cliente.
 */
export function useEnVivo(crear, deps) {
  const [estado, setEstado] = useState({ datos: [], cargando: true, error: null })
  useEffect(() => {
    const q = crear()
    if (!q) return setEstado({ datos: [], cargando: false, error: null })
    setEstado((e) => ({ ...e, cargando: true }))
    return onSnapshot(
      q,
      (snap) => setEstado({ datos: snap.docs.map(conId), cargando: false, error: null }),
      (error) => setEstado({ datos: [], cargando: false, error }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return estado
}

/** Escucha un documento. `ruta` = [coleccion, id] o null. */
export function useDocVivo(ruta) {
  const clave = ruta ? ruta.join('/') : ''
  const [estado, setEstado] = useState({ datos: null, cargando: !!ruta, error: null })
  useEffect(() => {
    if (!ruta) return setEstado({ datos: null, cargando: false, error: null })
    setEstado((e) => ({ ...e, cargando: true }))
    return onSnapshot(
      doc(db, ...ruta),
      (s) => setEstado({ datos: s.exists() ? conId(s) : null, cargando: false, error: null }),
      (error) => setEstado({ datos: null, cargando: false, error }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])
  return estado
}

// ------------------------------------------------------------ colecciones de referencia
// Se leen una vez por sesión (son pequeñas: ≤ 107 documentos) y se comparten.
const cache = new Map()

function cargarColeccion(nombre) {
  if (!cache.has(nombre)) {
    const p = getDocs(collection(db, nombre)).then((s) => s.docs.map(conId))
    p.catch(() => cache.delete(nombre))
    cache.set(nombre, p)
  }
  return cache.get(nombre)
}

export function useColeccion(nombre) {
  const [estado, setEstado] = useState({ datos: [], cargando: true, error: null })
  useEffect(() => {
    let vivo = true
    if (!nombre) {
      setEstado({ datos: [], cargando: false, error: null })
      return undefined
    }
    cargarColeccion(nombre).then(
      (datos) => vivo && setEstado({ datos, cargando: false, error: null }),
      (error) => vivo && setEstado({ datos: [], cargando: false, error }),
    )
    return () => { vivo = false }
  }, [nombre])
  return estado
}

// ------------------------------------------------------------ indicadores (vistas v_*)
function cargarIndicador(vista) {
  const k = `indicadores/${vista}`
  if (!cache.has(k)) {
    const p = getDoc(doc(db, 'indicadores', vista)).then((s) => (s.exists() ? s.data() : null))
    p.catch(() => cache.delete(k))
    cache.set(k, p)
  }
  return cache.get(k)
}

/**
 * Devuelve { datos: {v_x: {columnas, filas, total} | null}, cargando, error }.
 */
export function useIndicadores(vistas) {
  const clave = vistas.join(',')
  const [estado, setEstado] = useState({ datos: {}, cargando: true, error: null })
  useEffect(() => {
    let vivo = true
    Promise.all(vistas.map((v) => cargarIndicador(v).catch(() => null))).then((res) => {
      if (!vivo) return
      const datos = Object.fromEntries(vistas.map((v, i) => [v, res[i]]))
      const ninguno = res.every((r) => r == null)
      setEstado({ datos, cargando: false, error: ninguno ? new Error('sin-indicadores') : null })
    })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])
  return estado
}

/** Primera fila de una vista de una sola fila (v_utilizacion, v_rotacion_anual…). */
export const fila = (ind) => ind?.filas?.[0] ?? null
export const filas = (ind) => ind?.filas ?? []
