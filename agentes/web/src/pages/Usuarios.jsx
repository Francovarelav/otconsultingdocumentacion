import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Check, Copy, KeyRound, Pencil, UserCog, UserPlus } from 'lucide-react'
import { api, mensajeError } from '../firebase.js'
import { ROLES, useSesion } from '../lib/auth.jsx'
import { fecha, hace, normal, num } from '../lib/formato.js'
import MedidorGasto from '../components/Gasto.jsx'
import SelectorColaborador from '../components/SelectorColaborador.jsx'
import {
  Boton, CampoBusqueda, Campo, Cargando, Encabezado, ErrorCaja, Panel, Pastilla, Resaltar, Selector, Tabla, Vacio, claseEntrada, useAviso, useDebounce,
} from '../components/ui.jsx'

export default function Usuarios() {
  const { esAdmin } = useSesion()
  if (!esAdmin) return <Navigate to="/" replace />
  return <Gestion />
}

function Gestion() {
  const { usuario } = useSesion()
  const [estado, setEstado] = useState({ cargando: true, lista: [], error: null })
  const [texto, setTexto] = useState('')
  const q = useDebounce(texto)
  const [rol, setRol] = useState('todos')
  const [editando, setEditando] = useState(null) // null | 'nuevo' | usuario

  const cargar = useCallback(async () => {
    setEstado((e) => ({ ...e, cargando: true }))
    try {
      const lista = await api.listarUsuarios()
      setEstado({ cargando: false, lista: Array.isArray(lista) ? lista : lista?.usuarios ?? [], error: null })
    } catch (e) {
      setEstado({ cargando: false, lista: [], error: mensajeError(e) })
    }
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const filtrados = useMemo(() => {
    const t = normal(q)
    return estado.lista
      .filter((u) => rol === 'todos' || u.rol === rol)
      .filter((u) => !t || normal(u.nombre).includes(t) || normal(u.email).includes(t))
      .sort((a, b) => String(a.nombre || a.email).localeCompare(String(b.nombre || b.email), 'es'))
  }, [estado.lista, q, rol])

  const conteo = (r) => estado.lista.filter((u) => u.rol === r).length

  return (
    <div>
      <Encabezado titulo="Usuarios y roles" subtitulo="Quién entra al sistema y qué puede hacer. Los cambios pasan por funciones del servidor; nadie escribe directo en la base.">
        <Boton variante="primario" icono={UserPlus} onClick={() => setEditando('nuevo')}>Nuevo usuario</Boton>
      </Encabezado>

      <MedidorGasto className="mb-6" />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Object.entries(ROLES).map(([k, r], i) => (
          <div key={k} style={{ '--i': i }} className="anim-entrar rounded-2xl border border-linea p-4 transition-colors hover:border-borde">
            <div className="flex items-baseline justify-between">
              <p className="font-semibold tracking-apretado">{r.nombre}</p>
              <span className="text-[13px] text-humo tabular">{num(conteo(k))}</span>
            </div>
            <p className="mt-1 text-[12.5px] text-humo">{r.descripcion}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <CampoBusqueda valor={texto} onCambio={setTexto} placeholder="Nombre o correo" className="w-full sm:w-[280px]" />
        <Selector valor={rol} onCambio={setRol} opciones={[{ valor: 'todos', etiqueta: 'Todos los roles' }, ...Object.entries(ROLES).map(([k, r]) => ({ valor: k, etiqueta: r.nombre }))]} />
      </div>

      {estado.error ? (
        <ErrorCaja>No se pudo cargar la lista de usuarios: {estado.error}</ErrorCaja>
      ) : estado.cargando ? (
        <Cargando lineas={6} />
      ) : estado.lista.length === 0 ? (
        <Vacio icono={UserCog} titulo="Sin usuarios" texto="Da de alta al primer usuario con «Nuevo usuario»." />
      ) : (
        <Tabla
          minimo={760}
          filas={filtrados}
          claveFila={(u) => u.uid}
          alClic={(u) => setEditando(u)}
          vacio="Ningún usuario coincide con la búsqueda."
          columnas={[
            {
              titulo: 'Usuario',
              celda: (u) => (
                <span>
                  <span className="block font-medium"><Resaltar texto={u.nombre || '—'} q={q} />{u.uid === usuario.uid && <span className="ml-1.5 text-[12px] font-normal text-humo">(tú)</span>}</span>
                  <span className="block text-[12px] text-humo"><Resaltar texto={u.email} q={q} /></span>
                </span>
              ),
            },
            { titulo: 'Rol', celda: (u) => <span className="flex flex-wrap items-center gap-1"><Pastilla tono={u.rol === 'admin' ? 'tinta' : u.rol === 'rh' ? 'contorno' : 'neutro'}>{ROLES[u.rol]?.nombre || u.rol || '—'}</Pastilla>{u.id_colaborador && <span className="text-[12px] text-humo">{u.id_colaborador}</span>}</span> },
            { titulo: 'Estado', celda: (u) => (u.activo === false ? <Pastilla tono="suave">Inactivo</Pastilla> : <span className="inline-flex items-center gap-1.5 text-[13px]"><span className="h-1.5 w-1.5 rounded-full bg-[#1F9D55]" />Activo</span>) },
            { titulo: 'Alta', celda: (u) => <span className="text-humo">{fecha(u.creado)}</span> },
            { titulo: 'Último acceso', celda: (u) => <span className="text-humo">{u.ultimoAcceso ? hace(u.ultimoAcceso) : 'Nunca'}</span> },
            { titulo: '', derecha: true, celda: () => <Pencil className="ml-auto h-4 w-4 text-humo" /> },
          ]}
        />
      )}

      <Panel
        abierto={!!editando}
        onCerrar={() => setEditando(null)}
        titulo={editando === 'nuevo' ? 'Nuevo usuario' : editando?.nombre || editando?.email}
        subtitulo={editando && editando !== 'nuevo' ? editando.email : 'Se crea con una contraseña temporal que verás una sola vez.'}
      >
        {editando && (
          <Formulario
            key={editando === 'nuevo' ? 'nuevo' : editando.uid}
            u={editando === 'nuevo' ? null : editando}
            esYo={editando !== 'nuevo' && editando.uid === usuario.uid}
            onGuardado={cargar}
          />
        )}
      </Panel>
    </div>
  )
}

function Formulario({ u, esYo, onGuardado }) {
  const avisar = useAviso()
  const [f, setF] = useState({ email: u?.email || '', nombre: u?.nombre || '', rol: u?.rol || 'rh', activo: u?.activo !== false, id_colaborador: u?.id_colaborador || '' })
  const [guardando, setGuardando] = useState(false)
  const [restableciendo, setRestableciendo] = useState(false)
  const [error, setError] = useState('')
  const [clave, setClave] = useState(null)

  const guardar = async (e) => {
    e.preventDefault()
    setError('')
    if (f.rol === 'colaborador' && !f.id_colaborador) return setError('Un usuario colaborador debe estar ligado a su ID de colaborador.')
    setGuardando(true)
    try {
      const res = await api.guardarUsuario({
        ...(u ? { uid: u.uid } : {}),
        email: f.email.trim().toLowerCase(),
        nombre: f.nombre.trim(),
        rol: f.rol,
        activo: f.activo,
        ...(f.id_colaborador ? { id_colaborador: f.id_colaborador } : {}),
      })
      avisar(u ? 'Usuario actualizado' : 'Usuario creado')
      if (res?.passwordTemporal) setClave(res.passwordTemporal)
      onGuardado()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setGuardando(false)
    }
  }

  const restablecer = async () => {
    setError('')
    setRestableciendo(true)
    try {
      const res = await api.restablecerAcceso({ uid: u.uid })
      setClave(res?.passwordTemporal || null)
      avisar('Acceso restablecido')
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setRestableciendo(false)
    }
  }

  return (
    <div className="space-y-6">
      {clave && <ClaveTemporal clave={clave} email={f.email} />}

      <form onSubmit={guardar} className="space-y-4">
        <Campo etiqueta="Correo">
          <input type="email" required disabled={!!u} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={`${claseEntrada} disabled:bg-panel disabled:text-humo`} placeholder="nombre@otconsulting.com.mx" />
        </Campo>
        <Campo etiqueta="Nombre">
          <input required value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} className={claseEntrada} />
        </Campo>

        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium">Rol</legend>
          <div className="space-y-2">
            {Object.entries(ROLES).map(([k, r]) => (
              <label
                key={k}
                className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition-colors ${f.rol === k ? 'border-[#FF8A6A] bg-[#FFF6F2]' : 'border-linea hover:border-borde'} ${esYo ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <input type="radio" name="rol" value={k} disabled={esYo} checked={f.rol === k} onChange={() => setF({ ...f, rol: k })} className="mt-0.5 accent-rojo" />
                <span>
                  <span className="block text-[14px] font-medium">{r.nombre}</span>
                  <span className="block text-[12.5px] text-humo">{r.descripcion}</span>
                </span>
              </label>
            ))}
          </div>
          {esYo && <p className="mt-1.5 text-[12px] text-humo">No puedes cambiar tu propio rol ni desactivarte.</p>}
        </fieldset>

        {(f.rol === 'colaborador' || f.id_colaborador) && (
          <Campo etiqueta={f.rol === 'colaborador' ? 'Colaborador ligado (obligatorio)' : 'Colaborador ligado (opcional)'} ayuda="Se liga por ID: con él checa, pide vacaciones y ve solo lo suyo.">
            <SelectorColaborador
              valor={f.id_colaborador}
              onCambio={(id, c) => setF((x) => ({ ...x, id_colaborador: id, nombre: x.nombre || c?.nombre || '' }))}
              requerido={f.rol === 'colaborador'}
            />
          </Campo>
        )}

        <label className={`flex items-center justify-between gap-3 rounded-2xl border border-linea p-3.5 ${esYo ? 'opacity-60' : ''}`}>
          <span>
            <span className="block text-[14px] font-medium">Acceso activo</span>
            <span className="block text-[12.5px] text-humo">Si lo apagas, la cuenta ya no puede entrar.</span>
          </span>
          <input type="checkbox" disabled={esYo} checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} className="h-4 w-4 accent-rojo" />
        </label>

        {error && <ErrorCaja>{error}</ErrorCaja>}
        <Boton type="submit" variante="primario" cargando={guardando} className="w-full">{u ? 'Guardar cambios' : 'Crear usuario'}</Boton>
      </form>

      {u && (
        <section className="rounded-2xl bg-panel p-4">
          <p className="text-[14px] font-medium">Restablecer acceso</p>
          <p className="mt-0.5 text-[12.5px] text-humo">Genera una contraseña temporal nueva. La anterior deja de funcionar.</p>
          <Boton tam="ch" icono={KeyRound} cargando={restableciendo} onClick={restablecer} className="mt-3">Generar contraseña temporal</Boton>
        </section>
      )}
    </div>
  )
}

function ClaveTemporal({ clave, email }) {
  const [copiado, setCopiado] = useState(false)
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(clave)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch { /* el usuario puede seleccionarla a mano */ }
  }
  return (
    <div className="anim-entrar relative overflow-hidden rounded-2xl border border-[#FFB59A] bg-[#FFF6F2] p-4">
      <span className="grad-ot-h absolute inset-x-0 top-0 h-[3px]" />
      <p className="text-[13.5px] font-semibold">Contraseña temporal de {email}</p>
      <p className="mt-0.5 text-[12.5px] text-humo">Se muestra una sola vez. Cópiala y compártela por un canal seguro.</p>
      <div className="mt-3 flex items-center gap-2">
        <code className="flex-1 select-all truncate rounded-xl border border-linea bg-white px-3 py-2 font-mono text-[14px]">{clave}</code>
        <Boton tam="md" variante={copiado ? 'tinta' : 'primario'} icono={copiado ? Check : Copy} onClick={copiar}>{copiado ? 'Copiada' : 'Copiar'}</Boton>
      </div>
    </div>
  )
}
