import React from 'react'

export function AuthTransitionOverlay({ active, message }) {
  if (!active) return null

  return (
    <div className="auth-transition-overlay" role="status" aria-live="polite" aria-label={message}>
      <div className="auth-transition-panel">
        <span className="auth-transition-spinner" aria-hidden="true" />
        <div>
          <strong>{message}</strong>
          <span>Your dashboard is almost ready.</span>
        </div>
      </div>
    </div>
  )
}

export default AuthTransitionOverlay
