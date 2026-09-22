import React from 'react'
import { useEscapeKey } from '../../../hooks/useEscapeKey'

export function DeleteGoalConfirmModal({ goal, onCancel, onConfirm, loading = false }) {
  useEscapeKey(onCancel, !goal)
  if (!goal) return null

  return (
    <div className="modal-backdrop" role="presentation" onClick={loading ? undefined : onCancel}>
      <div className="completion-modal confirm-modal" onClick={event => event.stopPropagation()} style={{ maxWidth: '440px', padding: '28px' }}>
        <p className="eyebrow" style={{ color: '#ff6b6b' }}>DESTRUCTIVE ACTION</p>
        <h2 style={{ fontSize: '24px', marginBottom: '16px', fontWeight: '500', letterSpacing: '-.035em' }}>Delete Sprint Goal?</h2>
        
        <div className="confirm-summary-simple" style={{ display: 'block', width: '100%', boxSizing: 'border-box', background: '#171916', border: '1px solid #32352f', padding: '20px 24px', borderRadius: '6px', marginBottom: '24px', textAlign: 'center', wordBreak: 'break-word' }}>
          <span style={{ display: 'block', color: '#8e9189', fontFamily: '"DM Mono", monospace', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: '6px' }}>Goal to be deleted</span>
          <strong style={{ display: 'block', color: '#eef0e9', fontSize: '20px', fontWeight: '500', letterSpacing: '-.025em', lineHeight: '1.4' }}>{goal.title}</strong>
        </div>

        <p style={{ color: '#a5a79e', fontSize: '14px', lineHeight: 1.5, margin: '0 0 24px', textAlign: 'center' }}>
          This will permanently erase the goal and its compounding lineage from this active sprint and any rolled over cycles. This action cannot be undone.
        </p>
        
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
          <button
            type="button"
            onClick={onCancel}
            onPointerDown={(e) => e.stopPropagation()}
            disabled={loading}
            style={{ border: '0', background: 'none', color: '#8e9189', padding: '0', cursor: loading ? 'default' : 'pointer', fontSize: '12px' }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="add-button"
            disabled={loading}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onConfirm(goal)
            }}
            style={{
              background: '#ff6b6b',
              color: '#141513',
              border: 'none',
              borderRadius: '24px',
              padding: '10px 24px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? 'Deleting…' : 'Delete Goal'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default DeleteGoalConfirmModal
