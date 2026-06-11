import { Link, useSearchParams } from 'react-router-dom'

/**
 * Páginas de resultado post-checkout MP.
 * Hay 3 variantes: 'exitoso', 'pendiente', 'error'.
 *
 * Mercado Pago redirige acá después del pago con query params:
 *   ?payment_id=...&status=approved&external_reference=...
 *
 * No confiamos en estos params para activar (el webhook hace eso server-side).
 * Solo los usamos para UX feedback al user.
 */

const VARIANTS = {
  exitoso: {
    icon: 'fa-circle-check',
    color: '#059669',
    bg: 'linear-gradient(135deg, #ECFDF5, #D1FAE5)',
    ring: 'rgba(5,150,105,.3)',
    title: '¡Pago confirmado!',
    subtitle: 'Recibimos tu pago. En las próximas 24 horas te vamos a contactar por WhatsApp para coordinar el setup llave en mano de tu cuenta.',
    next: [
      { icon: 'fa-message', text: 'Te escribiremos por WhatsApp en menos de 24h' },
      { icon: 'fa-user-tie', text: 'Coordinamos una llamada para entender tu negocio' },
      { icon: 'fa-rocket', text: 'Cargamos tus datos iniciales y dejamos todo listo' },
    ],
    primary: { label: 'Ir al panel', to: '/' },
    secondary: null,
  },
  pendiente: {
    icon: 'fa-clock',
    color: '#D97706',
    bg: 'linear-gradient(135deg, #FFFBEB, #FEF3C7)',
    ring: 'rgba(217,119,6,.3)',
    title: 'Tu pago está en proceso',
    subtitle: 'Mercado Pago todavía está confirmando tu pago. Esto puede tardar unos minutos. Te vamos a notificar en cuanto se confirme.',
    next: [
      { icon: 'fa-rotate', text: 'Refrescá esta página en unos minutos para ver el estado' },
      { icon: 'fa-envelope', text: 'Si en 24h no se confirma, escribinos por WhatsApp' },
    ],
    primary: { label: 'Ir al panel', to: '/' },
    secondary: { label: 'Chequear pago en Mercado Pago', href: 'https://www.mercadopago.com.ar/activities' },
  },
  error: {
    icon: 'fa-circle-xmark',
    color: '#DC2626',
    bg: 'linear-gradient(135deg, #FEF2F2, #FEE2E2)',
    ring: 'rgba(220,38,38,.3)',
    title: 'No pudimos confirmar tu pago',
    subtitle: 'Algo no salió bien en el checkout. No te preocupes: si la tarjeta fue rechazada, no se cobró. Podés probar de nuevo o escribirnos.',
    next: [
      { icon: 'fa-credit-card', text: 'Verificá los datos de tu tarjeta y volvé a intentar' },
      { icon: 'fa-bank', text: 'Probá con otra tarjeta o usá dinero en cuenta MP' },
      { icon: 'fa-whatsapp', text: 'O escribinos por WhatsApp y lo resolvemos juntos' },
    ],
    primary: { label: 'Probar de nuevo', to: '/activar' },
    secondary: { label: 'Hablar por WhatsApp', href: 'https://api.whatsapp.com/send?phone=5491169456863&text=¡Hola! Tuve un problema con el pago de ANMA Regalos' },
  },
}

/* Pago de un PRESUPUESTO (cliente final del negocio, llega con ?ctx=presupuesto).
   Sin referencias al SaaS ni botón "Ir al panel" — el que paga no tiene cuenta. */
const CLIENT_OVERRIDES = {
  exitoso: {
    title: '¡Pago recibido!',
    subtitle: 'Tu pago fue acreditado correctamente. El vendedor ya fue notificado y se va a contactar por WhatsApp para coordinar los próximos pasos.',
    next: [
      { icon: 'fa-message', text: 'El vendedor te va a confirmar el pedido por WhatsApp' },
      { icon: 'fa-envelope', text: 'Mercado Pago te envió el comprobante por email' },
      { icon: 'fa-circle-check', text: 'Ya podés cerrar esta ventana' },
    ],
    primary: null,
    secondary: null,
  },
  pendiente: {
    subtitle: 'Mercado Pago todavía está confirmando el pago. Las tarjetas tardan minutos; transferencias o efectivo pueden demorar hasta 48 hs.',
    next: [
      { icon: 'fa-rotate', text: 'Refrescá esta página en unos minutos para ver el estado' },
      { icon: 'fa-message', text: 'Cuando se acredite, el vendedor te confirma por WhatsApp' },
    ],
    primary: null,
  },
  error: {
    title: 'No pudimos procesar tu pago',
    subtitle: 'Si la tarjeta fue rechazada, no se cobró nada. Podés volver a intentar desde el mismo link de pago o avisarle al vendedor para coordinar otro medio.',
    next: [
      { icon: 'fa-credit-card', text: 'Verificá los datos de tu tarjeta y volvé a intentar' },
      { icon: 'fa-bank', text: 'Probá con otra tarjeta o usá dinero en cuenta MP' },
      { icon: 'fa-message', text: 'O avisale al vendedor por WhatsApp y lo resuelven juntos' },
    ],
    primary: null,
    secondary: null,
  },
}

export default function PagoResultado({ variant = 'exitoso' }) {
  const [searchParams] = useSearchParams()
  const isBudgetPay = searchParams.get('ctx') === 'presupuesto'
  const base = VARIANTS[variant] || VARIANTS.exitoso
  const v = isBudgetPay ? { ...base, ...(CLIENT_OVERRIDES[variant] || {}) } : base

  const paymentId = searchParams.get('payment_id') || searchParams.get('collection_id')
  const status = searchParams.get('status') || searchParams.get('collection_status')

  return (
    <div style={{
      minHeight: 'calc(100vh - 100px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '40px 20px',
      background: variant === 'exitoso' ? 'linear-gradient(160deg, #faf8ff 0%, #f0fdf4 100%)' : 'var(--bg)',
    }}>
      <div style={{ maxWidth: 520, width: '100%', textAlign: 'center' }}>
        {/* Icon con ring */}
        <div style={{ position: 'relative', width: 96, height: 96, margin: '0 auto 24px' }}>
          {variant === 'exitoso' && (
            <span style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: v.color,
              animation: 'anma-pulse-ring 1.6s ease-out infinite',
              opacity: .25,
            }} />
          )}
          <div style={{
            width: 96, height: 96, borderRadius: '50%',
            background: v.bg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: v.color, fontSize: 44,
            boxShadow: `0 12px 36px ${v.ring}`,
            position: 'relative',
          }}>
            <i className={`fa ${v.icon}`} />
          </div>
        </div>

        {/* Title + subtitle */}
        <h1 style={{
          fontSize: 28, fontWeight: 900, color: 'var(--txt)',
          margin: '0 0 12px', letterSpacing: '-.4px', lineHeight: 1.2,
        }}>
          {v.title}
        </h1>
        <p style={{
          fontSize: 14.5, color: 'var(--txt2)', lineHeight: 1.65,
          margin: '0 0 28px', maxWidth: 440, marginLeft: 'auto', marginRight: 'auto',
        }}>
          {v.subtitle}
        </p>

        {/* Next steps */}
        <div style={{
          background: '#fff', border: '1.5px solid var(--border)',
          borderRadius: 14, padding: '20px 24px', marginBottom: 24, textAlign: 'left',
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 14 }}>
            Qué sigue
          </div>
          {v.next.map((step, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '8px 0',
              borderBottom: i < v.next.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: `${v.color}15`, color: v.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, flexShrink: 0, marginTop: 1,
              }}>
                <i className={`fa ${step.icon === 'fa-whatsapp' ? 'fa-brands fa-whatsapp' : step.icon}`} />
              </div>
              <span style={{ fontSize: 13, color: 'var(--txt2)', lineHeight: 1.6 }}>
                {step.text}
              </span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          {v.primary && <Link to={v.primary.to} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '13px 28px', borderRadius: 11, border: 'none',
            background: `linear-gradient(135deg, ${v.color}, ${v.color}dd)`,
            color: '#fff', fontSize: 14, fontWeight: 700,
            textDecoration: 'none', cursor: 'pointer',
            boxShadow: `0 8px 24px ${v.ring}`,
          }}>
            <i className="fa fa-arrow-right" />
            {v.primary.label}
          </Link>}
          {v.secondary && (
            v.secondary.href ? (
              <a href={v.secondary.href} target="_blank" rel="noopener noreferrer" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '13px 22px', borderRadius: 11,
                background: 'var(--surface)', border: '1.5px solid var(--border)',
                color: 'var(--txt2)', fontSize: 13, fontWeight: 600,
                textDecoration: 'none', cursor: 'pointer',
              }}>
                {v.secondary.label}
              </a>
            ) : (
              <Link to={v.secondary.to} style={{
                padding: '13px 22px', borderRadius: 11,
                background: 'var(--surface)', border: '1.5px solid var(--border)',
                color: 'var(--txt2)', fontSize: 13, fontWeight: 600,
                textDecoration: 'none',
              }}>
                {v.secondary.label}
              </Link>
            )
          )}
        </div>

        {/* Payment ID debug (solo si vino del MP redirect) */}
        {paymentId && (
          <div style={{
            marginTop: 28, padding: '10px 14px',
            background: 'var(--surface2)', borderRadius: 8,
            fontSize: 11, color: 'var(--txt3)', fontFamily: 'monospace',
            display: 'inline-block',
          }}>
            ID de transacción: <strong>{paymentId}</strong>
            {status && ` · ${status}`}
          </div>
        )}
      </div>

      <style>{`
        @keyframes anma-pulse-ring {
          0% { transform: scale(.95); opacity: .25 }
          100% { transform: scale(1.5); opacity: 0 }
        }
      `}</style>
    </div>
  )
}
