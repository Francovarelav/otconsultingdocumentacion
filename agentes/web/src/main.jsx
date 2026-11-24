import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { SesionProvider } from './lib/auth.jsx'
import { AvisosProvider } from './components/ui.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <SesionProvider>
        <AvisosProvider>
          <App />
        </AvisosProvider>
      </SesionProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
