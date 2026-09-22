import React, { useState, useEffect, useRef } from 'react'
import {
  subscribeSyncStatus,
  flushSyncQueue,
  SyncStatus
} from '../services/syncManager.js'

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

  // App signature legacy palette #c8f26a for all loading and synced states
  let dotColor = '#c8f26a'
  let dotShadow = '0 0 6px rgba(200, 242, 106, 0.75)'
  let tooltip = 'All data synced with cloud'

  if (isOffline) {
    dotColor = '#ef4444'
    dotShadow = '0 0 5px rgba(239, 68, 68, 0.7)'
    tooltip = 'Offline: Saved locally'
  } else if (isPending) {
    dotColor = '#c8f26a'
    dotShadow = '0 0 6px rgba(200, 242, 106, 0.75)'
    tooltip = 'Waiting for internet to sync'
  } else if (isSyncing) {
    dotColor = '#c8f26a'
    dotShadow = '0 0 8px rgba(200, 242, 106, 0.9)'
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
        width: '18px',
        height: '18px',
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
      {/* Original multi-wave ripple radiating in signature green (#c8f26a) when syncing */}
      {isSyncing && (
        <>
          <span
            className="sync-ripple-ring"
            style={{
              gridArea: '1 / 1',
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              border: '1.5px solid #c8f26a',
              boxShadow: '0 0 6px rgba(200, 242, 106, 0.45)',
              boxSizing: 'border-box',
              animation: 'syncRipple 1.4s cubic-bezier(0, 0.2, 0.8, 1) infinite',
              pointerEvents: 'none',
              margin: 'auto',
            }}
          />
          <span
            className="sync-ripple-ring"
            style={{
              gridArea: '1 / 1',
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              border: '1.5px solid #c8f26a',
              boxShadow: '0 0 4px rgba(200, 242, 106, 0.35)',
              boxSizing: 'border-box',
              animation: 'syncRipple 1.4s cubic-bezier(0, 0.2, 0.8, 1) 0.7s infinite',
              pointerEvents: 'none',
              margin: 'auto',
            }}
          />
        </>
      )}

      {/* Center dot only: completely borderless and boundary-free */}
      <span
        className="sync-center-dot"
        style={{
          gridArea: '1 / 1',
          width: '7.5px',
          height: '7.5px',
          borderRadius: '50%',
          background: dotColor,
          boxShadow: dotShadow,
          display: 'block',
          margin: 'auto',
          zIndex: 2,
          transition: 'background 0.25s ease, box-shadow 0.25s ease',
        }}
      />
    </div>
  )
}

export default SyncStatusBadge
