import React, { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Download } from 'lucide-react'

/** Código QR en SVG (librería `qrcode`), con descarga del SVG. */
export default function Qr({ texto, nombre = 'qr', tam = 168, descargar = true }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    let vivo = true
    QRCode.toString(texto, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1A1A1A', light: '#FFFFFF' } })
      .then((s) => vivo && setSvg(s))
      .catch(() => vivo && setSvg(''))
    return () => { vivo = false }
  }, [texto])

  const bajar = () => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${nombre}.svg`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="inline-flex flex-col items-center gap-2">
      <div
        className="rounded-2xl border border-linea bg-white p-2 [&>svg]:h-full [&>svg]:w-full"
        style={{ width: tam, height: tam }}
        role="img"
        aria-label={`Código QR de ${texto}`}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {descargar && svg && (
        <button onClick={bajar} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-humo hover:text-tinta">
          <Download className="h-3.5 w-3.5" /> Descargar SVG
        </button>
      )}
    </div>
  )
}
