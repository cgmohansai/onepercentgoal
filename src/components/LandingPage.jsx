import React, { useState, useEffect, useMemo } from 'react'
import Silk from '../Silk'
import SpecularButton from '../SpecularButton'
import MorphText from './MorphText'
import LiquidMetalButton from './LiquidMetalButton'
import AppFooter from './AppFooter'
import { DAY, getISTDate, getYearData } from '../utils/dateUtils'

export function LandingPage({ onGetStarted, onSignIn, serverSprint }) {
  const [mockNow, setMockNow] = useState(getISTDate())

  useEffect(() => {
    const timer = setInterval(() => {
      setMockNow(getISTDate())
    }, 50)
    return () => clearInterval(timer)
  }, [])

  const yearData = useMemo(() => {
    if (serverSprint) {
      const startTs = Date.UTC(serverSprint.year, 0, 1, 0, 0, 0) - (5.5 * 3600 * 1000)
      return {
        year: serverSprint.year,
        total: serverSprint.days_in_year,
        elapsed: Math.max(0, mockNow.getTime() - startTs),
        percentage: serverSprint.percentage,
        sprint: serverSprint.sprint_number,
        sprint_number: serverSprint.sprint_number,
        sprint_start: serverSprint.sprint_start,
        sprint_end: serverSprint.sprint_end,
        checkpointEnd: new Date(serverSprint.sprint_end),
        sprintStart: new Date(serverSprint.sprint_start),
      }
    }
    return getYearData(mockNow)
  }, [serverSprint, mockNow])

  const day = Math.floor(yearData.elapsed / DAY) + 1
  const start = yearData.sprintStart || new Date(yearData.checkpointEnd.getTime() - (yearData.total * DAY / 100))
  const sprintEnd = yearData.checkpointEnd
  const nextSprintMs = Math.max(0, sprintEnd.getTime() - mockNow.getTime())
  const secondsLeft = Math.floor(nextSprintMs / 1000)
  const daysLeft = Math.floor(secondsLeft / 86400)
  const hoursLeft = Math.floor((secondsLeft % 86400) / 3600)
  const minutesLeft = Math.floor((secondsLeft % 3600) / 60)
  const secsLeft = secondsLeft % 60

  return (
    <div className="landing-page">
      {/* Hero Card */}
      <section className="aurora-hero-wrapper landing-hero">
        <div className="silk-bg-container">
          <Silk
            speed={5}
            scale={1}
            color="#366cf3"
            noiseIntensity={1.5}
            rotation={0}
          />
        </div>
        <div className="aurora-content">
          <div className="aurora-text-group">
            <p className="eyebrow motivational-eyebrow" style={{ color: '#fff', textShadow: '0 0 8px rgba(255,255,255,0.45)', margin: '0 0 6px' }}>
              COMPOUND YOUR POTENTIAL
            </p>
            <h1 className="h1-scalingSize">
              <span>Make this</span>
              <MorphText />
              <span>count.</span>
            </h1>
            <p className="billboard-subtitle" style={{ color: '#fff', opacity: 0.82, margin: '16px 0 0', maxWidth: '640px', fontSize: '16px', lineHeight: 1.55 }}>
              One percent progress every single day compounding over the year. Build consistency, define short sprint targets, and witness a massive 37.78x increase in capability.
            </p>
          </div>
          
          <div className="aurora-action-group" style={{ flexShrink: 0 }}>
            <LiquidMetalButton size="lg" onClick={onGetStarted}>
              <span className="start-sprint-btn-label" style={{ display: 'inline-flex', alignItems: 'center', gap: '20px', fontSize: '20px', fontWeight: '600' }}>
                Start Your First Sprint
                <span className="start-sprint-btn-arrow" style={{
                  borderRadius: '9999px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#242721',
                  width: '40px',
                  height: '40px',
                  color: '#c9f36a',
                  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)',
                  fontSize: '22px',
                  lineHeight: 1
                }}>→</span>
              </span>
            </LiquidMetalButton>
          </div>
        </div>
      </section>

      {/* Compounding Visual Banner */}
      <section className="compounding-banner-visual card landing-compounding-banner">
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
            <div className="compounding-eq-row math-compounding-rule">
              <span className="eq-term font-instrument-italic" style={{ textTransform: 'none' }}>1.01<sup>365</sup></span>
              <span className="eq-operator">≈</span>
              <span className="eq-result color-lime">37.78x Yield</span>
            </div>
          </div>
          <div className="compounding-actions-right">
            <p className="compounding-cta-text">
              Break your annual goals down into bite-sized 3.6-day active sprint directives. Track progress, rollover leftovers, and build unstoppable momentum.
            </p>
            <SpecularButton
              size="lg"
              radius={18}
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
              onClick={onGetStarted}
            >
              Join the System
            </SpecularButton>
          </div>
        </div>
      </section>

      {/* Temporal Urgency Console Mockup */}
      <section className="urgency-console landing-urgency-mock">
        <div className="urgency-main">
          <div className="urgency-live-percentage">
            <div className="urgency-system-status">SYS.MOCK // SPRINT #{String(yearData.sprint).padStart(2, '0')}</div>
            <div className="live-num">
              <span style={{ fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"', display: 'inline-block' }}>
                {yearData.percentage.toFixed(6)}
              </span>
              <em>%</em>
            </div>
            <div className="live-label">OF {yearData.year} COMPLETED</div>
          </div>
          
          <div className="landing-countdown-container">
            <div className="urgency-system-status">NEXT SPRINT BEGINS IN</div>
            <div className="live-num countdown-live-num">
              <span className="time-unit"><span className="time-num">{String(daysLeft).padStart(2, '0')}</span><em>d</em></span>
              <i className="time-colon">:</i>
              <span className="time-unit"><span className="time-num">{String(hoursLeft).padStart(2, '0')}</span><em>h</em></span>
              <i className="time-colon">:</i>
              <span className="time-unit"><span className="time-num">{String(minutesLeft).padStart(2, '0')}</span><em>m</em></span>
              <i className="time-colon">:</i>
              <span className="time-unit"><span className="time-num">{String(secsLeft).padStart(2, '0')}</span><em>s</em></span>
            </div>
            <div className="live-label">SPRINT #{String(yearData.sprint).padStart(2, '0')} → #{String(yearData.sprint + 1).padStart(2, '0')}</div>
          </div>
        </div>

        <div className="urgency-track-wrap">
          <div className="urgency-track-labels">
            <span />
            <span>YEAR REMAINING: {(100 - yearData.percentage).toFixed(6)}% · DAY {day} OF {yearData.total}</span>
          </div>
          <div className="urgency-progress-track main-highlighted-track">
            <div className="urgency-progress-bar" style={{ width: `${yearData.percentage}%` }} />
            <div className="urgency-progress-glow" style={{ left: `${yearData.percentage}%` }} />
          </div>
          <div className="urgency-progress-scale" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', color: '#8c9085', fontFamily: '"DM Mono", monospace', fontSize: '13px', letterSpacing: '.08em' }}>
            <span>{yearData.year}</span>
            <span>25%</span>
            <span>50%</span>
            <span>75%</span>
            <span>{yearData.year + 1}</span>
          </div>
        </div>

        <div className="urgency-footer-warning">
          <span className="warning-icon">✦</span>
          <p className="warning-text">Time is slipping away. Every second counts. <b>Will you complete your goals, or let another day burn out?</b></p>
        </div>
      </section>

      {/* Landing Page Features Grid (Visualizing the experience) */}
      <section className="landing-features-grid">
        <article className="card landing-feature-card">
          <p className="eyebrow">01 // TARGET DRIVEN</p>
          <h3>3.6-Day Sprints</h3>
          <p className="feature-desc">Stop looking at overwhelming annual resolutions. Focus purely on what you can achieve in the next 86 hours. Repeat 100 times.</p>
        </article>
        
        <article className="card landing-feature-card">
          <p className="eyebrow">02 // NO WASTE</p>
          <h3>Automatic Rollovers</h3>
          <p className="feature-desc">Any incomplete directives automatically rollover to the next sprint boundary. Keep your record clear, learn, and adapt dynamically.</p>
        </article>

        <article className="card landing-feature-card">
          <p className="eyebrow">03 // PROVE CONSISTENCY</p>
          <h3>Compounding Analytics</h3>
          <p className="feature-desc">Visualize your progress with live sub-second counters, historical timelines, and customizable profiles to showcase your consistency.</p>
        </article>
      </section>

      {/* Call to action footer */}
      <footer className="landing-footer">
        <div className="profile-brand-header-row">
          <div className="profile-brand-logo-wrap">
            <img src="/favicon.ico" alt="OnePercentGoal" className="profile-brand-logo-img" />
          </div>
          <span className="profile-brand-title">OnePercentGoal</span>
        </div>
        <p className="landing-footer-slogan">1 SPRINT = 1% OF YEAR · 1 SPRINT = 3.6 DAYS</p>
        <p className="landing-footer-quote">Make every 1% count.</p>
        <SpecularButton
          size="lg"
          radius={18}
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
          onClick={onGetStarted}
        >
          Initialize Your Console
        </SpecularButton>
      </footer>
      <AppFooter year={2026} />
    </div>
  )
}

export default LandingPage
