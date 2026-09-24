import React, { Suspense, useEffect } from 'react'
import { Target, Repeat, ArrowRight } from '@phosphor-icons/react'
import { lazyWithStaleRetry } from '../utils/lazyStaleRetry'
const Silk = lazyWithStaleRetry(() => import('../Silk'))
import SpecularButton from '../SpecularButton'
import AnimatedPlusButton from '../AnimatedPlusButton'
import MorphText from './MorphText'
import LiveYearNumber from './LiveYearNumber'
import UrgencyConsole from './UrgencyConsole'
import AppFooter from './AppFooter'
import { MOTIVATIONAL_QUOTES } from '../constants/quotes'
import { getSprintBoundary, formatDateWithTime } from '../utils/dateUtils'

export function OverviewPage({
  userLabel,
  greeting,
  data,
  now,
  goals,
  completeGoals,
  streak,
  avgActiveProgress = 0,
  quoteIndices,
  roteOverviewStats,
  setActive,
  setAddGoalModalOpen,
  showGoalDetails,
  toggleRoteFromOverview,
  isGoalsLoading = false,
}) {
  useEffect(() => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    } catch {
      window.scrollTo(0, 0)
    }
    const contentEl = document.querySelector('.content')
    if (contentEl) {
      contentEl.scrollTop = 0
      contentEl.scrollLeft = 0
    }
  }, [])
  const sprintNum = (data.percentage && data.percentage > 0)
    ? Math.min(100, Math.max(1, Math.floor(data.percentage)))
    : (data.sprint_number || data.sprint || 1)
  const sprintStart = data.sprintStart || getSprintBoundary(data.year, sprintNum - 1)
  const sprintEnd = data.checkpointEnd || getSprintBoundary(data.year, sprintNum)
  const sprintDuration = sprintEnd.getTime() - sprintStart.getTime()
  const sprintElapsed = now.getTime() - sprintStart.getTime()
  const sprintPercent = Math.min(100, Math.max(0, (sprintElapsed / sprintDuration) * 100)).toFixed(2)
  const yearPercent = Math.min(100, Math.max(0, data.percentage || 0)).toFixed(2)

  const nextSprintMs = Math.max(0, sprintEnd.getTime() - now.getTime())
  const secondsLeft = Math.floor(nextSprintMs / 1000)
  const daysLeft = Math.floor(secondsLeft / 86400)
  const hoursLeft = Math.floor((secondsLeft % 86400) / 3600)
  const minutesLeft = Math.floor((secondsLeft % 3600) / 60)
  const secsLeft = secondsLeft % 60
  const day = data.day

  return (
    <>
      <section className="aurora-hero-wrapper">
        <div className="silk-bg-container" aria-hidden="true">
          <Suspense fallback={null}>
            <Silk
              speed={5}
              scale={1}
              color="#366cf3"
              noiseIntensity={1.5}
              rotation={0}
            />
          </Suspense>
        </div>
        <div className="aurora-content">
          <div className="aurora-text-group">
            <p className="eyebrow motivational-eyebrow" style={{ color: '#fff', textShadow: '0 0 8px rgba(255,255,255,0.45)', margin: '0 0 6px' }}>
              {greeting.toUpperCase()}, {userLabel.toUpperCase()}
            </p>
            <h1 className="h1-scalingSize">
              <span>Make this</span>
              <MorphText />
              <span>count.</span>
            </h1>
          </div>
        
          <div className="aurora-quick-widget card">
            <div className="quick-percentages-bar">
              <div className="perc-pill">
                <span className="perc-label">{data.year} Year</span>
                <strong className="perc-val">{yearPercent}%</strong>
              </div>
              <div className="perc-divider"></div>
              <div className="perc-pill">
                <span className="perc-label">Sprint #{String(sprintNum).padStart(2, '0')}</span>
                <strong className="perc-val">{sprintPercent}%</strong>
              </div>
            </div>

            <div className="quick-widget-header">
              <span className="quick-widget-title">TASK OVERVIEW</span>
            </div>

            <div className="quick-widget-items">
              <div className="quick-widget-row">
                <div className="quick-widget-info">
                  <Target size={24} weight="bold" className="quick-widget-icon goals" />
                  <div className="quick-widget-text">
                    <strong>{goals.filter(g => !g.done).length} Goals Remaining</strong>
                    <small>Sprint Goal Targets</small>
                  </div>
                </div>
                <AnimatedPlusButton
                  onClick={() => setAddGoalModalOpen(true)}
                  title="Add Sprint Goal"
                  ariaLabel="Add Sprint Goal"
                  color="#c9f36a"
                  size={22}
                />
              </div>

              <div className="quick-widget-row">
                <div className="quick-widget-info">
                  <Repeat size={24} weight="bold" className="quick-widget-icon rotes" />
                  <div className="quick-widget-text">
                    <strong>{Math.max(0, (roteOverviewStats.total || 0) - (roteOverviewStats.completed || 0))} Rotes Remaining</strong>
                    <small>Daily Routine Tasks</small>
                  </div>
                </div>
                <AnimatedPlusButton
                  onClick={() => setActive('Rote')}
                  title="Manage Daily Rotes"
                  ariaLabel="Manage Daily Rotes"
                  color="#60a5fa"
                  size={22}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* High-Tech Temporal Urgency Console */}
      <UrgencyConsole data={{ ...data, day }} now={now} />

      {/* Visual Compounding Banner */}
      <section className="compounding-banner-visual card">
        <div className="compounding-watermark">COMPOUNDING</div>
        <div className="compounding-glow"></div>
        <div className="compounding-banner-inner">
          <div className="compounding-visuals-left">
            <div className="compounding-eq-row">
              <span className="eq-term font-instrument-italic">1 Sprint</span>
              <span className="eq-operator">=</span>
              <span className="eq-result color-lime">1% of Year</span>
            </div>
            <div className="compounding-eq-row">
              <span className="eq-term font-instrument-italic">1 Sprint</span>
              <span className="eq-operator">=</span>
              <span className="eq-result color-lime">3.6 Days</span>
            </div>
          </div>
          <div className="compounding-actions-right">
            <p className="compounding-cta-text">
              Complete your mini goals in that 3.6 days in here
            </p>
            <SpecularButton
              size="lg"
              radius={9999}
              tint="#ffffff"
              tintOpacity={0}
              blur={0}
              textColor="#f5f5f5"
              lineColor="#ffffff"
              baseColor="#525252"
              intensity={1}
              shineSize={10}
              shineFade={40}
              thickness={1}
              speed={0.35}
              followMouse
              proximity={250}
              autoAnimate={false}
              onClick={() => setAddGoalModalOpen(true)}
            >
              Create Sprint Goal
            </SpecularButton>
          </div>
        </div>
      </section>

      {/* Grid containing Current Sprint, Speed & Momentum, Motivational Drive, and Forceful Tasks */}
      <section className="overview-staggered-grid">
        {/* Row 1: Active Sprint Status (Left) & Your Speed & Momentum (Right) */}
        <div className="staggered-row-1">
          <article className="sprint-summary card sprint-summary-pos">
            <div className="sprint-summary-header">
              <p className="eyebrow">ACTIVE SPRINT STATUS</p>
              <h2>
                Sprint #{String(sprintNum).padStart(2, '0')}{' '}
                <span style={{ fontSize: '15px', fontWeight: 'normal', color: 'inherit', marginLeft: '14px', letterSpacing: '0.06em', opacity: 0.85 }}>
                  ({formatDateWithTime(sprintStart)} — {formatDateWithTime(data.checkpointEnd)})
                </span>
              </h2>
            </div>
            
            {/* Circular dial and stats */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', margin: '15px 0 20px' }}>
              <div className="sprint-progress-circle-wrap">
                <div className="sprint-progress-big-number">
                  {goals.length ? ((completeGoals / goals.length * 100) % 1 === 0 ? (completeGoals / goals.length * 100) : Number((completeGoals / goals.length * 100).toFixed(2))) : 0}<em>%</em>
                </div>
                <p className="sprint-progress-label">completed</p>
              </div>
              
              <div style={{ flex: 1 }}>
                <div className="sprint-num-value" style={{ fontSize: '28px', fontWeight: 600, lineHeight: 1 }}>{completeGoals}/{goals.length}</div>
                <p className="sprint-num-label" style={{ margin: '4px 0 0' }}>GOALS DONE</p>
              </div>
            </div>

            {/* Real-time Sprint Checklist */}
            <div className="sprint-goals-mini-list" style={{ flex: 1, marginBottom: '15px', maxHeight: '180px', overflowY: 'auto', paddingRight: '4px' }}>
              {goals.length === 0 ? (
                <p style={{ margin: '10px 0', fontSize: '12px', color: '#8c9085', fontStyle: 'italic' }}>No goals set for this sprint. Get started!</p>
              ) : (
                goals.map(g => (
                  <button key={g.id} type="button" className={`mini-goal-item ${g.done ? 'completed' : ''}`} onClick={() => { if (g.done) showGoalDetails(g); }} disabled={!g.done} aria-label={g.done ? `View details for ${g.title}` : g.title} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', fontSize: '12px', cursor: g.done ? 'pointer' : 'default', background: 'none', border: 'none', borderBottom: '1px solid #282a25', width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <span style={{ color: g.done ? '#c9f36a' : '#8c9085', fontWeight: 'bold' }}>{g.done ? '✓' : '•'}</span>
                      <span style={{ textDecoration: g.done ? 'line-through' : 'none', color: g.done ? '#7f8279' : '#eef0e9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.title}</span>
                    </div>
                    <span style={{ fontFamily: '"DM Mono", monospace', fontSize: '10px', color: g.done ? '#c9f36a' : '#a1a49b' }}>{g.value}%</span>
                  </button>
                ))
              )}
            </div>
            
            <button className="goals-cta" onClick={() => setActive('Goals')}>
              <span>Open Sprint Board</span>
              <span className="goals-cta-arrow">
                <ArrowRight size={16} weight="bold" />
              </span>
            </button>
          </article>

          {/* Live stats and momentum (Right side of Active Sprint Status) */}
          <article className="stats-card card">
            <p className="eyebrow">YOUR SPEED & MOMENTUM</p>
            
            <div className="stats-showcase">
              <div className="stat-giant-box" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', justifyContent: 'center', padding: '24px' }}>
                <div className="sprint-progress-circle-wrap" style={{ margin: '0 0 12px', alignItems: 'center' }}>
                  <div className="sprint-progress-big-number" style={{ fontSize: '64px', lineHeight: 1 }}>
                    {streak}
                  </div>
                  <p className="sprint-progress-label" style={{ marginTop: '4px', fontSize: '11px' }}>Sprint Streak</p>
                </div>
                <div className="stat-giant-badge" style={{ color: '#c9f36a', fontSize: '12px' }}>{streak} Sprint{streak === 1 ? '' : 's'} Constant Progress</div>
              </div>
              
              <div className="stat-giant-box" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', justifyContent: 'center', padding: '24px' }}>
                <div className="sprint-progress-circle-wrap" style={{ margin: '0 0 12px', alignItems: 'center' }}>
                  <div className="sprint-progress-big-number" style={{ fontSize: '64px', lineHeight: 1 }}>
                    {avgActiveProgress}<em>%</em>
                  </div>
                  <p className="sprint-progress-label" style={{ marginTop: '4px', fontSize: '11px' }}>Avg Active Progress</p>
                </div>
                <div className="stat-giant-badge" style={{ color: avgActiveProgress >= 80 ? '#c9f36a' : avgActiveProgress >= 60 ? '#eef0e9' : '#ffb9b9', fontSize: '12px' }}>
                  {avgActiveProgress >= 80 ? 'ELITE LEVEL PERFORMANCE' : avgActiveProgress >= 60 ? 'STEADY PERFORMANCE' : 'WARNING: FOCUS INTENSIVELY'}
                </div>
              </div>
            </div>
          </article>
        </div>

        {/* Row 2: Motivational Drive (Left) & Forceful Tasks (Right) */}
        <div className="staggered-row-2">
          {/* Temporal Wisdom Card (Left side of Forceful Tasks) */}
          <article className="quote-card card">
            <p className="eyebrow" style={{ marginBottom: '12px' }}>MOTIVATIONAL DRIVE</p>
            
            {(() => {
              const q1 = MOTIVATIONAL_QUOTES[quoteIndices[0] ?? 0];
              const q2 = MOTIVATIONAL_QUOTES[quoteIndices[1] ?? 1];
              
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1, justifyContent: 'center' }}>
                  <div className="quote-item">
                    <blockquote style={{ margin: '0 0 8px', fontStyle: 'italic', fontFamily: '"Instrument Serif", serif' }}>
                      “{q1.quote}”
                    </blockquote>
                    <span className="quote-author" style={{ marginTop: '0', display: 'block', color: '#ffa726', fontFamily: '"DM Mono", monospace', fontSize: '11px', letterSpacing: '0.08em' }}>
                      — {q1.author}
                    </span>
                  </div>

                  <div className="quote-item" style={{ borderTop: '1px solid #3c3224', paddingTop: '16px' }}>
                    <blockquote style={{ margin: '0 0 8px', fontStyle: 'italic', fontFamily: '"Instrument Serif", serif' }}>
                      “{q2.quote}”
                    </blockquote>
                    <span className="quote-author" style={{ marginTop: '0', display: 'block', color: '#ffa726', fontFamily: '"DM Mono", monospace', fontSize: '11px', letterSpacing: '0.08em' }}>
                      — {q2.author}
                    </span>
                  </div>
                </div>
              );
            })()}

            <div className="quote-line" style={{ marginTop: '16px', background: '#ffa726' }} />
          </article>

          {/* Rote Routines Overview Card (Right side) */}
          <article className="sprint-summary card rote-overview-card rote-summary-pos" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div className="sprint-summary-header">
                <p className="eyebrow">FORCEFUL TASKS</p>
                <h2 style={{ display: 'inline-flex', alignItems: 'flex-end', flexWrap: 'nowrap', gap: '10px', width: '100%', lineHeight: 1 }}>
                  <span style={{ whiteSpace: 'nowrap', lineHeight: 1, display: 'inline-block' }}>Routine <em>Rote</em></span>
                  <span className="daywise-badge" style={{ fontSize: '11px', fontWeight: 'normal', color: '#c9f36a', letterSpacing: '0.08em', fontFamily: '"DM Mono", monospace', textTransform: 'uppercase', padding: '3px 8px', borderRadius: '4px', background: 'rgba(201, 243, 106, 0.1)', border: '1px solid rgba(201, 243, 106, 0.2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 'fit-content', whiteSpace: 'nowrap', flexShrink: 0, lineHeight: 1, alignSelf: 'flex-end', marginBottom: '7px' }}>
                    DAY-WISE
                  </span>
                </h2>
              </div>

              {/* Circular dial and stats (matches Active Sprint Status 1-to-1) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', margin: '15px 0 20px' }}>
                <div className="sprint-progress-circle-wrap">
                  <div className="sprint-progress-big-number">
                    {roteOverviewStats.percentage}<em>%</em>
                  </div>
                  <p className="sprint-progress-label">done today</p>
                </div>
                
                <div style={{ flex: 1 }}>
                  <div className="sprint-num-value" style={{ fontSize: '28px', fontWeight: 600, lineHeight: 1 }}>{roteOverviewStats.completed}/{roteOverviewStats.total}</div>
                  <p className="sprint-num-label" style={{ margin: '4px 0 0' }}>ROTES DONE TODAY</p>
                </div>
              </div>

              {/* Real-time Rotes Checklist */}
              <div className="sprint-goals-mini-list" style={{ flex: 1, marginBottom: '15px', maxHeight: '180px', overflowY: 'auto', paddingRight: '4px' }}>
                {roteOverviewStats.rotes.length === 0 ? (
                  <p style={{ margin: '10px 0', fontSize: '12px', color: '#8c9085', fontStyle: 'italic' }}>No routine rotes added for today yet.</p>
                ) : (
                  roteOverviewStats.rotes.map(r => (
                    <button key={r.id} type="button" className={`mini-goal-item ${r.completed ? 'completed' : ''}`} onClick={() => toggleRoteFromOverview(r.id)} aria-label={`Toggle ${r.title}`} aria-pressed={!!r.completed} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', fontSize: '12px', cursor: 'pointer', background: 'none', border: 'none', borderBottom: '1px solid #282a25', width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <span style={{ color: r.completed ? '#c9f36a' : '#8c9085', fontWeight: 'bold' }}>{r.completed ? '✓' : '•'}</span>
                        <span style={{ textDecoration: r.completed ? 'line-through' : 'none', color: r.completed ? '#7f8279' : '#eef0e9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                      </div>
                      <span style={{ fontFamily: '"DM Mono", monospace', fontSize: '10px', color: r.completed ? '#c9f36a' : '#a1a49b' }}>{r.completed ? 'DONE' : 'PENDING'}</span>
                    </button>
                  ))
                )}
              </div>
            </div>

            <button className="goals-cta" onClick={() => setActive('Rote')}>
              <span>Open Rote Routines</span>
              <span className="goals-cta-arrow">
                <ArrowRight size={16} weight="bold" />
              </span>
            </button>
          </article>
        </div>
      </section>

      <AppFooter year={data.year} />
    </>
  )
}

export default OverviewPage
