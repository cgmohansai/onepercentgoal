import React from 'react'
import LiveYearNumber, { LiveYearRemaining } from './LiveYearNumber'
import { getSprintBoundary, DAY } from '../utils/dateUtils'

export function UrgencyConsole({ data, now = new Date() }) {
  const sprintEnd = data.checkpointEnd || (data.sprint_end ? new Date(data.sprint_end) : (data.year && data.sprint ? getSprintBoundary(data.year, data.sprint) : new Date()))
  const nextSprintMs = Math.max(0, sprintEnd.getTime() - now.getTime())
  const secondsLeft = Math.floor(nextSprintMs / 1000)
  const daysLeft = Math.floor(secondsLeft / 86400)
  const hoursLeft = Math.floor((secondsLeft % 86400) / 3600)
  const minutesLeft = Math.floor((secondsLeft % 3600) / 60)
  const secsLeft = secondsLeft % 60

  const day = data.day || (data.elapsed ? Math.floor(data.elapsed / DAY) + 1 : 1)
  const startTs = data.year ? Date.UTC(data.year, 0, 1, 0, 0, 0) - (5.5 * 3600 * 1000) : 0
  const totalDays = data.total || 365
  const livePct = (data.year && totalDays)
    ? Math.min(100, Math.max(0, ((now.getTime() - startTs) / (totalDays * DAY)) * 100))
    : (typeof data.percentage === 'number' ? data.percentage : (parseFloat(data.percentage) || 0))
  const clampedPercentage = Math.min(100, Math.max(0, livePct))

  return (
    <section className="urgency-console">
      <div className="urgency-main">
        {/* Left Column: Annual Progress Percentage */}
        <div className="urgency-col left">
          <div className="urgency-system-status">SYS.ACTIVE // SPRINT #{String(data.sprint).padStart(2, '0')}</div>
          <div className="live-num">
            <LiveYearNumber year={data.year} totalDays={data.total} />
            <em>%</em>
          </div>
          <div className="live-label">OF {data.year} COMPLETED</div>
        </div>
        
        {/* Right Column: Next Sprint Countdown Timer (Symmetric Styling) */}
        <div className="urgency-col right">
          <div className="urgency-system-status">NEXT SPRINT // COUNTDOWN</div>
          <div className="live-num countdown-live-num">
            <span className="time-unit"><span className="time-num">{String(daysLeft).padStart(2, '0')}</span><em>d</em></span>
            <i className="time-colon">:</i>
            <span className="time-unit"><span className="time-num">{String(hoursLeft).padStart(2, '0')}</span><em>h</em></span>
            <i className="time-colon">:</i>
            <span className="time-unit"><span className="time-num">{String(minutesLeft).padStart(2, '0')}</span><em>m</em></span>
            <i className="time-colon">:</i>
            <span className="time-unit"><span className="time-num">{String(secsLeft).padStart(2, '0')}</span><em>s</em></span>
          </div>
          <div className="live-label">SPRINT #{String(data.sprint).padStart(2, '0')} → #{String(data.sprint + 1).padStart(2, '0')}</div>
        </div>
      </div>

      {/* Glowing Progress Track (Highlighted & Main) */}
      <div className="urgency-track-wrap">
        <div className="urgency-track-labels">
          <span />
          <span style={{ fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>
            YEAR REMAINING: <LiveYearRemaining year={data.year} totalDays={data.total} /> · DAY {day} OF {data.total}
          </span>
        </div>
        <div className="urgency-progress-track main-highlighted-track">
          <div className="urgency-progress-bar" style={{ width: `${clampedPercentage}%` }} />
          <div className="urgency-progress-glow" style={{ left: `${clampedPercentage}%` }} />
        </div>
        <div className="urgency-progress-scale" style={{ position: 'relative', width: '100%', height: '18px', marginTop: '10px', color: '#8c9085', fontFamily: '"DM Mono", monospace', fontSize: '13px', letterSpacing: '.08em' }}>
          <span style={{ position: 'absolute', left: 0 }}>{data.year}</span>
          <span style={{ position: 'absolute', left: '25%', transform: 'translateX(-50%)' }}>25%</span>
          <span style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>50%</span>
          <span style={{ position: 'absolute', left: '75%', transform: 'translateX(-50%)' }}>75%</span>
          <span style={{ position: 'absolute', right: 0 }}>{data.year + 1}</span>
        </div>
      </div>

      <div className="urgency-footer-warning">
        <span className="warning-icon">✦</span>
        <p className="warning-text">Time is slipping away. Every second counts. Today is Day {day} of {data.total}. <b>Will you complete your goals, or let another day burn out?</b></p>
      </div>
    </section>
  )
}

export default UrgencyConsole
