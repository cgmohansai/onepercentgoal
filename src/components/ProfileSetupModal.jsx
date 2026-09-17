import React, { useState } from 'react'

export function ProfileSetupModal({ user, onSubmit, loading, error }) {
  const [form, setForm] = useState({ username: user?.username || '', display_name: user?.display_name || '' })
  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="completion-modal"
        onSubmit={event => {
          event.preventDefault()
          onSubmit(form)
        }}
      >
        <p className="eyebrow">PROFILE SETUP</p>
        <h2>Choose a unique username</h2>
        <p className="auth-copy">This is the public handle other people will see. You can also set the display name used inside the app.</p>
        <label>
          Username
          <input
            autoFocus
            required
            minLength={3}
            maxLength={24}
            value={form.username}
            onChange={event => setForm(value => ({ ...value, username: event.target.value }))}
          />
        </label>
        <label>
          Display name
          <input
            required
            maxLength={80}
            value={form.display_name}
            onChange={event => setForm(value => ({ ...value, display_name: event.target.value }))}
          />
        </label>
        {error && <p className="auth-error">{error}</p>}
        <div>
          <button type="submit" disabled={loading}>
            {loading ? 'Saving…' : 'Continue'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default ProfileSetupModal
