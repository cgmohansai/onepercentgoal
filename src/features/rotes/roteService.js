/**
 * Rote Service for OnePercentGoal (OPG).
 *
 * Encapsulates:
 * - Fetching rotes for a date via GET /api/rotes?date=...
 * - Creating a new rote routine via POST /api/rotes
 * - Toggling a rote's completion status via POST /api/rotes/:id/toggle
 * - Deleting a rote habit via DELETE /api/rotes/:id
 */

import { apiFetch, buildHeaders } from '../../services/apiClient.js'

/**
 * Fetches rotes and completion logs for a given date.
 *
 * @param {string} [dateStr=''] - Target date string 'YYYY-MM-DD'
 * @param {string|null} [token=null] - Optional session token
 * @returns {Promise<{ date: string, user_joined_date: string, rotes: Array, completed_dates: Array, stats: object }>}
 */
export async function fetchRotes(dateStr = '', token = null) {
  const query = dateStr ? `?date=${encodeURIComponent(dateStr)}` : ''
  const headers = buildHeaders({}, token)
  const res = await apiFetch(`/api/rotes${query}`, { headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Failed to fetch rotes (${res.status})`)
  }
  return res.json()
}

/**
 * Creates a new rote routine habit.
 *
 * Supports both:
 *   createRote({ title, description, date }, token)
 *   createRote(title, date, description, token)
 *
 * @param {object|string} payloadOrTitle
 * @param {string|null} [dateStr=null]
 * @param {string} [description='']
 * @param {string|null} [token=null]
 * @returns {Promise<object>} The created rote object
 */
export async function createRote(payloadOrTitle, dateStr = null, description = '', token = null) {
  let title = ''
  let desc = ''
  let date = ''
  let activeToken = token

  if (typeof payloadOrTitle === 'object' && payloadOrTitle !== null) {
    title = payloadOrTitle.title || ''
    desc = payloadOrTitle.description || ''
    date = payloadOrTitle.date || ''
    activeToken = dateStr // when invoked as (payload, token)
  } else {
    title = payloadOrTitle || ''
    date = dateStr || ''
    desc = description || ''
  }

  const cleanTitle = title.trim()
  if (!cleanTitle) {
    throw new Error('Rote title cannot be empty')
  }

  const headers = buildHeaders({ 'Content-Type': 'application/json' }, activeToken)
  const res = await apiFetch('/api/rotes', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: cleanTitle,
      description: desc,
      date,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Failed to create rote (${res.status})`)
  }

  return res.json()
}

/**
 * Toggles a rote's completion status for a given date.
 *
 * Supports both:
 *   toggleRote(roteId, { date, completed }, token)
 *   toggleRote(roteId, date, completed, token)
 *
 * @param {number|string} roteId - Rote ID
 * @param {object|string} payloadOrDate - Payload object or date string
 * @param {boolean|null} [completed=null] - Completed boolean
 * @param {string|null} [token=null] - Optional session token
 * @returns {Promise<{ rote_id: number, date: string, completed: boolean }>}
 */
export async function toggleRote(roteId, payloadOrDate, completed = null, token = null) {
  let date = ''
  let comp = null
  let activeToken = token

  if (typeof payloadOrDate === 'object' && payloadOrDate !== null) {
    date = payloadOrDate.date || ''
    comp = payloadOrDate.completed
    activeToken = completed // when invoked as (roteId, payload, token)
  } else {
    date = payloadOrDate || ''
    comp = completed
  }

  const headers = buildHeaders({ 'Content-Type': 'application/json' }, activeToken)
  const res = await apiFetch(`/api/rotes/${roteId}/toggle`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      date,
      completed: comp,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Failed to toggle rote (${res.status})`)
  }

  return res.json()
}

/**
 * Deletes a rote habit and its associated logs.
 *
 * @param {number|string} roteId - Rote ID
 * @param {string|null} [token=null] - Optional session token
 * @returns {Promise<boolean>} True if successfully deleted
 */
export async function deleteRote(roteId, token = null) {
  const headers = buildHeaders({}, token)
  const res = await apiFetch(`/api/rotes/${roteId}`, {
    method: 'DELETE',
    headers,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Failed to delete rote (${res.status})`)
  }

  return true
}

const roteService = {
  fetchRotes,
  createRote,
  toggleRote,
  deleteRote,
}

export default roteService
