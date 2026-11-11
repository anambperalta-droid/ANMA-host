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
    <div className="page active guia-page" style={{
      animation: 'pgIn .25s ease both',
      padding: 0, margin: 0,
      height: 'calc(100vh - 56px)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* El alto fijo no descontaba el bottom-nav flotante (78px en <=768),
          asi que los ultimos 78px de la guia quedaban abajo de la barra. */}
      <style>{`
        @media(max-width:768px){
          .guia-page{height:calc(100vh - 56px - 78px - env(safe-area-inset-bottom))!important}
        }
      `}</style>
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
