import React from 'react'
import SpotlightNavbar from './SpotlightNavbar'

export function NotFoundPage({
  title = 'Page Not Found',
  subtitle = 'Page not found',
  buttonText = 'Go Home',
  onGoHome,
  headerHidden = false,
}) {
  const handleGoHome = () => {
    if (onGoHome) {
      onGoHome()
    } else {
      window.location.href = '/'
    }
  }

  return (
    <main className="app-shell">
      <header className={`shell-header ${headerHidden ? 'header-hidden' : ''}`}>
        <SpotlightNavbar
          items={[{ label: 'Join OnePercentGoal', href: '#join', onClick: handleGoHome }]}
        />
      </header>

      <section
        className="content profile-not-found-section"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 'calc(100vh - 120px)',
          textAlign: 'center',
          padding: '20px'
        }}
      >
        <div
          className="profile-not-found-card"
          style={{
            maxWidth: '420px',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <h2 style={{ color: '#ff6b6b', fontSize: '32px', fontWeight: 600, letterSpacing: '-0.03em', margin: '0 0 8px' }}>
            {title}
          </h2>
          <p style={{ color: '#8c9085', fontFamily: '"DM Mono", monospace', fontSize: '15px', margin: '0 0 24px' }}>
            {subtitle}
          </p>
          <button
            type="button"
            className="profile-edit-btn not-found-home-btn"
            style={{
              borderRadius: '9999px',
              padding: '10px 28px',
              fontSize: '14px',
              cursor: 'pointer',
              flex: 'none',
              width: 'auto',
              maxWidth: 'max-content'
            }}
            onClick={handleGoHome}
          >
            {buttonText}
          </button>
        </div>
      </section>
    </main>
  )
}

export default NotFoundPage
