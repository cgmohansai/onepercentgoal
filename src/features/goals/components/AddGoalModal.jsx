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
        <p className="eyebrow" style={{ color: '#c9f36a' }}>NEW COMPREHENSIVE TARGET</p>
        <h2>What do you want to achieve in this sprint?</h2>
        
        {deadline && (
          <p className="goal-deadline" style={{ color: '#ff6b6b', fontFamily: '"DM Mono", monospace', fontSize: '11px', margin: '-12px 0 20px', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '14px', lineHeight: 1 }}>⏳</span> DEADLINE: {deadline.toUpperCase()}
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
        
        <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
          <button 
            type="button" 
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid #343630',
              color: '#8c9085',
              borderRadius: '8px',
              padding: '10px 16px',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button 
            type="submit" 
            disabled={loading}
            style={{
              background: '#c9f36a',
              border: 'none',
              color: '#121411',
              borderRadius: '8px',
              padding: '10px 20px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {loading ? 'Saving…' : 'Add Target'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default AddGoalModal
