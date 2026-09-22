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
import { createRote, toggleRote, deleteRote } from '../features/rotes/roteService.js'

export const SYNC_QUEUE_KEY = 'opg.sync_queue'

export const SyncStatus = {
  SYNCED: 'synced',
  SYNCING: 'syncing',
  PENDING: 'pending', // Waiting for internet to sync with server
  OFFLINE: 'offline',
}

let listeners = new Set()
let activeFlushing = false

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

export function setSyncStatus(status) {
  if (currentStatus !== status) {
    currentStatus = status
    notifyListeners()
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
 * @param {string} action.type - 'UPDATE_GOAL' | 'CREATE_GOAL' | 'COMPLETE_GOAL' | 'DELETE_GOAL' | 'TOGGLE_ROTE' | 'CREATE_ROTE' | 'DELETE_ROTE'
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
    setSyncStatus(SyncStatus.SYNCED)
    return true
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

          case 'CREATE_ROTE':
            await createRote({ title: item.title, description: item.description || '', date: item.date }, token)
            success = true
            break

          case 'DELETE_ROTE':
            await deleteRote(item.roteId, token)
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
    } else {
      currentStatus = !isOnline() ? SyncStatus.OFFLINE : SyncStatus.PENDING
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
