/**
 * Goal Service for OnePercentGoal (OPG).
 *
 * Encapsulates:
 * - Fetching goals via /api/goals
 * - Fetching dashboard sprint data via /api/dashboard
 * - Creating goals via POST /api/goals
 * - Updating goals and progress via PATCH /api/goals/:id
 * - Completing goals via PATCH /api/goals/:id
 * - Deleting goals via DELETE /api/goals/:id
 */

import { apiFetch, buildHeaders } from '../../services/apiClient.js'

/**
 * Fetches the user's active goals for the current sprint.
 *
 * @param {string|null} [token=null] - Optional session token
 * @returns {Promise<Array>} List of raw goals
 */
export async function fetchGoals(token = null) {
  const headers = buildHeaders({}, token)
  const res = await apiFetch('/api/goals', { headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Unable to load goals (${res.status})`)
  }
  return res.json()
}

/**
 * Fetches dashboard state including current goals and sprint year context.
 *
 * @param {string|null} [token=null] - Optional session token
 * @returns {Promise<{ goals: Array, year?: object }>} Dashboard payload
 */
export async function fetchDashboard(token = null) {
  const headers = buildHeaders({}, token)
  const res = await apiFetch('/api/dashboard', { headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Unable to load dashboard (${res.status})`)
  }
  return res.json()
}

/**
 * Creates a new goal on the server.
 *
 * @param {string} title - Title of the goal
 * @param {string|null} [token=null] - Optional session token
 * @returns {Promise<object>} The created goal
 */
export async function createGoal(title, token = null) {
  const cleanTitle = title?.trim()
  if (!cleanTitle) {
    throw new Error('Goal title cannot be empty')
  }

  const headers = buildHeaders({ 'Content-Type': 'application/json' }, token)
  const res = await apiFetch('/api/goals', {
    method: 'POST',
    headers,
    body: JSON.stringify({ title: cleanTitle }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Unable to add goal (${res.status})`)
  }

  return res.json()
}

/**
 * Updates an existing goal's attributes (title, progress, completed, etc.).
 *
 * @param {number|string} goalId - Goal ID
 * @param {object} payload - Fields to update
 * @param {string|null} [token=null] - Optional session token
 * @returns {Promise<object>} The updated goal
 */
export async function updateGoal(goalId, payload, token = null) {
  const headers = buildHeaders({ 'Content-Type': 'application/json' }, token)
  const res = await apiFetch(`/api/goals/${goalId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Unable to update goal (${res.status})`)
  }

  return res.json()
}

/**
 * Convenience helper to update only a goal's progress percentage.
 *
 * @param {number|string} goalId
 * @param {number} progressPercent
 * @param {string|null} [token=null]
 * @returns {Promise<object>}
 */
export async function updateGoalProgress(goalId, progressPercent, token = null) {
  return updateGoal(goalId, { progress_percent: progressPercent }, token)
}

/**
 * Convenience helper to mark a goal completed with a reflection note.
 *
 * @param {number|string} goalId
 * @param {string} note - Completion reflection note
 * @param {string|null} [token=null]
 * @returns {Promise<object>}
 */
export async function completeGoal(goalId, note, token = null) {
  return updateGoal(
    goalId,
    {
      completed: true,
      completion_note: note?.trim() || '',
    },
    token
  )
}

/**
 * Deletes a goal from the server.
 *
 * @param {number|string} goalId
 * @param {string|null} [token=null]
 * @returns {Promise<boolean>}
 */
export async function deleteGoal(goalId, token = null) {
  const authToken = token && typeof token === 'string' && token.trim() ? token.trim() : getStoredToken()
  // If unauthenticated or client-only temp goal, consider locally deleted without failing
  if (!authToken || String(goalId).startsWith('temp-')) {
    return true
  }

  try {
    const headers = buildHeaders({}, authToken)
    const res = await apiFetch(`/api/goals/${goalId}`, {
      method: 'DELETE',
      headers,
    })

    // 204 No Content, 200 OK, or 404 (already absent on server) all indicate the goal is deleted
    if (res.status === 204 || res.status === 404 || res.ok) {
      return true
    }

    // 401 Unauthorized or 403 Forbidden indicates unauthenticated on remote server; delete locally
    if (res.status === 401 || res.status === 403) {
      console.warn(`Server rejected deletion for goal ${goalId} (${res.status}); treated as local delete`)
      return true
    }

    const err = await res.json().catch(() => ({}))
    console.warn(`Server deletion failed for goal ${goalId}:`, err.detail || res.status)
    return false
  } catch (netErr) {
    console.warn(`Network error deleting goal ${goalId} on server:`, netErr)
    return false
  }
}

export default {
  fetchGoals,
  fetchDashboard,
  createGoal,
  updateGoal,
  updateGoalProgress,
  completeGoal,
  deleteGoal,
}
