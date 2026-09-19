import React from 'react'
import AdaptiveLoader from './AdaptiveBootLoader'
import SpotlightNavbar from './SpotlightNavbar'
import { formatDateOnly } from '../utils/dateUtils'

export function PublicProfilePage({
  publicData,
  publicLoading,
  publicError,
  publicYear,
  setPublicYear,
  handleGoogle,
  headerHidden,
}) {
  if (publicLoading) {
    return <AdaptiveLoader text="Loading" />
  }

  if (publicError || !publicData) {
    return (
      <main className="app-shell">
        <header className={`shell-header ${headerHidden ? 'header-hidden' : ''}`}>
          <SpotlightNavbar
            items={[{ label: 'Join OnePercentGoal', href: '#join', onClick: () => (window.location.href = '/') }]}
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
              Profile Not Found
            </h2>
            <p style={{ color: '#8c9085', fontFamily: '"DM Mono", monospace', fontSize: '15px', margin: '0 0 24px' }}>
              User not found
            </p>
            <button
              type="button"
              className="profile-edit-btn"
              style={{ borderRadius: '9999px', padding: '10px 28px', fontSize: '14px', cursor: 'pointer' }}
              onClick={() => (window.location.href = '/')}
            >
              Go Home
            </button>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className={`shell-header ${headerHidden ? 'header-hidden' : ''}`}>
        <SpotlightNavbar
          items={[{ label: 'Join OnePercentGoal', href: '#join', onClick: () => (window.location.href = '/') }]}
        />
      </header>

      <section className="content" style={{ paddingBottom: '60px' }}>
        <div className="workspace-page" style={{ animation: 'fadeIn 0.3s ease' }}>
            <header className="profile-page-header">
              <div className="profile-header-left">
                <span className="profile-badge">PUBLIC SPRINT PROFILE</span>
                <h1 className="profile-title">
                  @{publicData.user.username}<em>'s dashboard</em>
                </h1>
              </div>
            </header>

            {/* 3-Column Profile Summary & Branding Grid */}
            <div className="profile-hero-grid">
              <section className="profile-hero card compact-hero">
                <div className="profile-hero-top-row">
                  <div className="profile-user-left">
                    <div className="profile-avatar compact-avatar">
                      {publicData.user.profile_photo ? (
                        <img src={publicData.user.profile_photo} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Profile" />
                      ) : (
                        (publicData.user.display_name || publicData.user.username || 'U').slice(0, 1).toUpperCase()
                      )}
                    </div>
                    
                    <div className="profile-meta-compact">
                      <div className="profile-name-row">
                        <h3 className="profile-display-name">
                          {publicData.user.display_name}
                        </h3>
                        <span className="profile-handle">@{publicData.user.username}</span>
                      </div>
                      <p className="profile-active-meta">
                        Active since sprint {String(publicData.user.active_since.sprint_number).padStart(2, '0')} · {publicData.user.active_since.year}
                      </p>
                    </div>
                  </div>

                  <div className="profile-col-progress compact-progress">
                    <span>{publicData.stats.completion_rate}%</span>
                    <small>Completion Rate</small>
                  </div>
                </div>

                {publicData.user.bio && (
                  <div className="profile-bio-dynamic">
                    <span className="bio-label">BIO</span>
                    <p className="bio-content-text">{publicData.user.bio}</p>
                  </div>
                )}
              </section>

              {/* Right side OnePercentGoal branding card */}
              <section className="profile-brand-card card">
                <div className="profile-brand-header-row">
                  <div className="profile-brand-logo-wrap">
                    <img
                      src="/favicon.ico"
                      alt="OnePercentGoal"
                      className="profile-brand-logo-img"
                    />
                  </div>
                  <span className="profile-brand-title">OnePercentGoal</span>
                </div>
                <div className="profile-brand-subtitle">100 SPRINTS · 3.6 DAYS EACH · 37.78X ANNUAL YIELD</div>
                <p className="profile-brand-tagline">Make every 1% count.</p>
                <button 
                  className="goals-primary-add-btn" 
                  style={{ marginTop: '16px', display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                  onClick={handleGoogle}
                >
                  Join Now →
                </button>
              </section>
            </div>

            {/* Active Sprint Goals Section */}
            <h2 style={{ fontSize: '20px', fontWeight: 500, margin: '32px 0 16px', letterSpacing: '-0.02em', color: '#eef0e9' }}>
              Active Sprint Goals <span style={{ color: '#8c9085', fontSize: '13px', fontWeight: 'normal', marginLeft: '8px' }}>(Sprint #{publicData.sprint})</span>
            </h2>
            <section className="all-goals card" style={{ marginBottom: '32px' }}>
              {publicData.goals.length === 0 ? (
                <p style={{ color: '#8c9085', margin: 0, fontStyle: 'italic', padding: '16px' }}>No active goals for this sprint.</p>
              ) : (
                <div className="goal-list">
                  {publicData.goals.map(goal => (
                    <div className="goal" key={goal.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px' }}>
                      <div className="goal-content" style={{ flex: 1 }}>
                        <span style={{ fontSize: '15px', color: goal.completed ? '#8c9085' : '#eef0e9', textDecoration: goal.completed ? 'line-through' : 'none' }}>
                          {goal.title}
                        </span>
                        <span style={{ fontSize: '11px', color: '#676a62', fontFamily: '"DM Mono", monospace' }}>
                          PROGRESS: {goal.progress} / {goal.target}
                        </span>
                      </div>
                      <span style={{
                        color: goal.completed ? '#c9f36a' : '#8c9085',
                        fontSize: '12px',
                        fontFamily: '"DM Mono", monospace',
                        fontWeight: 600,
                        border: `1px solid ${goal.completed ? 'rgba(201, 243, 106, 0.3)' : '#343630'}`,
                        padding: '4px 8px',
                        borderRadius: '4px',
                        background: goal.completed ? 'rgba(201, 243, 106, 0.05)' : 'transparent'
                      }}>
                        {goal.completed ? 'DONE' : 'ACTIVE'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Cumulative stats */}
            <h2 style={{ fontSize: '20px', fontWeight: 500, margin: '0 0 16px', letterSpacing: '-0.02em', color: '#eef0e9' }}>Performance Stats</h2>
            <div className="profile-stats" style={{ marginBottom: '32px' }}>
              <div className="metric card"><small>GOALS COMPLETED</small><b>{publicData.stats.goals_completed}</b><span>out of {publicData.stats.total_goals} unique</span></div>
              <div className="metric card"><small>COMPLETION RATE</small><b>{publicData.stats.completion_rate}%</b><span>overall performance</span></div>
              <div className="metric card"><small>CURRENT STREAK</small><b>{publicData.stats.current_streak}</b><span>successful sprints</span></div>
              <div className="metric card"><small>LONGEST STREAK</small><b>{publicData.stats.longest_streak}</b><span>sprints record</span></div>
            </div>

            {/* Timeline heat grid */}
            <h2 style={{ fontSize: '20px', fontWeight: 500, margin: '0 0 16px', letterSpacing: '-0.02em', color: '#eef0e9' }}>Sprint History</h2>
            <section className="timeline" style={{ marginBottom: '32px' }}>
              {publicData.history.sprints.map(summary => {
                const number = summary.sprint_number
                const state = number < publicData.sprint ? 'past' : number === publicData.sprint ? 'current' : ''
                const start = new Date(summary.sprint_start)
                const end = new Date(summary.sprint_end)
                const tileDateStr = `${formatDateOnly(start)} — ${formatDateOnly(end)}`
                return (
                  <div className={`sprint-tile ${state}`} key={number} style={{ cursor: 'default' }}>
                    <span>SPRINT</span>
                    <b>
                      #{String(number).padStart(2, '0')}
                      <span className="sprint-tile-dates">({tileDateStr})</span>
                    </b>
                    <small>{summary.completed_count} done</small>
                    <strong>{summary.average_progress}% avg</strong>
                    {state === 'current' && <i>NOW</i>}
                  </div>
                )
              })}
            </section>

            {/* Timeline Years */}
            <div className="timeline-years">
              {publicData.history.years.map(yr => (
                <button key={yr} className={yr === publicYear ? 'timeline-year active' : 'timeline-year'} onClick={() => setPublicYear(yr)}>
                  {yr}
                </button>
              ))}
            </div>
          </div>
      </section>
    </main>
  )
}

export default PublicProfilePage
