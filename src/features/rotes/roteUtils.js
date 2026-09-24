/**
 * Rotes utilities, state derivation, and local persistence for OnePercentGoal (OPG).
 *
 * Preserves the exact storage key format: 'opg.rotes.<dateStr>'
 */

import { isRoteInFlight } from '../../services/syncManager.js'

export const ROTES_STORAGE_PREFIX = 'opg.rotes.'

export const DELETED_ROTES_STORAGE_KEY = 'opg.deleted_rotes'

/**
 * Tombstones for rotes the user deleted locally: background merges must
 * never resurrect them (e.g. server still has the rote because the delete
 * request failed and is queued for retry). Same pattern as goal tombstones.
 */
export function getDeletedRoteIds() {
  try {
    if (typeof localStorage === 'undefined') return new Set()
    const raw = localStorage.getItem(DELETED_ROTES_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    return new Set(Array.isArray(parsed) ? parsed.map(String) : [])
  } catch {
    return new Set()
  }
}

export function trackDeletedRoteId(roteId) {
  try {
    if (typeof localStorage === 'undefined') return
    if (roteId === null || roteId === undefined) return
    const ids = getDeletedRoteIds()
    ids.add(String(roteId))
    localStorage.setItem(DELETED_ROTES_STORAGE_KEY, JSON.stringify(Array.from(ids)))
  } catch {}
}

export function clearDeletedRoteIds() {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.removeItem(DELETED_ROTES_STORAGE_KEY)
  } catch {}
}

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
  // Locally deleted rotes stay deleted: filter tombstoned ids from both
  // sides so a lagging server response can never resurrect them.
  const dead = getDeletedRoteIds()
  const liveServer = dead.size > 0 ? safeServer.filter(r => !dead.has(String(r?.id))) : safeServer
  const liveLocal = dead.size > 0 ? safeLocal.filter(r => !dead.has(String(r?.id))) : safeLocal
  const localMap = new Map(liveLocal.map(r => [String(r.id), r]))

  const isPending = id => {
    const idStr = String(id)
    if (isRoteInFlight(idStr)) return true
    if (!pendingTempToggles) return false
    if (typeof pendingTempToggles.has === 'function') {
      return pendingTempToggles.has(idStr)
    }
    if (Array.isArray(pendingTempToggles)) {
      return pendingTempToggles.includes(idStr)
    }
    return false
  }

  let merged = liveServer.map(sr => {
    const lr = localMap.get(String(sr.id))
    if (lr && isPending(String(sr.id))) {
      return { ...sr, completed: lr.completed, passed: lr.passed }
    }
    return sr
  })

  const pendingTemps = liveLocal.filter(r => String(r.id).startsWith('temp-'))
  for (const temp of pendingTemps) {
    if (!merged.some(m => m.title === temp.title || String(m.id) === String(temp.id))) {
      merged.push(temp)
    }
  }

  return merged
}

/**
 * Compares two rotes lists to detect whether server data differs from client state
 * (e.g. routine completed/pending toggled, rotes created or deleted on another device).
 *
 * @param {Array} prevRotes - Previous rotes array
 * @param {Array} newRotes - Incoming rotes array
 * @returns {boolean} True if differences were found
 */
export function haveRotesDiffered(prevRotes = [], newRotes = []) {
  if (!prevRotes || !newRotes) return false
  if (prevRotes.length !== newRotes.length) return true
  const prevMap = new Map(prevRotes.map(r => [String(r.id), r]))
  for (const n of newRotes) {
    const idStr = String(n.id)
    if (isRoteInFlight(idStr)) continue
    const p = prevMap.get(idStr)
    if (!p) return true
    if (Boolean(p.completed) !== Boolean(n.completed)) return true
    if (Boolean(p.passed) !== Boolean(n.passed)) return true
    if (p.title !== n.title) return true
  }
  return false
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
