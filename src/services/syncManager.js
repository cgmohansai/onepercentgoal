/**
 * Universal Sync & Offline Manager for OnePercentGoal (OPG).
 *
 * Responsibilities:
 * - Manages sync state: 'synced', 'syncing', 'pending' (waiting for internet), 'offline'.
 * - Provides a resilient queue for actions performed offline or during network dropouts.
 * - Dispatches immediate updates to the server when online.
 * - Flushes pending queue automatically when network connection is restored.
 * - Emits state changes to components (e.g. SyncStatusBadge).
 */

import { getStoredToken } from './apiClient.js'
import { createGoal, updateGoal, completeGoal, deleteGoal } from '../features/goals/goalService.js'
import { createRote, toggleRote, passRote, deleteRote } from '../features/rotes/roteService.js'
import { createNote, updateNote, deleteNote } from '../features/notes/noteService.js'

export const SYNC_QUEUE_KEY = 'opg.sync_queue'

export const SyncStatus = {
  SYNCED: 'synced',
  SYNCING: 'syncing',
  PENDING: 'pending', // Waiting for internet to sync with server
  OFFLINE: 'offline',
}

let listeners = new Set()
let activeFlushing = false
// Consecutive-failure backoff: a persistently failing queue (e.g. server
// error) must not hammer the backend — or blink the indicator — every second.
let flushFailCount = 0
let lastFlushFailAt = 0
const FLUSH_BACKOFF_MS = 30000

function isOnline() {
  return typeof navigator !== 'undefined' ? navigator.onLine !== false : true
}

export function getSyncQueue() {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(SYNC_QUEUE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function setSyncQueue(queue) {
  try {
    if (typeof localStorage === 'undefined') return
    if (!queue || queue.length === 0) {
      localStorage.removeItem(SYNC_QUEUE_KEY)
    } else {
      localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue))
    }
  } catch {}
}

let currentStatus = !isOnline()
  ? SyncStatus.OFFLINE
  : getSyncQueue().length > 0
    ? SyncStatus.PENDING
    : SyncStatus.SYNCED

function notifyListeners() {
  const queue = getSyncQueue()
  const snapshot = {
    status: currentStatus,
    pendingCount: queue.length,
    isOnline: isOnline(),
  }
  listeners.forEach(fn => {
    try { fn(snapshot) } catch {}
  })
}

export function getSyncState() {
  const queue = getSyncQueue()
  return {
    status: currentStatus,
    pendingCount: queue.length,
    isOnline: isOnline(),
  }
}

// Active in-flight entity mutation tracking to prevent background polling race conditions
const inFlightRotes = new Set()
const inFlightGoals = new Set()

export function markRoteInFlight(id) {
  if (id !== null && id !== undefined) inFlightRotes.add(String(id))
}

export function unmarkRoteInFlight(id) {
  if (id !== null && id !== undefined) inFlightRotes.delete(String(id))
}

export function isRoteInFlight(id) {
  return inFlightRotes.has(String(id))
}

export function markGoalInFlight(id) {
  if (id !== null && id !== undefined) inFlightGoals.add(String(id))
}

export function unmarkGoalInFlight(id) {
  if (id !== null && id !== undefined) inFlightGoals.delete(String(id))
}

export function isGoalInFlight(id) {
  return inFlightGoals.has(String(id))
}

let transientSyncTimeout = null

export function setSyncStatus(status) {
  if (transientSyncTimeout && status !== SyncStatus.SYNCING) {
    clearTimeout(transientSyncTimeout)
    transientSyncTimeout = null
  }
  if (currentStatus !== status) {
    currentStatus = status
    notifyListeners()
  }
}

/**
 * Triggers a temporary blue ripple sync status (e.g. when detecting real-time
 * cross-device updates) that automatically settles back to synced or pending.
 *
 * @param {number} durationMs - Duration in milliseconds (default: 1200ms)
 */
export function triggerTransientSync(durationMs = 1200) {
  setSyncStatus(SyncStatus.SYNCING)
  if (transientSyncTimeout) clearTimeout(transientSyncTimeout)
  transientSyncTimeout = setTimeout(() => {
    transientSyncTimeout = null
    const queue = getSyncQueue()
    if (!isOnline()) {
      setSyncStatus(SyncStatus.OFFLINE)
    } else if (queue.length > 0) {
      setSyncStatus(SyncStatus.PENDING)
    } else {
      setSyncStatus(SyncStatus.SYNCED)
    }
  }, durationMs)
}

/**
 * Executes a sync action with guaranteed minimum blue ripple duration and smooth toast presentation.
 * 1. Immediately turns ON the blue ripple.
 * 2. Runs the async operation (server API update).
 * 3. Awaits both the operation and minRippleMs (default 850ms).
 * 4. Turns OFF the blue ripple (settling back to SYNCED).
 * 5. Calls onSuccess callback (e.g. to show toast msg) AFTER the ripple is completely gone.
 *
 * @param {Function} asyncOperation - () => Promise<any>
 * @param {object} options
 * @param {number} [options.minRippleMs=850]
 * @param {Function} [options.onSuccess] - (result) => void
 * @param {Function} [options.onError] - (error) => void
 * @returns {Promise<any>}
 */
export async function executeSyncWithRipple(asyncOperation, { minRippleMs = 850, onSuccess, onError } = {}) {
  setSyncStatus(SyncStatus.SYNCING)
  const startTime = Date.now()
  try {
    const result = await asyncOperation()
    const elapsed = Date.now() - startTime
    if (elapsed < minRippleMs) {
      await new Promise(r => setTimeout(r, minRippleMs - elapsed))
    }
    setSyncStatus(SyncStatus.SYNCED)
    if (onSuccess) {
      setTimeout(() => onSuccess(result), 120)
    }
    return result
  } catch (err) {
    const elapsed = Date.now() - startTime
    if (elapsed < minRippleMs) {
      await new Promise(r => setTimeout(r, minRippleMs - elapsed))
    }
    const queue = getSyncQueue()
    setSyncStatus(queue.length > 0 ? SyncStatus.PENDING : (!isOnline() ? SyncStatus.OFFLINE : SyncStatus.SYNCED))
    if (onError) {
      setTimeout(() => onError(err), 120)
    }
    throw err
  }
}

export function subscribeSyncStatus(fn) {
  listeners.add(fn)
  fn(getSyncState())
  return () => listeners.delete(fn)
}

/**
 * Enqueues an action to be synchronized when online.
 * Deduplicates updates to the same entity when appropriate.
 *
 * @param {object} action - Action descriptor
  * @param {string} action.type - 'UPDATE_GOAL' | 'CREATE_GOAL' | 'COMPLETE_GOAL' | 'DELETE_GOAL' | 'TOGGLE_ROTE' | 'PASS_ROTE' | 'CREATE_ROTE' | 'DELETE_ROTE' | 'CREATE_NOTE' | 'UPDATE_NOTE' | 'DELETE_NOTE'
 */
export function enqueueSyncAction(action) {
  const queue = getSyncQueue()
  const actionId = action.id || `${action.type}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const item = { ...action, id: actionId, timestamp: Date.now() }

  // Deduplicate consecutive updates to the same goal
  let nextQueue
  if (action.type === 'UPDATE_GOAL' && action.goalId) {
    nextQueue = queue.filter(q => !(q.type === 'UPDATE_GOAL' && String(q.goalId) === String(action.goalId)))
    nextQueue.push(item)
  } else if (action.type === 'UPDATE_NOTE' && action.noteId) {
    nextQueue = queue.filter(q => !(q.type === 'UPDATE_NOTE' && String(q.noteId) === String(action.noteId)))
    nextQueue.push(item)
  } else if (action.type === 'TOGGLE_ROTE' && action.roteId && action.date) {
    nextQueue = queue.filter(q => !(q.type === 'TOGGLE_ROTE' && String(q.roteId) === String(action.roteId) && q.date === action.date))
    nextQueue.push(item)
  } else {
    nextQueue = [...queue, item]
  }

  setSyncQueue(nextQueue)
  currentStatus = !isOnline() ? SyncStatus.OFFLINE : SyncStatus.PENDING
  notifyListeners()
}

/**
 * Attempts to flush all pending queue items to the server.
 *
 * @param {string|null} [explicitToken=null]
 * @returns {Promise<boolean>} True if all queued items succeeded
 */
export async function flushSyncQueue(explicitToken = null) {
  if (activeFlushing) return false
  const token = explicitToken || getStoredToken()
  if (!token) return false

  if (!isOnline()) {
    setSyncStatus(SyncStatus.OFFLINE)
    return false
  }

  const queue = getSyncQueue()
  if (queue.length === 0) {
    flushFailCount = 0
    setSyncStatus(SyncStatus.SYNCED)
    return true
  }

  // Back off after repeated failures; the 1s poll will retry once it lapses.
  if (flushFailCount >= 3 && Date.now() - lastFlushFailAt < FLUSH_BACKOFF_MS) {
    return false
  }

  activeFlushing = true
  setSyncStatus(SyncStatus.SYNCING)

  let remaining = [...queue]
  let hasFailure = false

  try {
    for (const item of queue) {
      try {
        let success = false
        switch (item.type) {
          case 'UPDATE_GOAL':
            await updateGoal(item.goalId, item.payload, token)
            success = true
            break

          case 'CREATE_GOAL':
            await createGoal(item.title, token)
            success = true
            break

          case 'COMPLETE_GOAL':
            await completeGoal(item.goalId, item.note, token)
            success = true
            break

          case 'DELETE_GOAL':
            await deleteGoal(item.goalId, token)
            success = true
            break

          case 'TOGGLE_ROTE':
            await toggleRote(item.roteId, { date: item.date, completed: item.completed }, token)
            success = true
            break

          case 'PASS_ROTE':
            await passRote(item.roteId, { date: item.date }, token)
            success = true
            break

          case 'CREATE_ROTE':
            await createRote({ title: item.title, description: item.description || '', date: item.date }, token)
            success = true
            break

          case 'DELETE_ROTE':
            await deleteRote(item.roteId, token)
            success = true
            break

          case 'CREATE_NOTE':
            await createNote({ body: item.body, title: item.title || '', links: item.links || [], goalId: item.goalId ?? null, roteId: item.roteId ?? null, pinned: Boolean(item.pinned), clientId: item.tempId || item.clientId || null }, token)
            success = true
            break

          case 'UPDATE_NOTE':
            await updateNote(item.noteId, { body: item.body, title: item.title, pinned: item.pinned, links: item.links, goalId: item.goalId, roteId: item.roteId }, item.baseVersion ?? null, token)
            success = true
            break

          case 'DELETE_NOTE':
            await deleteNote(item.noteId, token)
            success = true
            break

          default:
            success = true
            break
        }

        if (success) {
          remaining = remaining.filter(r => r.id !== item.id)
          setSyncQueue(remaining)
        }
      } catch (err) {
        console.warn(`Sync failed for action ${item.type}:`, err)
        hasFailure = true
        // If network error, stop flushing until connection stabilizes
        if (!isOnline()) break
      }
    }
  } finally {
    activeFlushing = false
    setSyncQueue(remaining)
    if (remaining.length === 0) {
      currentStatus = SyncStatus.SYNCED
      flushFailCount = 0
    } else {
      currentStatus = !isOnline() ? SyncStatus.OFFLINE : SyncStatus.PENDING
      if (hasFailure) {
        flushFailCount += 1
        lastFlushFailAt = Date.now()
      }
    }
    notifyListeners()
  }

  return !hasFailure && remaining.length === 0
}

// Global network status and lifecycle listeners
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    const queue = getSyncQueue()
    if (queue.length > 0) {
      setSyncStatus(SyncStatus.PENDING)
      flushSyncQueue()
    } else {
      setSyncStatus(SyncStatus.SYNCED)
    }
  })

  window.addEventListener('offline', () => {
    setSyncStatus(SyncStatus.OFFLINE)
  })

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && isOnline() && getSyncQueue().length > 0) {
        flushSyncQueue()
      }
    })
  }

  // Native Android reopen: flush pending queue on Capacitor resume as well
  // (WebView focus/visibility events don't reliably fire on app reopen).
  try {
    if (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
      const appPlugin = window.Capacitor.Plugins.App
      if (appPlugin && typeof appPlugin.addListener === 'function') {
        appPlugin.addListener('resume', () => {
          if (isOnline() && getSyncQueue().length > 0) {
            flushSyncQueue()
          }
        })
      }
    }
  } catch {}
}

export default {
  SyncStatus,
  getSyncState,
  getSyncQueue,
  setSyncStatus,
  subscribeSyncStatus,
  enqueueSyncAction,
  flushSyncQueue,
}
