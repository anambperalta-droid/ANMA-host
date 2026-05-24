import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, showDetails: false }
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
        background: 'var(--bg, #f8f7ff)',
        padding: '1.5rem',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
      }}>
        <div style={{
          maxWidth: 480,
          width: '100%',
          background: 'var(--surface, #fff)',
          borderRadius: 16,
          boxShadow: '0 4px 32px rgba(124,58,237,.10)',
          padding: '2.5rem 2rem',
          textAlign: 'center',
        }}>
          {/* Icon */}
          <div style={{
            width: 64, height: 64,
            borderRadius: '50%',
            background: 'linear-gradient(135deg,#7c3aed22,#a78bfa33)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1.25rem',
            fontSize: 28,
          }}>
            ⚠️
          </div>

          {/* Title */}
          <h2 style={{
            margin: '0 0 .5rem',
            fontSize: '1.25rem',
            fontWeight: 700,
            color: 'var(--text, #1e1b4b)',
          }}>
            Algo salió mal
          </h2>

          {/* Subtitle */}
          <p style={{
            margin: '0 0 1.75rem',
            fontSize: '.9rem',
            color: 'var(--text-muted, #6b7280)',
            lineHeight: 1.5,
          }}>
            Ocurrió un error inesperado en esta sección.<br />
            Podés recargar la página o intentar de nuevo.
          </p>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={this.handleReload}
              style={{
                padding: '.6rem 1.4rem',
                borderRadius: 8,
                border: 'none',
                background: 'linear-gradient(135deg,#7c3aed,#a78bfa)',
                color: '#fff',
                fontWeight: 600,
                fontSize: '.875rem',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(124,58,237,.25)',
              }}
            >
              Recargar página
            </button>
            <button
              onClick={this.handleReset}
              style={{
                padding: '.6rem 1.4rem',
                borderRadius: 8,
                border: '1.5px solid var(--border, #e5e7eb)',
                background: 'transparent',
                color: 'var(--text, #374151)',
                fontWeight: 600,
                fontSize: '.875rem',
                cursor: 'pointer',
              }}
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
                }}>
                  {error.message}
                  {error.stack ? '\n\n' + error.stack : ''}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }
}
