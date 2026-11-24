import React from 'react'
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useSesion } from './lib/auth.jsx'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Inicio from './pages/Inicio.jsx'
import Agente from './pages/Agente.jsx'
import Colaboradores from './pages/Colaboradores.jsx'
import Indicadores from './pages/Indicadores.jsx'
import Bandeja from './pages/Bandeja.jsx'
import Aprobaciones from './pages/Aprobaciones.jsx'
import Sops from './pages/Sops.jsx'
import Memoria from './pages/Memoria.jsx'
import Cvs from './pages/Cvs.jsx'
import Usuarios from './pages/Usuarios.jsx'
import Asistencia from './pages/Asistencia.jsx'
import Vacaciones from './pages/Vacaciones.jsx'
import Ficha from './pages/Ficha.jsx'
import Nomina from './pages/Nomina.jsx'
import Analitica from './pages/Analitica.jsx'
import Mi from './pages/Mi.jsx'
import Encuestas from './pages/Encuestas.jsx'
import Formulario from './pages/Formulario.jsx'
import Cultura from './pages/Cultura.jsx'

function Protegida({ children }) {
  const { estado } = useSesion()
  const { pathname, search } = useLocation()
  if (estado === 'cargando')
    return (
      <div className="grid min-h-screen place-items-center bg-lienzo">
        <div className="flex items-center gap-3 text-humo">
          <img src="/brand/isotipo.png" alt="" className="h-9 w-9 rounded-xl" />
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      </div>
    )
  if (estado !== 'dentro') return <Navigate to="/login" replace state={{ desde: pathname + search }} />
  return children
}

// Rutas que el rol colaborador puede abrir (autoservicio).
const PERMITIDAS_COLABORADOR = [/^\/mi(\/|$)/, /^\/asistencia$/, /^\/vacaciones$/, /^\/encuestas$/, /^\/cultura$/]

/** El rol colaborador solo ve lo suyo; todo lo demás lo manda a Mi espacio. */
function Rol({ children }) {
  const { esColaborador, idColaborador } = useSesion()
  const { pathname } = useLocation()
  if (!esColaborador) return children
  const suFicha = idColaborador && pathname === `/colaboradores/${encodeURIComponent(idColaborador)}`
  if (suFicha || PERMITIDAS_COLABORADOR.some((r) => r.test(pathname))) return children
  return <Navigate to="/mi" replace />
}

function FichaRuta() {
  const { id } = useParams()
  return <Ficha key={id} id={id} />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/f/:id" element={<Formulario />} />
      <Route element={<Protegida><Rol><Layout /></Rol></Protegida>}>
        <Route index element={<Inicio />} />
        <Route path="agente/:id" element={<Agente />} />
        <Route path="colaboradores" element={<Colaboradores />} />
        <Route path="indicadores" element={<Indicadores />} />
        <Route path="bandeja" element={<Bandeja />} />
        <Route path="aprobaciones" element={<Aprobaciones />} />
        <Route path="sops" element={<Sops />} />
        <Route path="memoria" element={<Memoria />} />
        <Route path="cvs" element={<Cvs />} />
        <Route path="usuarios" element={<Usuarios />} />
        <Route path="colaboradores/:id" element={<FichaRuta />} />
        <Route path="asistencia" element={<Asistencia />} />
        <Route path="vacaciones" element={<Vacaciones />} />
        <Route path="nomina" element={<Nomina />} />
        <Route path="analitica" element={<Analitica />} />
        <Route path="mi" element={<Mi />} />
        <Route path="mi/recibos" element={<Mi recibos />} />
        <Route path="encuestas" element={<Encuestas />} />
        <Route path="cultura" element={<Cultura />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
