import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function Bienvenida() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    async function detectSession() {
      // 1) PKCE flow: ?code= in query params
      const url = new URL(window.location.href)
      const code = url.searchParams.get('code')
      if (code) {
        const { error: codeErr } = await supabase.auth.exchangeCodeForSession(code)
        if (codeErr) {
          setError('El enlace de invitacion expiro o es invalido.')
          setLoading(false)
          return
        }
        window.history.replaceState(null, '', window.location.pathname)
        setSessionReady(true)
        setLoading(false)
        return
      }

      // 2) Implicit flow: #access_token= in hash
      const hash = window.location.hash
      if (hash && hash.includes('access_token')) {
        const params = new URLSearchParams(hash.substring(1))
        const accessToken = params.get('access_token')
        const refreshToken = params.get('refresh_token')
        if (accessToken && refreshToken) {
          const { error: sessErr } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (sessErr) {
            setError('El enlace de invitacion expiro o es invalido.')
            setLoading(false)
            return
          }
          window.history.replaceState(null, '', window.location.pathname)
          setSessionReady(true)
          setLoading(false)
          return
        }
      }

      // 3) Token hash flow (email OTP): ?token_hash=&type=
      const tokenHash = url.searchParams.get('token_hash')
      const type = url.searchParams.get('type')
      if (tokenHash && type) {
        const { error: otpErr } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type,
        })
        if (otpErr) {
          setError('El enlace de invitacion expiro o es invalido.')
          setLoading(false)
          return
        }
        window.history.replaceState(null, '', window.location.pathname)
        setSessionReady(true)
        setLoading(false)
        return
      }

      // 4) Already has a session (user refreshed the page)
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setSessionReady(true)
        setLoading(false)
        return
      }

      // 5) Let Supabase auto-detect from URL (fallback)
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION')) {
          setSessionReady(true)
          setLoading(false)
          subscription.unsubscribe()
        }
      })

      // Timeout: if nothing detected in 3s, show error
      setTimeout(() => {
        setLoading((prev) => {
          if (prev) {
            setError('No se detecto una invitacion valida. Solicita un nuevo enlace al administrador.')
            subscription.unsubscribe()
            return false
          }
          return prev
        })
      }, 3000)
    }

    detectSession()
  }, [])

  const handleSubmit = async () => {
    setError('')
    if (!password || !confirm) { setError('Completa ambos campos.'); return }
    if (password.length < 6) { setError('Minimo 6 caracteres.'); return }
    if (password !== confirm) { setError('Las contraseñas no coinciden.'); return }
    setSubmitting(true)
    const { data: updated, error: updateErr } = await supabase.auth.updateUser({ password })
    if (updateErr) {
      setError(updateErr.message)
      setSubmitting(false)
      return
    }
    // Si el invitado pertenece a otro sitio, mandarlo alli.
    const siteMeta = updated?.user?.user_metadata?.invited_to_site
    const currentHost = window.location.hostname
    const hubHost = 'anma-hub.vercel.app'
    const hostHost = 'anma-host.vercel.app'
    if (siteMeta === 'hub' && currentHost !== hubHost && currentHost !== 'localhost') {
      window.location.replace(`https://${hubHost}/`)
      return
    }
    if (siteMeta === 'host' && currentHost !== hostHost && currentHost !== 'localhost') {
      window.location.replace(`https://${hostHost}/`)
      return
    }
    navigate('/', { replace: true })
  }

  const handleKey = (e) => { if (e.key === 'Enter') handleSubmit() }

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.logo}>AN</div>
          <p style={styles.subtitle}>Verificando invitacion...</p>
          <div className="sk sk-kpi" style={{ height: 40, width: '100%' }} />
        </div>
      </div>
    )
  }

  if (!sessionReady) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.logo}>AN</div>
          <h1 style={styles.title}>Enlace Invalido</h1>
          <p style={styles.subtitle}>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>AN</div>
        <h1 style={styles.title}>Bienvenido a ANMA</h1>
        <p style={styles.subtitle}>Elige tu contraseña para comenzar</p>

        {error && (
          <div style={styles.error}>
            <i className="fa fa-circle-exclamation" /> {error}
          </div>
        )}

        <div className="form-group fg" style={{ width: '100%' }}>
          <label className="f-lbl">Elegir Contraseña</label>
          <div className="f-wrap">
            <input
              type={showPwd ? 'text' : 'password'}
              className="f-inp"
              placeholder="Minimo 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKey}
              autoComplete="new-password"
              style={{ paddingRight: 44 }}
            />
            <button className="eye-btn" type="button" onClick={() => setShowPwd(!showPwd)}>
              <i className={`fa ${showPwd ? 'fa-eye-slash' : 'fa-eye'}`} />
            </button>
          </div>
        </div>

        <div className="form-group fg" style={{ width: '100%' }}>
          <label className="f-lbl">Confirmar Contraseña</label>
          <input
            type={showPwd ? 'text' : 'password'}
            className="f-inp"
            placeholder="Repeti la contraseña"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={handleKey}
            autoComplete="new-password"
          />
        </div>

        <button
          className="btn-login"
          onClick={handleSubmit}
          disabled={submitting}
          style={{ width: '100%', marginTop: 8, opacity: submitting ? 0.6 : 1 }}
        >
          {submitting ? (
            <><i className="fa fa-spinner fa-spin" /> Configurando...</>
          ) : (
            <><i className="fa fa-rocket" /> Comenzar</>
          )}
        </button>
      </div>
    </div>
  )
}

const styles = {
  container: {
    position: 'fixed', inset: 0, zIndex: 9999,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a3e 50%, #0f0f23 100%)',
  },
  card: {
    background: 'var(--c-surface, #1e1e2e)',
    borderRadius: 16, padding: '48px 40px',
    width: '100%', maxWidth: 420,
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  logo: {
    width: 64, height: 64, borderRadius: 16,
    background: 'linear-gradient(135deg, #7C3AED, #059669)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 24,
    letterSpacing: 2,
  },
  title: {
    margin: 0, fontSize: 24, fontWeight: 700,
    color: 'var(--c-text, #e2e8f0)',
  },
  subtitle: {
    margin: '8px 0 24px', fontSize: 14,
    color: 'var(--c-muted, #94a3b8)', textAlign: 'center',
  },
  error: {
    width: '100%', padding: '10px 14px', marginBottom: 16,
    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 8, color: '#f87171', fontSize: 13,
    display: 'flex', alignItems: 'center', gap: 8,
  },
}
