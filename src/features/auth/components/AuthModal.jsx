import React from 'react'

export function AuthScreen({ onGoogle, gisReady, native, loading, error, onClose }) {
  return (
    <section className="auth-mini-card" onClick={event => event.stopPropagation()}>
      <button className="auth-mini-close-btn" onClick={onClose} disabled={loading} aria-label="Close auth">×</button>

      <div className="auth-header-wrapper">
        <h1 className="auth-title">
          <span>Sign in to</span> <em>OnePercentGoal</em>
        </h1>
      </div>

      <div className="google-auth-container" style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
        <button className="google-oauth-button" type="button" onClick={onGoogle} disabled={loading || (!native && !gisReady)}>
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M21.35 11.1H12v2.7h5.38c-.24 1.28-.96 2.37-2.04 3.1v2.58h3.29c1.92-1.77 3.02-4.38 3.02-7.38 0-.6-.05-1.2-.15-1.8Z" />
            <path fill="#34A853" d="M12 20.4c2.54 0 4.67-.84 6.23-2.28l-3.29-2.58c-.91.61-2.08.98-2.94.98-2.27 0-4.2-1.54-4.89-3.6H3.66v2.66A9.2 9.2 0 0 0 12 20.4Z" />
            <path fill="#FBBC05" d="M7.11 12.92a5.92 5.92 0 0 1 0-1.84V8.42H3.66a9.92 9.92 0 0 0 0 7.16l3.45-2.66Z" />
            <path fill="#EA4335" d="M12 5.28c1.38 0 2.62.47 3.59 1.4l2.69-2.69C16.66 2.5 14.54 1.8 12 1.8c-3.61 0-6.79 2.1-8.34 5.18l3.45 2.66c.69-2.06 2.62-3.6 4.89-3.6Z" />
          </svg>
          {loading ? 'Opening Google…' : native || gisReady ? 'Continue with Google' : 'Loading Google…'}
        </button>
      </div>

      {error && <p className="auth-error premium-auth-error">{error}</p>}
    </section>
  )
}

export default AuthScreen
