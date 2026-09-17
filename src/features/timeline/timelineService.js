/**
 * Timeline Service for OnePercentGoal (OPG).
 *
 * Encapsulates:
 * - Fetching timeline sprint history via GET /api/timeline?year=...
 * - Fetching detailed sprint breakdown with goals via GET /api/timeline/:sprintNumber?year=...
 */

import { apiFetch, buildHeaders } from '../../services/apiClient.js'

/**
 * Fetches the sprint timeline history for a given year.
 *
 * @param {number|string|null} [year=null] - Target year
 * @param {string|null} [token=null] - Optional session token
 * @returns {Promise<{ year: number, years: Array<number>, start_sprint: number, end_sprint: number, sprints: Array<object> }>}
 */
export async function fetchTimeline(year = null, token = null) {
  const query = year ? `?year=${encodeURIComponent(year)}` : ''
  const headers = buildHeaders({}, token)
  const res = await apiFetch(`/api/timeline${query}`, { headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Failed to fetch timeline (${res.status})`)
  }
  return res.json()
}

/**
 * Fetches detailed sprint breakdown including recorded goals for a specific sprint.
 *
 * @param {number|string} sprintNumber - Sprint number (1-100)
 * @param {number|string|null} [year=null] - Target year
 * @param {string|null} [token=null] - Optional session token
 * @returns {Promise<object>} Detailed sprint summary with goals array
 */
export async function fetchSprintHistory(sprintNumber, year = null, token = null) {
  const query = year ? `?year=${encodeURIComponent(year)}` : ''
  const headers = buildHeaders({}, token)
  const res = await apiFetch(`/api/timeline/${encodeURIComponent(sprintNumber)}${query}`, { headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Failed to fetch sprint history (${res.status})`)
  }
  return res.json()
}

const timelineService = {
  fetchTimeline,
  fetchSprintHistory,
}

export default timelineService
