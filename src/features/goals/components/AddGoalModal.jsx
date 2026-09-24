import React, { useState } from 'react'
import { useEscapeKey } from '../../../hooks/useEscapeKey'

export function AddGoalModal({ isOpen, onClose, onSubmit, loading, deadline }) {
  const [title, setTitle] = useState('')
  useEscapeKey(onClose, !isOpen)

  if (!isOpen) return null

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <form 
        className="completion-modal" 
        onClick={event => event.stopPropagation()} 
        onSubmit={event => { 
          event.preventDefault()
          if (!title.trim()) return
          onSubmit(title)
          setTitle('')
        }}
      >
        <p className="eyebrow eyebrow-sm" style={{ color: '#c9f36a' }}>NEW GOAL</p>
        <h2 className="modal-title-lg">What is the sprint goal?</h2>
        
        {deadline && (
          <p className="goal-deadline" style={{ color: '#ff6b6b', fontFamily: '"DM Mono", monospace', fontSize: '11px', margin: '-12px 0 20px', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: '6px' }}>
            DEADLINE: {deadline.toUpperCase()}
          </p>
        )}
        
        <p className="auth-copy" style={{ marginBottom: '20px' }}>
          Define a clear, actionable goal. Small daily progress compounds into 1% achievements.
        </p>
        
        <label>
          Goal Title
          <input 
            autoFocus 
            required 
            maxLength={140} 
            value={title} 
            onChange={event => setTitle(event.target.value)} 
          />
        </label>
        
        <div className="modal-actions">
          <button type="button" className="modal-btn modal-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="modal-btn modal-btn-primary" disabled={loading}>
            {loading ? 'Saving…' : 'Add Target'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default AddGoalModal
