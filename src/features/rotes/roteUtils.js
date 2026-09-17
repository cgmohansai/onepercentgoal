/**
 * Rotes utilities, state derivation, and local persistence for OnePercentGoal (OPG).
 *
 * Preserves the exact storage key format: 'opg.rotes.<dateStr>'
 */

export const ROTES_STORAGE_PREFIX = 'opg.rotes.'

/**
 * Returns the localStorage key for rotes on a specific date.
 *
 * @param {string} dateStr - Date string in 'YYYY-MM-DD' format
 * @returns {string} Key string
 */
export function getRotesStorageKey(dateStr) {
  return `${ROTES_STORAGE_PREFIX}${dateStr}`
}

/**
 * Retrieves cached or locally persisted rotes data for a given date.
 *
 * @param {string} dateStr - Date string in 'YYYY-MM-DD' format
 * @returns {object|null} Parsed rotes data or null
 */
export function getStoredRotes(dateStr) {
  try {
    if (typeof localStorage === 'undefined') return null
    const stored = localStorage.getItem(getRotesStorageKey(dateStr))
    if (!stored) return null
    const parsed = JSON.parse(stored)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/**
 * Persists rotes state to localStorage for a given date.
 *
 * @param {string} dateStr - Date string in 'YYYY-MM-DD' format
 * @param {object} state - State object to persist
 */
export function persistRotes(dateStr, state) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(getRotesStorageKey(dateStr), JSON.stringify(state))
  } catch {}
}

/**
 * Creates an optimistic rote object for instant UI updates before server confirmation.
 *
 * @param {string} title - Rote habit title
 * @param {string} dateStr - Date string in 'YYYY-MM-DD' format
 * @param {object} [overrides={}] - Optional property overrides
 * @returns {object} Optimistic rote object with temporary ID
 */
export function createOptimisticRote(title, dateStr, overrides = {}) {
  const tempId = 'temp-' + Date.now()
  return {
    id: tempId,
    title: (title || '').trim(),
    description: '',
    created_at: new Date().toISOString(),
    rote_date: dateStr,
    completed: false,
    completed_at: null,
    ...overrides,
  }
}

/**
 * Computes summary statistics (total, completed count, completion percentage) for a list of rotes.
 *
 * @param {Array} rotes - List of rote items
 * @returns {{ total: number, completed: number, percentage: number, total_rotes: number, completed_rotes: number }}
 */
export function computeRoteStats(rotes = []) {
  const safeRotes = Array.isArray(rotes) ? rotes : []
  const total = safeRotes.length
  const completed = safeRotes.filter(r => Boolean(r && r.completed)).length
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0
  return {
    total,
    completed,
    percentage,
    total_rotes: total,
    completed_rotes: completed,
  }
}

/**
 * Merges server-retrieved rotes with client-side local rotes, preserving in-flight optimistic
 * items and locally pending toggle states.
 *
 * @param {Array} serverRotes - Rotes array from backend response
 * @param {Array} localRotes - Rotes array from client state or localStorage
 * @param {Set|Array|null} [pendingTempToggles=null] - Optional set of temp IDs with pending toggles
 * @returns {Array} Reconciled rotes array
 */
export function mergeRotes(serverRotes = [], localRotes = [], pendingTempToggles = null) {
  const safeServer = Array.isArray(serverRotes) ? serverRotes : []
  const safeLocal = Array.isArray(localRotes) ? localRotes : []
  const localMap = new Map(safeLocal.map(r => [String(r.id), r]))

  const isPendingTemp = id => {
    if (!pendingTempToggles) return false
    if (typeof pendingTempToggles.has === 'function') {
      return pendingTempToggles.has(id)
    }
    if (Array.isArray(pendingTempToggles)) {
      return pendingTempToggles.includes(id)
    }
    return false
  }

  let merged = safeServer.map(sr => {
    const lr = localMap.get(String(sr.id))
    if (lr && (isPendingTemp(String(sr.id)) || lr.completed !== sr.completed)) {
      return { ...sr, completed: lr.completed }
    }
    return sr
  })

  const pendingTemps = safeLocal.filter(r => String(r.id).startsWith('temp-'))
  for (const temp of pendingTemps) {
    if (!merged.some(m => m.title === temp.title || String(m.id) === String(temp.id))) {
      merged.push(temp)
    }
  }

  return merged
}

/**
 * Reconciles full server data payload with client-side local state, recalculating stats.
 *
 * @param {object} serverData - Payload returned from GET /api/rotes
 * @param {Array} localRotes - Local rotes list
 * @param {Set|Array|null} [pendingTempToggles=null] - Optional pending temp toggle tracker
 * @returns {object} Reconciled data object with updated stats
 */
export function reconcileRotesData(serverData = {}, localRotes = [], pendingTempToggles = null) {
  const mergedRotes = mergeRotes(serverData?.rotes || [], localRotes, pendingTempToggles)
  const stats = computeRoteStats(mergedRotes)
  return {
    ...serverData,
    rotes: mergedRotes,
    stats: {
      ...(serverData?.stats || {}),
      total_rotes: stats.total_rotes,
      completed_rotes: stats.completed_rotes,
    },
  }
}
