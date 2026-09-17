import React, { useState, useEffect } from 'react'
import { useEscapeKey } from '../hooks/useEscapeKey'

export function EditProfileModal({ isOpen, onClose, user, onSubmit, loading, error }) {
  const [form, setForm] = useState({
    username: user?.username || '',
    display_name: user?.display_name || '',
    bio: user?.bio || ''
  })

  useEffect(() => {
    if (user) {
      setForm({
        username: user.username || '',
        display_name: user.display_name || '',
        bio: user.bio || ''
      })
    }
  }, [user])

  useEscapeKey(onClose, !isOpen)

  if (!isOpen) return null

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <form 
        className="completion-modal" 
        onClick={event => event.stopPropagation()} 
        onSubmit={event => { 
          event.preventDefault()
          onSubmit(form.username, form.display_name, form.bio)
        }}
      >
        <p className="eyebrow" style={{ color: '#c9f36a' }}>EDIT PROFILE</p>
        <h2>Update your public identity</h2>
        
        <label>
          Username
          <input 
            required 
            minLength={3} 
            maxLength={24} 
            value={form.username} 
            onChange={event => setForm(value => ({ ...value, username: event.target.value }))} 
          />
        </label>
        
        <label>
          Display Name
          <input 
            required 
            maxLength={80} 
            value={form.display_name} 
            onChange={event => setForm(value => ({ ...value, display_name: event.target.value }))} 
          />
        </label>

        <label>
          Bio
          <textarea 
            maxLength={160} 
            placeholder="A brief bio about your sprint drive, goals, or lifestyle..."
            value={form.bio} 
            onChange={event => setForm(value => ({ ...value, bio: event.target.value }))} 
            style={{
              width: '100%',
              minHeight: '80px',
              background: '#141613',
              border: '1px solid #343630',
              borderRadius: '6px',
              padding: '12px',
              color: '#eef0e9',
              fontFamily: 'inherit',
              fontSize: '13px',
              resize: 'none',
              boxSizing: 'border-box',
              marginTop: '6px'
            }}
          />
        </label>

        {error && <p className="auth-error">{error}</p>}
        
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
            {loading ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default EditProfileModal
