import React, { useState, useEffect } from 'react'
import { DAY } from '../utils/dateUtils'

// Renders the 6-decimal year percentage with a fast LOCAL 50ms clock so it
// ticks continuously (…434 → …435 → …436) instead of jumping once a second.
// Only this tiny span re-renders — the rest of the page stays on the cheap
// 1-second app clock. Uses absolute Date.now() (no drift), full float
// precision, and cleans up its timer on unmount.
export const LiveYearNumber = React.memo(function LiveYearNumber({ year, totalDays, style }) {
  const [nowTs, setNowTs] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 50)
    return () => clearInterval(id)
  }, [])

  const startTs = Date.UTC(year, 0, 1, 0, 0, 0) - (5.5 * 3600 * 1000)
  const pct = Math.min(100, Math.max(0, ((nowTs - startTs) / (totalDays * DAY)) * 100))

  return (
    <span style={{ fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"', display: 'inline-block', ...style }}>
      {pct.toFixed(6)}
    </span>
  )
})

// Renders the fast-ticking 6-decimal year REMAINING percentage (100 - pct)
// updating continuously at the 6th decimal place with full float precision.
export const LiveYearRemaining = React.memo(function LiveYearRemaining({ year, totalDays, style }) {
  const [nowTs, setNowTs] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 50)
    return () => clearInterval(id)
  }, [])

  const startTs = Date.UTC(year, 0, 1, 0, 0, 0) - (5.5 * 3600 * 1000)
  const pct = Math.min(100, Math.max(0, ((nowTs - startTs) / (totalDays * DAY)) * 100))
  const remaining = Math.max(0, 100 - pct)

  return (
    <span style={{ fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"', display: 'inline-block', ...style }}>
      {remaining.toFixed(6)}%
    </span>
  )
})

export default LiveYearNumber
