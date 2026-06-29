/**
 * Guía completa de la app — versión interna (post-login).
 *
 * Renderiza la guía estática (/recursos/guia.html) dentro de un iframe
 * de altura completa. Single source of truth: el HTML se mantiene en
 * public/recursos/guia.html y se sirve igual para visitantes públicos
 * que para usuarios autenticados.
 */
export default function Guia() {
  return (
    <div className="page active" style={{
      animation: 'pgIn .25s ease both',
      padding: 0, margin: 0,
      height: 'calc(100vh - 56px)',
      display: 'flex', flexDirection: 'column',
    }}>
      <iframe
        src="/recursos/guia.html"
        title="Guía completa de ANMA Regalos"
        style={{
          width: '100%', height: '100%',
          border: 'none', display: 'block', flex: 1,
        }}
      />
    </div>
  )
}
