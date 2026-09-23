import React from 'react'
import { Ripple } from '../../../components/Ripple'

export function AuthTransitionOverlay({ active, message }) {
  if (!active) return null

  return (
    <div className="auth-transition-overlay" role="status" aria-live="polite" aria-label={message}>
      <div className="auth-transition-panel">
        <Ripple
          size={34}
          showDot={false}
          className="auth-transition-ripple"
          style={{ flex: '0 0 34px', color: '#c9f36a' }}
        />
        <div>
          <strong>{message}</strong>
          <span>Your dashboard is almost ready.</span>
        </div>
      </div>
    </div>
  )
}

export default AuthTransitionOverlay
