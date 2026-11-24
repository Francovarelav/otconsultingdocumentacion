/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Marca OT Consulting: el rojo es el único color de marca.
        rojo: { DEFAULT: '#FD111C', hondo: '#C8000A', suave: '#FFECEC' },
        tinta: '#1A1A1A',
        papel: '#FEFEFE',
        lienzo: '#EFEFEF', // fondo exterior
        barra: '#F7F7F7', // barra lateral
        linea: '#E4E4E4',
        borde: '#DEDEDE',
        gris: '#BABABA',
        humo: '#6B6B6B', // texto secundario (contraste AA sobre blanco)
        panel: '#F3F3F3', // contenedores hundidos
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      letterSpacing: { apretado: '-0.025em', titulo: '-0.035em' },
      borderRadius: { '4xl': '1.75rem', '5xl': '2.25rem' },
      boxShadow: {
        tarjeta: '0 1px 2px rgba(26,26,26,.04), 0 6px 18px -10px rgba(26,26,26,.10)',
        barra: '0 1px 2px rgba(26,26,26,.04)',
      },
    },
  },
  plugins: [],
}
