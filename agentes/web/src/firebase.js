import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import config from './firebase-config.json'
import { iniciarAppCheck } from './appcheck.js'

export const app = initializeApp({
  apiKey: config.apiKey,
  authDomain: config.authDomain,
  projectId: config.projectId,
  storageBucket: config.storageBucket,
  messagingSenderId: config.messagingSenderId,
  appId: config.appId,
})

// App Check antes de cualquier Auth/Firestore/Storage/Functions.
export const appCheck = iniciarAppCheck(app)

export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)
export const functions = getFunctions(app, 'us-central1')

// En local las funciones corren en el emulador; Firestore, Auth y Storage siguen en producción.
if (typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname)) {
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
}

// El cliente SOLO lee Firestore. Toda escritura pasa por estas funciones.
const llamada = (nombre, timeout = 70_000) => {
  const fn = httpsCallable(functions, nombre, { timeout })
  return async (datos) => (await fn(datos)).data
}

export const api = {
  chatAgente: llamada('chatAgente', 300_000), // el loop del agente puede tardar 20–60 s
  leerCv: llamada('leerCv', 300_000),
  resolverPropuesta: llamada('resolverPropuesta'),
  listarUsuarios: llamada('listarUsuarios'),
  guardarUsuario: llamada('guardarUsuario'),
  restablecerAcceso: llamada('restablecerAcceso'),
  // Asistencia, vacaciones y nómina
  checar: llamada('checar'),
  solicitarVacaciones: llamada('solicitarVacaciones'),
  resolverVacaciones: llamada('resolverVacaciones'),
  saldoVacaciones: llamada('saldoVacaciones'),
  calcularPrenomina: llamada('calcularPrenomina', 300_000),
  cerrarPeriodo: llamada('cerrarPeriodo'),
  guardarJornada: llamada('guardarJornada'),
  // Encuestas y cultura
  obtenerFormulario: llamada('obtenerFormulario'),
  responderEncuesta: llamada('responderEncuesta'),
  guardarEncuesta: llamada('guardarEncuesta'),
  cambiarEstadoEncuesta: llamada('cambiarEstadoEncuesta'),
  analizarEncuesta: llamada('analizarEncuesta', 300_000),
  crearReconocimiento: llamada('crearReconocimiento'),
  publicarComunicado: llamada('publicarComunicado'),
  guardarCultura: llamada('guardarCultura'),
  actualizarTarea: llamada('actualizarTarea'),
  ejecutarRutina: llamada('ejecutarRutina', 300_000),
  guardarSop: llamada('guardarSop'),
  guardarMemoria: llamada('guardarMemoria'),
  borrarMemoria: llamada('borrarMemoria'),
}

export const LIMITE_IA = 'Se alcanzó el límite mensual de IA (200 MXN). Pide a un admin que lo revise.'

/** Mensaje legible para un error de Firebase. */
export function mensajeError(e) {
  const c = e?.code || ''
  if (c.includes('resource-exhausted')) return e?.message || LIMITE_IA
  if (c.includes('permission-denied')) return 'No tienes permiso para esta acción.'
  if (c.includes('unauthenticated')) return 'Tu sesión expiró. Vuelve a entrar.'
  if (c.includes('deadline-exceeded')) return 'La operación tardó demasiado. Intenta de nuevo.'
  if (c.includes('unavailable')) return 'Sin conexión con el servidor. Revisa tu red.'
  if (c.includes('not-found')) return 'La función o el registro no existe todavía.'
  if (c.includes('failed-precondition')) return e.message || 'Falta una condición previa en la base de datos.'
  return e?.message || 'Algo salió mal.'
}
