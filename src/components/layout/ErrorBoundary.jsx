import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    // Auto-expandimos detalles para que el user vea EL ERROR REAL al instante.
    // Antes el detalle quedaba colapsado y eso no nos servía para diagnosticar.
    this.state = { hasError: false, error: null, showDetails: true, copied: false }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[ANMA] Error no capturado:', error, info)
  }

  handleReload = () => {
    window.location.reload()
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, showDetails: false })
  }

  toggleDetails = () => {
    this.setState(s => ({ showDetails: !s.showDetails }))
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const { error, showDetails } = this.state

    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(180deg, #FAFAFB 0%, #F5F3FF 100%)',
        padding: '24px',
        fontFamily: 'var(--font-sans, Inter, system-ui, sans-serif)',
      }}>
        <div style={{
          maxWidth: 520,
          width: '100%',
          background: '#fff',
          borderRadius: 20,
          border: '1px solid rgba(15,23,42,.06)',
          boxShadow: '0 1px 2px rgba(15,23,42,.04), 0 12px 36px -10px rgba(124,58,237,.12)',
          padding: '40px 36px 32px',
          textAlign: 'center',
        }}>
          {/* Icon line-only sofisticado */}
          <div style={{
            width: 56, height: 56,
            borderRadius: 16,
            border: '1.5px solid #DDD6FE',
            background: 'rgba(124,58,237,.04)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 18px',
            color: '#7C3AED',
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>

          {/* Title */}
          <h2 style={{
            margin: '0 0 8px',
            fontSize: '20px',
            fontWeight: 800,
            color: '#1E1B4B',
            letterSpacing: '-.4px',
          }}>
            Algo salió mal
          </h2>

          {/* Subtitle */}
          <p style={{
            margin: '0 0 24px',
            fontSize: '13.5px',
            color: '#64748B',
            lineHeight: 1.6,
            maxWidth: 360,
            marginLeft: 'auto',
            marginRight: 'auto',
          }}>
            Recargá la página — suele ser una versión vieja en caché. Si vuelve a pasar, copiá el detalle y mandalo.
          </p>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={this.handleReload}
              style={{
                padding: '12px 22px',
                borderRadius: 11,
                border: 'none',
                background: '#7C3AED',
                color: '#fff',
                fontWeight: 700,
                fontSize: 13.5,
                letterSpacing: '-.1px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                boxShadow: '0 4px 14px rgba(124,58,237,.28)',
                transition: 'transform .15s, box-shadow .2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(124,58,237,.4)' }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 4px 14px rgba(124,58,237,.28)' }}
            >
              Recargar página
            </button>
            <button
              onClick={this.handleReset}
              style={{
                padding: '12px 22px',
                borderRadius: 11,
                border: '1.5px solid #E5E7EB',
                background: '#fff',
                color: '#374151',
                fontWeight: 600,
                fontSize: 13.5,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'border-color .15s, background .15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#7C3AED'; e.currentTarget.style.background = '#FAFAFB' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.background = '#fff' }}
            >
              Intentar de nuevo
            </button>
          </div>

          {/* Technical details (collapsed by default) */}
          {error && (
            <div style={{ marginTop: '1.5rem', textAlign: 'left' }}>
              <button
                onClick={this.toggleDetails}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted, #9ca3af)',
                  fontSize: '.8rem',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '.3rem',
                  margin: '0 auto',
                }}
              >
                <span style={{ transition: 'transform .2s', display: 'inline-block', transform: showDetails ? 'rotate(90deg)' : 'none' }}>›</span>
                {showDetails ? 'Ocultar detalles técnicos' : 'Ver detalles técnicos'}
              </button>
              {showDetails && (
                <>
                  <pre style={{
                    marginTop: '.75rem',
                    padding: '.875rem',
                    background: 'var(--bg, #f3f4f6)',
                    borderRadius: 8,
                    fontSize: '.72rem',
                    color: '#dc2626',
                    overflowX: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    maxHeight: 200,
                    overflowY: 'auto',
                    lineHeight: 1.5,
                    textAlign: 'left',
                  }}>
                    {error?.message || 'Sin mensaje'}
                    {error?.stack ? '\n\n' + error.stack : ''}
                    {'\n\nURL: ' + (typeof window !== 'undefined' ? window.location.href : '?')}
                    {'\nUA: ' + (typeof navigator !== 'undefined' ? navigator.userAgent : '?')}
                  </pre>
                  <button
                    onClick={async () => {
                      try {
                        const txt = (error?.message || '') + '\n\n' + (error?.stack || '') + '\n\nURL: ' + window.location.href + '\nUA: ' + navigator.userAgent
                        await navigator.clipboard.writeText(txt)
                        this.setState({ copied: true })
                        setTimeout(() => this.setState({ copied: false }), 2500)
                      } catch { /* noop */ }
                    }}
                    style={{
                      marginTop: '.6rem',
                      background: this.state.copied ? '#16A34A' : '#7C3AED',
                      color: '#fff',
                      border: 'none',
                      padding: '8px 14px',
                      borderRadius: 8,
                      fontSize: '.75rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      width: '100%',
                    }}>
                    <i className="fa fa-copy" style={{ marginRight: 6 }} />
                    {this.state.copied ? 'Copiado ✓ Pegale a Anma por WhatsApp' : 'Copiar error completo (para diagnóstico)'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }
}
