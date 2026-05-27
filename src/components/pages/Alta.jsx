/**
 * Alta.jsx — Página pública de registro de clientes
 * NO requiere autenticación.
 * URL: /alta?admin=NUMERO_WA&neg=NOMBRE_NEGOCIO
 *
 * Flujo:
 * 1. Negocio comparte el QR / link de /alta?admin=...&neg=...
 * 2. Cliente abre → rellena sus datos → envía
 * 3. Se genera el deep link con los datos como params
 * 4. Cliente puede enviar al negocio por WhatsApp con 1 clic
 * 5. Negocio abre el link → ANMA muestra el modal pre-cargado → guarda
 */

import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'

export default function Alta({ appName = 'ANMA Regalos' }) {
  const [params] = useSearchParams()
  const adminWa  = (params.get('admin') || params.get('a') || '').replace(/\D/g, '')
  const negocio  = params.get('neg')   || params.get('n') || appName

  const [form, setForm] = useState({ company: '', contact: '', wa: '', email: '' })
  const [done, setDone] = useState(false)
  const [copied, setCopied] = useState(false)

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  /* Deep link generado con los datos del cliente */
  const buildLink = (f) => {
    const q = new URLSearchParams()
    if (f.contact) q.set('cn', f.contact)
    if (f.company) q.set('co', f.company)
    if (f.wa)      q.set('cw', f.wa)
    if (f.email)   q.set('ce', f.email)
    return `${window.location.origin}/clientes?${q.toString()}`
  }

  const deepLink = buildLink(form)

  const submit = (e) => {
    e.preventDefault()
    if (!form.company && !form.contact) return
    setDone(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const copyLink = () => {
    navigator.clipboard.writeText(deepLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2200)
  }

  const sendWa = () => {
    const text = `¡Hola! Me quiero registrar como cliente de ${negocio}.\nMis datos: ${deepLink}`
    if (adminWa) {
      window.open(`https://wa.me/${adminWa}?text=${encodeURIComponent(text)}`, '_blank')
    } else {
      copyLink()
    }
  }

  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(deepLink)}`

  /* ── Estilos inline — sin dependencias externas ── */
  const s = {
    page: { minHeight: '100vh', background: 'linear-gradient(140deg,#F5F3FF 0%,#EFF6FF 60%,#F0FDF4 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 16px', fontFamily: "'Inter',system-ui,sans-serif" },
    card: { width: '100%', maxWidth: 440, background: '#fff', borderRadius: 24, padding: '28px 26px 24px', boxShadow: '0 6px 40px rgba(0,0,0,.1),0 1px 4px rgba(0,0,0,.06)', border: '1px solid rgba(0,0,0,.05)' },
    logo: { width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg,#7C3AED,#9D5CF5)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px', fontSize: 26, boxShadow: '0 8px 24px rgba(124,58,237,.28)' },
    title: { fontSize: 21, fontWeight: 800, color: '#1E1B4B', margin: '0 0 3px', letterSpacing: '-.5px', textAlign: 'center' },
    sub: { fontSize: 13, color: '#6B7280', margin: '0 0 22px', textAlign: 'center' },
    label: { display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 },
    input: { width: '100%', padding: '11px 14px', border: '1.5px solid #E5E7EB', borderRadius: 10, fontFamily: 'inherit', fontSize: 14, color: '#111827', outline: 'none', boxSizing: 'border-box', transition: 'border-color .15s' },
    fg: { marginBottom: 14 },
    btn: { width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#7C3AED,#9D5CF5)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginTop: 4, boxShadow: '0 4px 16px rgba(124,58,237,.32)', transition: 'transform .12s,filter .12s' },
    wa: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: '#16A34A', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 16px rgba(22,163,74,.32)', transition: 'filter .12s' },
    copy: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', padding: '11px', borderRadius: 10, border: '1.5px solid #E5E7EB', background: '#F9FAFB', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginTop: 8 },
    success: { textAlign: 'center' },
  }

  return (
    <div style={s.page}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        {/* Encabezado */}
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={s.logo}>🎁</div>
          <h1 style={s.title}>{negocio}</h1>
          <p style={s.sub}>Formulario de registro de clientes</p>
        </div>

        <div style={s.card}>
          {!done ? (
            /* ── FORMULARIO ── */
            <form onSubmit={submit}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 14 }}>Tus datos de contacto</div>

              <div style={s.fg}>
                <label style={s.label}>Empresa / Nombre del negocio *</label>
                <input
                  style={s.input}
                  type="text"
                  value={form.company}
                  onChange={e => setF('company', e.target.value)}
                  placeholder="Tu empresa o nombre"
                  required
                  onFocus={e => { e.target.style.borderColor = '#7C3AED' }}
                  onBlur={e => { e.target.style.borderColor = '#E5E7EB' }}
                />
              </div>

              <div style={s.fg}>
                <label style={s.label}>Persona de contacto</label>
                <input
                  style={s.input}
                  type="text"
                  value={form.contact}
                  onChange={e => setF('contact', e.target.value)}
                  placeholder="Nombre y apellido"
                  onFocus={e => { e.target.style.borderColor = '#7C3AED' }}
                  onBlur={e => { e.target.style.borderColor = '#E5E7EB' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={s.label}>WhatsApp</label>
                  <input
                    style={s.input}
                    type="tel"
                    value={form.wa}
                    onChange={e => setF('wa', e.target.value)}
                    placeholder="+54 11..."
                    onFocus={e => { e.target.style.borderColor = '#7C3AED' }}
                    onBlur={e => { e.target.style.borderColor = '#E5E7EB' }}
                  />
                </div>
                <div>
                  <label style={s.label}>Email</label>
                  <input
                    style={s.input}
                    type="email"
                    value={form.email}
                    onChange={e => setF('email', e.target.value)}
                    placeholder="tu@mail.com"
                    onFocus={e => { e.target.style.borderColor = '#7C3AED' }}
                    onBlur={e => { e.target.style.borderColor = '#E5E7EB' }}
                  />
                </div>
              </div>

              <button type="submit" style={s.btn}
                onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.08)'}
                onMouseLeave={e => e.currentTarget.style.filter = 'none'}
                onMouseDown={e => e.currentTarget.style.transform = 'scale(.97)'}
                onMouseUp={e => e.currentTarget.style.transform = 'none'}
              >
                Enviar mis datos →
              </button>

              <p style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'center', marginTop: 12, lineHeight: 1.5 }}>
                Tus datos se enviarán directamente a {negocio}. No creás ninguna cuenta ni contraseña.
              </p>
            </form>
          ) : (
            /* ── ÉXITO ── */
            <div style={s.success}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: '#1E1B4B', margin: '0 0 6px', letterSpacing: '-.4px' }}>¡Listo, {form.contact || form.company}!</h2>
              <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 20px', lineHeight: 1.6 }}>
                {adminWa
                  ? `Enviá tus datos a ${negocio} con el botón de abajo:`
                  : `Copiá este link y enviáselo a ${negocio}:`}
              </p>

              {/* QR del deep link */}
              <div style={{ margin: '0 auto 16px', display: 'inline-block', padding: 8, background: '#F9FAFB', borderRadius: 12, border: '1px solid #E5E7EB' }}>
                <img src={qr} alt="QR de tus datos" width={160} height={160} style={{ display: 'block', borderRadius: 6 }} />
              </div>

              <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 16 }}>Tu código personal de registro</div>

              {adminWa ? (
                <button style={s.wa} onClick={sendWa}
                  onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.08)'}
                  onMouseLeave={e => e.currentTarget.style.filter = 'none'}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  Enviar por WhatsApp
                </button>
              ) : null}

              <button style={s.copy} onClick={copyLink}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                {copied ? '¡Copiado!' : 'Copiar link de registro'}
              </button>

              <button
                style={{ ...s.copy, marginTop: 6, color: '#9CA3AF', border: '1px dashed #E5E7EB' }}
                onClick={() => { setDone(false); setForm({ company: '', contact: '', wa: '', email: '' }) }}
              >
                ← Volver al formulario
              </button>

              <p style={{ fontSize: 10, color: '#D1D5DB', marginTop: 14, lineHeight: 1.5 }}>
                Guardá o enviá este link al negocio para completar tu registro.
              </p>
            </div>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, color: '#9CA3AF', marginTop: 16 }}>
          Powered by {appName}
        </p>
      </div>
    </div>
  )
}
