/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        lienzo: '#E4DFDD',   // fondo exterior
        casco: '#F5F3F2',    // superficie de la aplicación
        panel: '#EDEAE8',    // contenedores hundidos
        tinta: '#17171A',
        humo: '#8B8885',     // texto secundario
        bruma: '#C9C5C2',    // marcas neutras
        carmin: { DEFAULT: '#D62F5C', suave: '#FBE4EA', hondo: '#B0224A' },
      },
      fontFamily: { sans: ['Onest', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'] },
      borderRadius: { '4xl': '2rem', '5xl': '2.75rem' },
      boxShadow: { ficha: '0 1px 0 rgba(23,23,26,.04), 0 8px 24px -12px rgba(23,23,26,.12)' },
    },
  },
  plugins: [],
}
