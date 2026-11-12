/**
 * QrLocal — un QR dibujado en el navegador.
 *
 * Antes los QR de la app se pedian como imagen a api.qrserver.com (goQR.me)
 * pasando el contenido en la URL. Eso significaba mandarle a un tercero:
 *   · en /alta, el nombre, la empresa, el WhatsApp y el mail de la clienta
 *     que se esta registrando;
 *   · en el formulario de alta, el WhatsApp y el nombre del negocio.
 * Ese tercero los ve y los puede registrar, junto con el referer que dice de
 * donde vienen. Nadie acepto eso, y /alta es una pagina publica.
 *
 * Con esto el QR se genera local: el contenido no sale del dispositivo.
 *
 * Props: data (string a codificar), size (px, default 180), alt, style,
 * className, y onReady(dataUrl) para quien necesite el PNG (descargarlo).
 */
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export default function QrLocal({ data, size = 180, alt = 'Código QR', style, className, onReady }) {
  const [src, setSrc] = useState('')

  useEffect(() => {
    let vivo = true
    if (!data) { setSrc(''); return }
    /* El ancho se pide al doble para que no se vea borroso en pantallas
       retina; el tamaño en pantalla lo fija el style. */
    QRCode.toDataURL(data, { width: size * 2, margin: 1, errorCorrectionLevel: 'M' })
      .then(url => {
        if (!vivo) return
        setSrc(url)
        if (typeof onReady === 'function') onReady(url)
      })
      .catch(() => { if (vivo) setSrc('') })
    return () => { vivo = false }
    // onReady se deja afuera a proposito: si quien llama pasa una funcion
    // nueva en cada render, incluirla volveria a generar el QR sin parar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, size])

  // Mientras se dibuja, un hueco del mismo tamaño: sin salto de layout.
  if (!src) {
    return <div className={className} style={{ width: size, height: size, borderRadius: 6, background: 'var(--surface2)', ...style }} />
  }
  return <img src={src} alt={alt} width={size} height={size} className={className} style={{ display: 'block', ...style }} />
}
