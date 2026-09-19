import React, { useState } from 'react'
import { ArrowRight } from '@phosphor-icons/react'
import AdaptiveLoader from './AdaptiveBootLoader'
import SpotlightNavbar from './SpotlightNavbar'
import NotFoundPage from './NotFoundPage'
import { formatDateOnly } from '../utils/dateUtils'
import SprintHistoryModal from '../features/timeline/components/SprintHistoryModal'
import GoalDetailsModal from '../features/goals/components/GoalDetailsModal'

export function PublicProfilePage({
  publicData,
  publicLoading,
  publicError,
  publicYear,
  setPublicYear,
  handleGoogle,
  headerHidden,
}) {
  const [selectedSprintModal, setSelectedSprintModal] = useState(null)
  const [selectedGoalDetails, setSelectedGoalDetails] = useState(null)
  if (publicLoading) {
    return <AdaptiveLoader text="Loading" />
  }

  if (publicError || !publicData) {
    return (
      <NotFoundPage
        title="Profile Not Found"
        subtitle="User not found"
        buttonText="Go Home"
        headerHidden={headerHidden}
      />
    )
  }

  return (
    <main className="app-shell">
      <header className={`shell-header ${headerHidden ? 'header-hidden' : ''}`}>
        <SpotlightNavbar items={[]} />
      </header>

      <section className="content" style={{ paddingBottom: '60px' }}>
        <div className="workspace-page profile-page-custom" style={{ animation: 'fadeIn 0.3s ease' }}>
            <header className="profile-page-header">
              <div className="profile-header-left" style={{ width: '100%' }}>
                <div className="profile-badge-row">
                  <span className="profile-badge">PUBLIC DASHBOARD</span>
                </div>
                <div className="profile-title-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '16px' }}>
                  <h1 className="profile-title" style={{ margin: 0, display: 'inline-flex', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                    <span className="title-main-text" style={{ whiteSpace: 'nowrap' }}>
                      User <em>Profile</em>
                    </span>
                  </h1>
                </div>
              </div>
            </header>

            {/* Profile Summary & Branding Grid */}
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
                          {publicData.user.display_name || publicData.user.username}
                        </h3>
                        <span className="profile-handle">@{publicData.user.username}</span>
                      </div>
                      <p className="profile-active-meta">
                        Active since sprint {String(publicData.user.active_since?.sprint_number ?? publicData.sprint).padStart(2, '0')} · {publicData.user.active_since?.year ?? publicYear}
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
                  className="goals-primary-add-btn public-join-cta-btn" 
                  onClick={() => {
                    window.location.href = '/'
                  }}
                >
                  <span>Join Now &amp; Document your growth!</span>
                  <ArrowRight size={14} weight="bold" />
                </button>
              </section>
            </div>

            {/* Cumulative Performance stats — oriented immediately under Hero Grid matching original profile */}
            <div className="profile-section-heading-wrap">
              <p className="eyebrow">CUMULATIVE PERFORMANCE</p>
              <h2 className="profile-section-title">
                Performance <em>Stats</em>
              </h2>
            </div>
            <section className="profile-combined-stats-card card">
              <div className="combined-stats-grid">
                <div className="combined-stat-item">
                  <small className="combined-stat-label">GOALS COMPLETED</small>
                  <b className="combined-stat-value">{publicData.stats.goals_completed}</b>
                  <span className="combined-stat-desc">out of {publicData.stats.total_goals} unique</span>
                </div>
                <div className="combined-stat-item">
                  <small className="combined-stat-label">COMPLETION RATE</small>
                  <b className="combined-stat-value">{publicData.stats.completion_rate}%</b>
                  <span className="combined-stat-desc">overall performance</span>
                </div>
                <div className="combined-stat-item">
                  <small className="combined-stat-label">CURRENT STREAK</small>
                  <b className="combined-stat-value">{publicData.stats.current_streak}</b>
                  <span className="combined-stat-desc">sprints streak | Best - {publicData.stats.longest_streak}</span>
                </div>
                <div className="combined-stat-item">
                  <small className="combined-stat-label">LONGEST STREAK</small>
                  <b className="combined-stat-value">{publicData.stats.longest_streak}</b>
                  <span className="combined-stat-desc">sprints record</span>
                </div>
              </div>
            </section>

            {/* Active Sprint Goals Section */}
            <div className="profile-section-heading-wrap">
              <p className="eyebrow">CURRENT TARGETS</p>
              <h2 className="profile-section-title">
                Active Sprint <em>Goals</em>
                <span className="section-title-tag">
                  (Sprint #{publicData.sprint})
                </span>
              </h2>
            </div>
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

            {/* Timeline heat grid */}
            <div className="profile-section-heading-wrap">
              <p className="eyebrow">YEAR IN 100 SPRINTS</p>
              <h2 className="profile-section-title">
                Sprint <em>History</em>
              </h2>
            </div>
            <section className="timeline" style={{ marginBottom: '32px' }}>
              {publicData.history.sprints.map(summary => {
                const number = summary.sprint_number
                const state = number < publicData.sprint ? 'past' : number === publicData.sprint ? 'current' : ''
                const start = new Date(summary.sprint_start)
                const end = new Date(summary.sprint_end)
                const tileDateStr = `${formatDateOnly(start)} — ${formatDateOnly(end)}`
                return (
                  <div
                    className={`sprint-tile ${state}`}
                    key={number}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedSprintModal(summary)}
                  >
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

            {selectedSprintModal && (
              <SprintHistoryModal
                sprint={selectedSprintModal}
                onClose={() => setSelectedSprintModal(null)}
                onShowGoalDetails={goal => {
                  setSelectedGoalDetails({
                    title: goal.title,
                    completion_note: goal.completion_note || goal.completed_note || ''
                  })
                }}
              />
            )}

            {selectedGoalDetails && (
              <GoalDetailsModal
                goal={selectedGoalDetails}
                onClose={() => setSelectedGoalDetails(null)}
              />
            )}
          </div>
      </section>
    </main>
  )
}

export default PublicProfilePage
