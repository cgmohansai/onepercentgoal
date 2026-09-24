/**
 * Regression tests for the sprint countdown contract.
 * Run: node --test src/utils/sprintCountdown.test.js
 * All cases use a FIXED now so results are deterministic.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  sprintBoundaryMs,
  currentSprintNumber,
  currentSprintEndMs,
  formatSprintRemaining,
  yearStartMs,
  daysInYear,
} from './sprintCountdown.js'

// Fixed "now": 2026-09-24T12:00:00Z (a Thursday, mid-year, mid-sprint).
const NOW = Date.UTC(2026, 8, 24, 12, 0, 0)
const MIN = 60 * 1000

describe('formatSprintRemaining display table', () => {
  const cases = [
    // [remainingMs, expectedText]
    [(3 * 24 * 60 + 4 * 60 + 25) * MIN, '76h 25m'], // 3 days, 4 hours, 25 minutes
    [(5 * 60 + 30) * MIN, '5h 30m'], // 5 hours, 30 minutes
    [45 * MIN, '0h 45m'], // 45 minutes
    [35 * 1000, '0h 1m'], // 35 seconds -> rounds UP, never 0m
    [1000, '0h 1m'], // 1 second -> rounds UP, never 0m
    [60 * MIN, '1h 0m'], // exact hour boundary
    [61 * 1000, '0h 2m'], // 61s -> 2m (ceiling, not floor)
  ]
  for (const [remainingMs, expected] of cases) {
    it(`${remainingMs}ms -> "${expected}"`, () => {
      const r = formatSprintRemaining(NOW + remainingMs, NOW)
      assert.equal(r.state, 'active')
      assert.equal(r.text, expected)
    })
  }
})

describe('expired / invalid states are explicit (never "0h 0m")', () => {
  it('past end -> expired', () => {
    const r = formatSprintRemaining(NOW - 1000, NOW)
    assert.equal(r.state, 'expired')
    assert.equal(r.text, null)
  })
  it('exact-zero remaining -> expired', () => {
    const r = formatSprintRemaining(NOW, NOW)
    assert.equal(r.state, 'expired')
    assert.equal(r.text, null)
  })
  for (const bad of [0, -5, NaN, null, undefined, 'abc']) {
    it(`end=${String(bad)} -> invalid`, () => {
      const r = formatSprintRemaining(bad, NOW)
      assert.equal(r.state, 'invalid')
      assert.equal(r.text, null)
    })
  }
})

describe('engine parity: same timestamps as the authoritative sprint engine', () => {
  it('year boundaries anchor at IST midnight', () => {
    // 2026-01-01 00:00 IST == 2025-12-31 18:30 UTC
    assert.equal(yearStartMs(2026), Date.UTC(2025, 11, 31, 18, 30, 0))
    assert.equal(daysInYear(2026), 365)
    assert.equal(daysInYear(2024), 366)
  })
  it('boundaries are strictly increasing 0..100 and N=100 is year end', () => {
    let prev = -Infinity
    for (let n = 0; n <= 100; n++) {
      const b = sprintBoundaryMs(2026, n)
      assert.ok(b > prev, `boundary ${n} must increase`)
      prev = b
    }
    assert.equal(sprintBoundaryMs(2026, 100), yearStartMs(2027))
    assert.equal(sprintBoundaryMs(2026, 0), yearStartMs(2026))
  })
  it('current sprint contains now; its end is in the future (IST-correct)', () => {
    const s = currentSprintNumber(NOW)
    assert.ok(s >= 1 && s <= 100)
    const start = sprintBoundaryMs(2026, s - 1)
    const end = sprintBoundaryMs(2026, s)
    assert.ok(start <= NOW && NOW < end, 'now must sit inside the current sprint window')
    assert.ok(currentSprintEndMs(NOW) === end && end > NOW)
  })
  it('leap year 2024 also contains now correctly', () => {
    const t = Date.UTC(2024, 5, 15, 12, 0, 0)
    const s = currentSprintNumber(t)
    assert.ok(sprintBoundaryMs(2024, s - 1) <= t && t < sprintBoundaryMs(2024, s))
  })
})
