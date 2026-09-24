/**
 * Sprint countdown utilities — pure functions, no platform imports.
 *
 * Single source of truth for "time left in the current sprint" on every
 * client (web + native scheduling). The math mirrors the authoritative
 * backend sprint engine exactly (backend/sprint_engine.py):
 * - year anchored at Jan 1 00:00:00 IST (== Date.UTC(y,0,1) - 5.5h)
 * - 100 sprints/year, boundaries quantized to 30-minute blocks:
 *   halfHours = floor(N * totalHalfHours / 100 + 0.5)
 *
 * Display contract (never a misleading zero):
 * - positive remaining -> "76h 25m", minutes ROUNDED UP so even 1 second
 *   left shows "0h 1m", never "0h 0m".
 * - zero/negative remaining -> explicit `expired` state (caller picks the
 *   message; never "Only 0h 0m left!").
 * - missing/invalid end timestamp -> explicit `invalid` state, never zero.
 */

export const HALF_HOUR_MS = 30 * 60 * 1000
export const IST_OFFSET_MS = 5.5 * 3600 * 1000

export function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

export function daysInYear(year) {
  return isLeapYear(year) ? 366 : 365
}

/** IST midnight Jan 1 of `year`, as epoch ms. */
export function yearStartMs(year) {
  return Date.UTC(year, 0, 1, 0, 0, 0) - IST_OFFSET_MS
}

/**
 * Exact sprint boundary timestamp (epoch ms), mirroring
 * backend sprint_boundary_timestamp(year, N).
 */
export function sprintBoundaryMs(year, N) {
  const start = yearStartMs(year)
  if (N <= 0) return start
  const yearEnd = yearStartMs(year + 1)
  if (N >= 100) return yearEnd
  const totalHalfHours = daysInYear(year) * 48
  const halfHours = Math.floor((N * (totalHalfHours / 100)) + 0.5)
  return start + halfHours * HALF_HOUR_MS
}

/** IST calendar year containing `nowMs`. */
export function istYear(nowMs = Date.now()) {
  return new Date(nowMs + IST_OFFSET_MS).getUTCFullYear()
}

/** Current sprint number (1..100) for `nowMs`, mirroring year_progress(). */
export function currentSprintNumber(nowMs = Date.now()) {
  const year = istYear(nowMs)
  for (let s = 1; s <= 100; s++) {
    if (nowMs < sprintBoundaryMs(year, s)) return s
  }
  return 100
}

/** Authoritative end of the currently active sprint (always future). */
export function currentSprintEndMs(nowMs = Date.now()) {
  const year = istYear(nowMs)
  return sprintBoundaryMs(year, currentSprintNumber(nowMs))
}

/**
 * Formats remaining time until `endMs`.
 * @returns {{ state: 'active'|'expired'|'invalid', text: string|null }}
 *   active  -> text like "76h 25m" (minutes rounded up)
 *   expired -> endMs is now/past; text is null (caller shows ended state)
 *   invalid -> endMs missing/unusable; text is null (caller shows unavailable)
 */
export function formatSprintRemaining(endMs, nowMs = Date.now()) {
  const end = Number(endMs)
  const now = Number(nowMs)
  if (!Number.isFinite(end) || !Number.isFinite(now) || end <= 0) {
    return { state: 'invalid', text: null }
  }
  const diffMs = end - now
  if (diffMs <= 0) {
    return { state: 'expired', text: null }
  }
  const totalMins = Math.ceil(diffMs / 60000)
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  return { state: 'active', text: `${h}h ${m}m` }
}
