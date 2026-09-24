import React, { useState } from 'react'
import { useEscapeKey } from '../../../hooks/useEscapeKey'

export function AddRoteModal({ isOpen, onClose, onSubmit }) {
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
        <p className="eyebrow" style={{ color: '#c9f36a' }}>FORCEFUL TASKS</p>
        <h2>Create a New Routine Rote</h2>
        <p className="auth-copy" style={{ marginBottom: '20px' }}>
          Completing unwanted tasks that you feel don't develop yourself (e.g. record writing, mandatory paperwork).
        </p>
        
        <label style={{ display: 'block', marginBottom: '24px' }}>
          Rote Title
          <input 
            autoFocus 
            required 
            maxLength={140} 
            value={title} 
            onChange={event => setTitle(event.target.value)} 
          />
        </label>

        <div className="modal-actions">
          <button type="button" className="modal-btn modal-btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="modal-btn modal-btn-primary">Create Rote</button>
        </div>
      </form>
    </div>
  )
}

export default AddRoteModal
