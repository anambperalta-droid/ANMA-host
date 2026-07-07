import { useState, useRef, useEffect } from 'react'
import MoneyInput from './MoneyInput'

/**
 * ANMA — QuickProductModal
 * ────────────────────────
 * Modal ULTRA rápido para cargar un producto sin escoger categoría, proveedor,
 * imagen ni margen. Solo Nombre + Costo (opcional). Ideal para el vendedor que
 * viene de Excel y necesita meter 20 productos en 5 minutos.
 *
 * Después el usuario puede editar la ficha completa desde el catálogo si quiere
 * agregar más info. Filosofía: no obligar decisiones al momento de cargar.
 *
 * Props:
 *   open        — bool, controla visibilidad
 *   onClose()   — cierra el modal
 *   onSave(payload) — recibe { name, cost }; también dispara cuando se elige
 *                     "Guardar + otro" (el modal queda abierto y limpio)
 *   defaultCat  — opcional, categoría default heredada si venís del catálogo
 */

const num = (v) => Number(v) || 0

export default function QuickProductModal({ open, onClose, onSave, defaultCat = '' }) {
  const [name, setName] = useState('')
  const [cost, setCost] = useState('')
  const nameRef = useRef(null)

  useEffect(() => {
    if (open) {
      setName(''); setCost('')
      setTimeout(() => nameRef.current?.focus(), 30)
    }
  }, [open])

  const canSave = name.trim().length > 0

  const handleSave = ({ keepOpen = false } = {}) => {
    if (!canSave) return
    onSave({
      name: name.trim(),
      cost: num(cost),
      cat: defaultCat,
    }, { keepOpen })
    if (keepOpen) {
      setName(''); setCost('')
      setTimeout(() => nameRef.current?.focus(), 30)
    } else {
      onClose()
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && canSave) {
      e.preventDefault()
      if (e.shiftKey || e.ctrlKey || e.metaKey) handleSave({ keepOpen: true })
      else handleSave({ keepOpen: false })
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!open) return null

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 700,
        background: 'rgba(15,12,60,.45)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onKeyDown={handleKey}
        style={{
          background: 'var(--surface)', borderRadius: 16,
          border: '1px solid var(--border)',
          boxShadow: '0 20px 60px rgba(0,0,0,.25)',
          padding: 22, width: '100%', maxWidth: 420,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #FBBF24, #F59E0B)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <i className="fa fa-bolt" style={{ color: '#fff', fontSize: 15 }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)' }}>Cargar producto rápido</div>
            <div style={{ fontSize: 11.5, color: 'var(--txt3)', marginTop: 1 }}>Solo lo esencial — el resto lo editás después</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--txt3)', fontSize: 16, cursor: 'pointer', padding: 4 }} aria-label="Cerrar">
            <i className="fa fa-xmark" />
          </button>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--txt2)', marginBottom: 5 }}>
            Nombre <span style={{ color: '#DC2626' }}>*</span>
          </label>
          <input
            ref={nameRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Termo Stanley 500ml"
            style={{
              width: '100%', padding: '10px 12px',
              border: '1.5px solid var(--border)', borderRadius: 8,
              fontSize: 14, color: 'var(--txt)', background: 'var(--surface)',
              outline: 'none', boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--txt2)', marginBottom: 5 }}>
            Costo <span style={{ fontWeight: 400, color: 'var(--txt4)' }}>(opcional — podés dejarlo en 0 y completarlo después)</span>
          </label>
          <MoneyInput
            value={cost === '' ? '' : Number(cost)}
            onChange={(v) => setCost(v)}
            allowEmpty
            placeholder="0"
            style={{ maxWidth: 220 }}
          />
        </div>

        <div style={{
          fontSize: 11, color: 'var(--txt3)',
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '8px 10px', marginBottom: 14,
          lineHeight: 1.45,
        }}>
          <i className="fa fa-lightbulb" style={{ color: '#F59E0B', marginRight: 6 }} />
          <b>Enter</b> guarda y cierra · <b>Shift+Enter</b> guarda y carga otro · <b>Esc</b> cancela
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '9px 16px', borderRadius: 8,
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--txt2)', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={() => handleSave({ keepOpen: true })}
            disabled={!canSave}
            style={{
              padding: '9px 14px', borderRadius: 8,
              background: 'transparent', border: '1.5px solid var(--brand)',
              color: canSave ? 'var(--brand)' : 'var(--txt4)',
              fontSize: 13, fontWeight: 700,
              cursor: canSave ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
              opacity: canSave ? 1 : .5,
            }}
          >
            <i className="fa fa-plus" style={{ marginRight: 5 }} />Guardar + otro
          </button>
          <button
            onClick={() => handleSave({ keepOpen: false })}
            disabled={!canSave}
            style={{
              padding: '9px 16px', borderRadius: 8,
              background: canSave ? 'linear-gradient(135deg, #FBBF24, #F59E0B)' : 'var(--surface3)',
              color: canSave ? '#fff' : 'var(--txt4)',
              border: 'none', fontSize: 13, fontWeight: 800,
              cursor: canSave ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
              boxShadow: canSave ? '0 4px 14px rgba(245,158,11,.35)' : 'none',
              opacity: canSave ? 1 : .5,
            }}
          >
            <i className="fa fa-bolt" style={{ marginRight: 5 }} />Guardar
          </button>
        </div>
      </div>
    </div>
  )
}
