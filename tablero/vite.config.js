import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base relativa: el build se puede abrir desde cualquier carpeta o servidor interno
export default defineConfig({ plugins: [react()], base: './' })
