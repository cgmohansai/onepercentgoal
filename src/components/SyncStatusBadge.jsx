import React, { useState, useEffect, useRef } from 'react'
import {
  subscribeSyncStatus,
  flushSyncQueue,
  SyncStatus
} from '../services/syncManager.js'
import { Ripple } from './Ripple.jsx'

export function SyncStatusBadge({ onShowToast }) {
  const [syncState, setSyncState] = useState({
    status: SyncStatus.SYNCED,
    pendingCount: 0,
    isOnline: true,
  })

  const [isVisible, setIsVisible] = useState(false)
  const prevStatusRef = useRef(SyncStatus.SYNCED)
  const hideTimerRef = useRef(null)

  useEffect(() => {
    const unsub = subscribeSyncStatus(state => {
      setSyncState(state)
    })
    return unsub
  }, [])

  const { status, pendingCount, isOnline } = syncState

  const isPending = status === SyncStatus.PENDING || pendingCount > 0
  const isOffline = status === SyncStatus.OFFLINE || !isOnline
  const isSyncing = status === SyncStatus.SYNCING

  // Only visible when something is updated; fades out 2 seconds after loading process completes
  useEffect(() => {
    const prev = prevStatusRef.current
    prevStatusRef.current = status

    if (isSyncing) {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      setIsVisible(true)
    } else if (prev === SyncStatus.SYNCING && status === SyncStatus.SYNCED) {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      setIsVisible(true)
      hideTimerRef.current = setTimeout(() => {
        setIsVisible(false)
      }, 2000)
    } else if (isOffline || isPending) {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      setIsVisible(true)
    }

    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [status, isSyncing, isOffline, isPending])

  const handleClick = (e) => {
    e.stopPropagation()
    if (!isVisible) return
    if (isPending && isOnline) {
      flushSyncQueue()
      if (onShowToast) onShowToast('Syncing pending changes with cloud…', true)
    } else if (isOffline) {
      if (onShowToast) onShowToast('Offline: Changes saved locally. Will sync when connected.', true)
    } else if (isSyncing) {
      if (onShowToast) onShowToast('Syncing changes with cloud…', false)
    } else {
      if (onShowToast) onShowToast('All data synced with cloud', false)
    }
  }

  // Minimal dot: rendered by the SAME Ripple component (waves off when idle)
  // at the SAME size, so there is zero jump between idle dot and syncing ripple.
  const BADGE_SIZE = 22
  const DOT_SIZE = 6
  let dotColor = '#c8f26a'
  let dotGlow = 'drop-shadow(0 0 3px rgba(200, 242, 106, 0.55))'
  let tooltip = 'All data synced with cloud'

  if (isOffline) {
    dotColor = '#ef4444'
    dotGlow = 'drop-shadow(0 0 3px rgba(239, 68, 68, 0.6))'
    tooltip = 'Offline: Saved locally'
  } else if (isPending) {
    dotColor = '#c8f26a'
    dotGlow = 'drop-shadow(0 0 3px rgba(200, 242, 106, 0.55))'
    tooltip = 'Waiting for internet to sync'
  } else if (isSyncing) {
    dotColor = '#c8f26a'
    dotGlow = 'drop-shadow(0 0 4px rgba(200, 242, 106, 0.65))'
    tooltip = 'Syncing with cloud…'
  }

  return (
    <div
      className="sync-status-indicator"
      onClick={handleClick}
      role="button"
      tabIndex={isVisible ? 0 : -1}
      aria-label="Cloud sync status"
      title={tooltip}
      style={{
        position: 'relative',
        display: 'grid',
        placeItems: 'center',
        width: `${BADGE_SIZE}px`,
        height: `${BADGE_SIZE}px`,
        cursor: isVisible ? 'pointer' : 'default',
        boxSizing: 'border-box',
        margin: 0,
        padding: 0,
        overflow: 'visible',
        opacity: isVisible ? 1 : 0,
        pointerEvents: isVisible ? 'auto' : 'none',
        transition: 'opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Top-right sync indicator: ONLY the Ripple (dot + waves while syncing,
          same dot with waves off when idle). Dot and wave origin are the exact
          same SVG point (22,22) in every state. */}
      <Ripple
        size={BADGE_SIZE}
        dotSize={DOT_SIZE}
        showWaves={isSyncing}
        aria-label={isSyncing ? 'Syncing with cloud' : tooltip}
        role="status"
        style={{
          gridArea: '1 / 1',
          color: dotColor,
          margin: 'auto',
        }}
        dotStyle={{ filter: dotGlow }}
      />
    </div>
  )
}

export default SyncStatusBadge
