import React from 'react'
import { useEscapeKey } from '../../../hooks/useEscapeKey'

export function DeleteGoalConfirmModal({ goal, onCancel, onConfirm, loading = false }) {
  const [isDeleting, setIsDeleting] = React.useState(false)
  useEscapeKey(onCancel, !goal)
  if (!goal) return null

  const isLoading = loading || isDeleting

  const handleConfirm = async (e) => {
    e.stopPropagation()
    setIsDeleting(true)
    try {
      await onConfirm(goal)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={isLoading ? undefined : onCancel}>
      <div className="completion-modal confirm-modal" onClick={event => event.stopPropagation()} style={{ maxWidth: '440px', padding: '28px' }}>
        <h2 className="modal-title-lg" style={{ marginBottom: '16px' }}>Delete Sprint Goal?</h2>
        
        <div className="confirm-summary-simple" style={{ display: 'block', width: '100%', boxSizing: 'border-box', background: '#171916', border: '1px solid #32352f', padding: '20px 24px', borderRadius: '6px', marginBottom: '24px', textAlign: 'center', wordBreak: 'break-word' }}>
          <span style={{ display: 'block', color: '#8e9189', fontFamily: '"DM Mono", monospace', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: '6px' }}>Goal to be deleted</span>
          <strong className="confirm-goal-title" style={{ display: 'block', color: '#eef0e9', fontWeight: '500', letterSpacing: '-.025em', lineHeight: '1.4' }}>{goal.title}</strong>
        </div>

        <p style={{ color: '#a5a79e', fontSize: '14px', lineHeight: 1.5, margin: '0 0 24px', textAlign: 'center' }}>
          Deleting this goal permanently erases its entire history and progress from all sprints. This cannot be undone.
        </p>
        
        <div className="modal-actions center-actions">
          <button
            type="button"
            className="modal-btn modal-btn-secondary"
            onClick={onCancel}
            onPointerDown={(e) => e.stopPropagation()}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="button"
            className="modal-btn modal-btn-danger"
            disabled={isLoading}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleConfirm}
          >
            {isLoading ? 'Deleting…' : 'Delete Goal'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default DeleteGoalConfirmModal
