import React, { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { ArrowRight, Eye, EyeOff, LockKeyhole } from 'lucide-react'
import { auth } from '../firebase.js'
import { useSesion } from '../lib/auth.jsx'
import { Boton, Campo, ErrorCaja, Isotipo, claseEntrada } from '../components/ui.jsx'

const ERRORES = {
  'auth/invalid-credential': 'Correo o contraseña incorrectos.',
  'auth/wrong-password': 'Correo o contraseña incorrectos.',
  'auth/user-not-found': 'Correo o contraseña incorrectos.',
  'auth/invalid-login-credentials': 'Correo o contraseña incorrectos.',
  'auth/invalid-email': 'El correo no tiene un formato válido.',
  'auth/missing-password': 'Escribe tu contraseña.',
  'auth/user-disabled': 'Tu cuenta está desactivada.',
  'auth/too-many-requests': 'Demasiados intentos; espera un momento.',
  'auth/network-request-failed': 'Sin conexión. Revisa tu red e inténtalo de nuevo.',
  'auth/firebase-app-check-token-is-invalid': 'No se pudo verificar la app (App Check). Recarga la página.',
}

export default function Login() {
  const { estado, usuario, salir } = useSesion()
  const { state } = useLocation()
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [verClave, setVerClave] = useState(false)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  if (estado === 'dentro') return <Navigate to={state?.desde || '/'} replace />

  const entrar = async (e) => {
    e.preventDefault()
    setError('')
    setEnviando(true)
    try {
      await signInWithEmailAndPassword(auth, correo.trim(), clave)
    } catch (err) {
      setError(ERRORES[err.code] || 'No se pudo iniciar sesión.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="grid min-h-screen bg-lienzo p-3 lg:grid-cols-[1fr_1.05fr] lg:gap-3">
      <section className="flex flex-col rounded-5xl border border-linea bg-white px-6 py-8 sm:px-12">
        <div className="flex items-center gap-3">
          <Isotipo className="h-10 w-10" />
          <div className="leading-tight">
            <p className="font-semibold tracking-apretado">OT Consulting</p>
            <p className="text-[12.5px] text-humo">Recursos Humanos</p>
          </div>
        </div>

        <div className="mx-auto my-auto w-full max-w-[380px] py-12">
          <h1 className="text-[32px] font-semibold leading-tight tracking-titulo">Entra al sistema de RH</h1>
          <p className="mt-2 text-[15px] text-humo">Agentes que revisan los datos de la plantilla y te dejan el trabajo listo para aprobar.</p>

          {estado === 'sin-acceso' ? (
            <div className="mt-8 space-y-4">
              <ErrorCaja>
                <p className="font-semibold">Tu cuenta no tiene acceso; pide alta a RH.</p>
                <p className="mt-1">Entraste como {usuario?.email}, pero no hay un perfil con rol para esta cuenta.</p>
              </ErrorCaja>
              <Boton variante="secundario" onClick={salir} className="w-full">Usar otra cuenta</Boton>
            </div>
          ) : (
            <form onSubmit={entrar} className="mt-8 space-y-4">
              <Campo etiqueta="Correo">
                <input type="email" autoComplete="email" required value={correo} onChange={(e) => setCorreo(e.target.value)} className={claseEntrada} placeholder="nombre@otconsulting.com.mx" />
              </Campo>
              <Campo etiqueta="Contraseña">
                <div className="relative">
                  <input type={verClave ? 'text' : 'password'} autoComplete="current-password" required value={clave} onChange={(e) => setClave(e.target.value)} className={`${claseEntrada} pr-12`} />
                  <button
                    type="button"
                    onClick={() => setVerClave((v) => !v)}
                    aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    title={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="absolute inset-y-0 right-1.5 my-auto grid h-9 w-9 place-items-center rounded-lg text-humo transition-colors hover:bg-panel hover:text-tinta"
                  >
                    {verClave ? <EyeOff className="h-[18px] w-[18px]" strokeWidth={1.8} /> : <Eye className="h-[18px] w-[18px]" strokeWidth={1.8} />}
                  </button>
                </div>
              </Campo>
              {error && <ErrorCaja>{error}</ErrorCaja>}
              <Boton type="submit" variante="primario" tam="gr" cargando={enviando || estado === 'cargando'} className="w-full">
                Entrar <ArrowRight className="h-4 w-4" />
              </Boton>
              <p className="flex items-center gap-2 text-[12.5px] text-humo">
                <LockKeyhole className="h-3.5 w-3.5" /> Solo cuentas dadas de alta por RH.
              </p>
            </form>
          )}
        </div>
        <p className="text-[12px] text-humo">Reto OT Consulting · Etapa 4</p>
      </section>

      <section className="relative hidden overflow-hidden rounded-5xl bg-tinta p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <img src="/brand/logo.png" alt="OT Consulting" className="h-10 w-auto self-start" />
        <div>
          <p className="max-w-[18ch] text-[40px] font-semibold leading-[1.05] tracking-titulo">
            Cada dato que falta, <span className="texto-grad">a la vista.</span>
          </p>
          <ul className="mt-8 max-w-[44ch] space-y-3 text-[14.5px] text-white/70">
            <li className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full grad-ot" />La rutina diaria convierte las 20 reglas de negocio en tareas.</li>
            <li className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full grad-ot" />Los agentes proponen correcciones; nada se escribe sin tu aprobación.</li>
            <li className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full grad-ot" />El lector de CVs compara candidatos contra la matriz de habilidades.</li>
          </ul>
        </div>
      </section>
    </div>
  )
}
