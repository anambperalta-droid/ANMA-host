/**
 * EmptyHero — empty state premium con micro-CTAs. (Espejo de Pro)
 */
export default function EmptyHero({ icon = 'fa-folder-open', title, subtitle, primary, secondary, tip, accent = 'brand' }) {
  const accentColor = accent === 'green' ? '#059669' : '#7C3AED'
  const accentBg    = accent === 'green' ? 'rgba(5,150,105,.10)' : 'rgba(124,58,237,.10)'
  const accentBg2   = accent === 'green' ? 'rgba(5,150,105,.04)' : 'rgba(124,58,237,.04)'

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      textAlign: 'center', padding: '48px 24px',
      maxWidth: 480, margin: '0 auto',
    }}>
      <div style={{
        width: 96, height: 96, borderRadius: 28,
        background: `radial-gradient(circle, ${accentBg} 0%, ${accentBg2} 70%, transparent 100%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 20, position: 'relative',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 18,
          background: `linear-gradient(135deg, ${accentColor}, ${accent === 'green' ? '#10B981' : '#A78BFA'})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 26,
          boxShadow: `0 8px 24px ${accentBg}`,
        }}>
          <i className={`fa ${icon}`} />
        </div>
      </div>

      <h3 style={{ fontSize: 19, fontWeight: 800, color: 'var(--txt)', margin: '0 0 8px', letterSpacing: '-.3px' }}>{title}</h3>

      {subtitle && (
        <p style={{ fontSize: 13.5, color: 'var(--txt3)', margin: '0 0 22px', maxWidth: 360, lineHeight: 1.55 }}>{subtitle}</p>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginBottom: tip ? 16 : 0 }}>
        {primary && (
          <button
            onClick={primary.onClick}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '11px 22px', borderRadius: 10, border: 'none',
              background: `linear-gradient(135deg, ${accentColor}, ${accent === 'green' ? '#047857' : '#6D28D9'})`,
              color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: `0 4px 14px ${accentBg}`, transition: 'transform .15s, box-shadow .15s',
            }}>
            {primary.icon && <i className={`fa ${primary.icon}`} />}
            {primary.label}
          </button>
        )}
        {secondary && (
          <button
            onClick={secondary.onClick}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '11px 22px', borderRadius: 10,
              border: '1.5px solid var(--border)', background: 'var(--surface)',
              color: 'var(--txt2)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}>
            {secondary.icon && <i className={`fa ${secondary.icon}`} />}
            {secondary.label}
          </button>
        )}
      </div>

      {tip && (
        <p style={{ fontSize: 11.5, color: 'var(--txt4)', margin: 0, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <i className="fa fa-lightbulb" style={{ color: '#F59E0B', fontSize: 11 }} />
          {tip}
        </p>
      )}
    </div>
  )
}
