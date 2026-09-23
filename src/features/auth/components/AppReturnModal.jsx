import React from 'react'
import { useEscapeKey } from '../../../hooks/useEscapeKey'

export function AppReturnModal({ appReturnFlow, onClose }) {
  useEscapeKey(onClose, !appReturnFlow)
  if (!appReturnFlow) return null

  return (
    <div className="modal-backdrop" role="presentation" style={{ zIndex: 9999 }}>
      <div className="completion-modal confirm-modal" onClick={event => event.stopPropagation()} style={{ maxWidth: '440px', padding: '28px', textAlign: 'center' }}>
        <p className="eyebrow" style={{ color: '#c9f36a' }}>SIGN-IN COMPLETE</p>
        <h2 style={{ fontSize: '24px', marginBottom: '12px', fontWeight: '500', letterSpacing: '-.035em' }}>Welcome to OnePercentGoal!</h2>
        <p style={{ color: '#a5a79e', fontSize: '14px', lineHeight: 1.5, margin: '0 0 24px' }}>
          Your Google account is verified. Tap below to return to the Android app, or continue in your browser.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
          <a
            href={appReturnFlow.appUrl}
            className="add-button"
            onClick={onClose}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              textDecoration: 'none',
              background: '#c9f36a',
              color: '#141513',
              borderRadius: '24px',
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: '600',
              boxSizing: 'border-box'
            }}
          >
            Open OnePercentGoal App
          </a>
          <button
            type="button"
            onClick={onClose}
          >
            Continue in Browser
          </button>
        </div>
      </div>
    </div>
  )
}

export default AppReturnModal
