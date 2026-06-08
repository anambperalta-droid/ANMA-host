import { useLocation } from 'react-router-dom'
import { getRouteKind } from '../../lib/routes'

export default function RouteFallback() {
  const loc = useLocation()
  const kind = getRouteKind(loc.pathname)
  if (kind === 'dashboard') return <DashboardSkeleton />
  if (kind === 'table')     return <TableSkeleton />
  if (kind === 'cards')     return <CardsSkeleton />
  if (kind === 'form')      return <FormSkeleton />
  return <DashboardSkeleton />
}

const sk = {
  base: { background: 'var(--surface2, #f3f4f6)', borderRadius: 10, animation: 'skPulse 1.4s ease infinite' },
  card: { background: 'var(--surface, #fff)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 12, padding: 16 },
}

function Bar({ w = '100%', h = 14, mb = 8, style }) {
  return <div style={{ ...sk.base, width: w, height: h, marginBottom: mb, ...style }} />
}

function DashboardSkeleton() {
  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <Bar w={150} h={24} mb={0} />
        <div style={{ flex: 1 }} />
        <Bar w={90} h={32} mb={0} />
        <Bar w={120} h={32} mb={0} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={sk.card}>
            <Bar w={70} h={10} mb={10} />
            <Bar w="60%" h={22} mb={8} />
            <Bar w={50} h={10} mb={0} />
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
        <div style={{ ...sk.card, height: 220 }} />
        <div style={{ ...sk.card, height: 220 }} />
      </div>
      <div style={sk.card}>
        <Bar w={140} h={14} mb={14} />
        {[1,2,3,4,5].map(i => (
          <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <Bar w={60} h={12} mb={0} />
            <Bar w="38%" h={12} mb={0} />
            <Bar w={70} h={12} mb={0} style={{ marginLeft: 'auto' }} />
            <Bar w={90} h={12} mb={0} />
          </div>
        ))}
      </div>
    </div>
  )
}

function TableSkeleton() {
  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Bar w={140} h={24} mb={0} />
        <div style={{ flex: 1 }} />
        <Bar w={90} h={36} mb={0} />
        <Bar w={110} h={36} mb={0} />
      </div>
      <Bar w={280} h={38} mb={4} />
      <div style={sk.card}>
        {[1,2,3,4,5,6].map(i => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: i < 6 ? '1px solid var(--border, #e5e7eb)' : 'none' }}>
            <div style={{ ...sk.base, width: 32, height: 32, borderRadius: '50%' }} />
            <div style={{ flex: 1 }}>
              <Bar w="45%" h={12} mb={6} />
              <Bar w="30%" h={10} mb={0} />
            </div>
            <Bar w={80} h={12} mb={0} />
            <Bar w={60} h={24} mb={0} style={{ borderRadius: 99 }} />
          </div>
        ))}
      </div>
    </div>
  )
}

function CardsSkeleton() {
  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Bar w={150} h={24} mb={0} />
        <div style={{ flex: 1 }} />
        <Bar w={110} h={36} mb={0} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 12 }}>
        {[1,2,3,4,5,6].map(i => (
          <div key={i} style={sk.card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ ...sk.base, width: 40, height: 40, borderRadius: 12 }} />
              <div style={{ flex: 1 }}>
                <Bar w="70%" h={12} mb={6} />
                <Bar w="50%" h={10} mb={0} />
              </div>
            </div>
            <Bar w="100%" h={10} mb={6} />
            <Bar w="80%" h={10} mb={0} />
          </div>
        ))}
      </div>
    </div>
  )
}

function FormSkeleton() {
  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 720 }}>
      <Bar w={180} h={24} mb={4} />
      <Bar w="60%" h={12} mb={12} />
      <div style={sk.card}>
        {[1,2,3,4,5].map(i => (
          <div key={i} style={{ marginBottom: 16 }}>
            <Bar w={120} h={10} mb={6} />
            <Bar w="100%" h={42} mb={0} />
          </div>
        ))}
        <Bar w={140} h={40} mb={0} style={{ marginTop: 8 }} />
      </div>
    </div>
  )
}
