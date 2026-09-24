/**
 * Date and offline sprint calculation utilities for OnePercentGoal (OPG).
 *
 * NOTE: The backend (backend/sprint_engine.py) is the single authoritative source of truth
 * for sprint boundaries and numbers. The functions here provide offline fallbacks and formatting.
 */

export const DAY = 24 * 60 * 60 * 1000

// Offline fallback sprint boundary calculation, anchored to IST (UTC+5:30)
export function getSprintBoundary(year, N) {
  const startTs = Date.UTC(year, 0, 1, 0, 0, 0) - (5.5 * 3600 * 1000)
  const nextYearStartTs = Date.UTC(year + 1, 0, 1, 0, 0, 0) - (5.5 * 3600 * 1000)
  const daysInYear = Math.round((nextYearStartTs - startTs) / DAY)
  const totalHalfHours = daysInYear * 48
  const halfHours = Math.round(N * (totalHalfHours / 100.0))
  return new Date(startTs + halfHours * 30 * 60 * 1000)
}

// Offline fallback sprint progress calculation (server timestamps are authoritative when online)
export function getYearData(date = new Date()) {
  const nowTs = date.getTime()
  const istDate = new Date(nowTs + (5.5 * 3600 * 1000))
  const year = istDate.getUTCFullYear()
  const startTs = Date.UTC(year, 0, 1, 0, 0, 0) - (5.5 * 3600 * 1000)
  const nextYearStartTs = Date.UTC(year + 1, 0, 1, 0, 0, 0) - (5.5 * 3600 * 1000)
  const total = Math.round((nextYearStartTs - startTs) / DAY)
  const elapsed = Math.max(0, nowTs - startTs)
  const percentage = Math.min(100, Math.max(0, (elapsed / (total * DAY)) * 100))

  const sprint = Math.min(100, Math.max(1, Math.floor(percentage)))

  const sprintStart = getSprintBoundary(year, sprint - 1)
  const checkpointEnd = getSprintBoundary(year, sprint)
  return {
    year,
    total,
    elapsed,
    percentage: Math.round(percentage * 100) / 100,
    sprint,
    sprint_number: sprint,
    sprint_start: sprintStart.toISOString(),
    sprint_end: checkpointEnd.toISOString(),
    checkpointEnd,
    sprintStart,
  }
}

export function getISTDate() {
  const d = new Date()
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000)
  return new Date(utc + (3600000 * 5.5))
}

export function getTodayYMD() {
  const d = getISTDate()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatDateWithTime(dateObj) {
  if (!dateObj) return ''
  let d = new Date(dateObj)
  if (isNaN(d.getTime())) return ''

  let hours = d.getHours()
  let minutes = d.getMinutes()

  // Round to nearest 30-minute block (:00 or :30)
  if (minutes >= 45) {
    hours += 1
    minutes = 0
  } else if (minutes >= 15) {
    minutes = 30
  } else {
    minutes = 0
  }

  if (hours >= 24) {
    d = new Date(d.getTime() + 86400000)
    hours = 0
  }

  const month = d.toLocaleString('en-US', { month: 'short' })
  const day = d.getDate()
  const period = hours >= 12 ? 'PM' : 'AM'
  const hour12 = hours % 12 === 0 ? 12 : hours % 12
  const minStr = String(minutes).padStart(2, '0')

  return `${month} ${day}, ${hour12}:${minStr} ${period}`
}

export function formatDateOnly(dateObj) {
  if (!dateObj) return ''
  const d = new Date(dateObj)
  if (isNaN(d.getTime())) return ''
  const month = d.toLocaleString('en-US', { month: 'short' })
  const day = d.getDate()
  return `${month} ${day}`
}
