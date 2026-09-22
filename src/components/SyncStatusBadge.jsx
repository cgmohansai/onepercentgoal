import React, { useState, useEffect } from 'react'
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

  const handleClick = (e) => {
    e.stopPropagation()
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

  // App default palette #c8f26a for synced, Silk blue #366cf3 for syncing
  let dotColor = '#c8f26a'
  let dotShadow = '0 0 5px rgba(200, 242, 106, 0.55)'
  let tooltip = 'All data synced with cloud'

  if (isOffline) {
    dotColor = '#ef4444'
    dotShadow = '0 0 4px rgba(239, 68, 68, 0.5)'
    tooltip = 'Offline: Saved locally'
  } else if (isPending) {
    dotColor = '#366cf3'
    dotShadow = '0 0 5px rgba(54, 108, 243, 0.55)'
    tooltip = 'Waiting for internet to sync'
  } else if (isSyncing) {
    dotColor = '#366cf3'
    dotShadow = '0 0 6px rgba(54, 108, 243, 0.75)'
    tooltip = 'Syncing with cloud…'
  }

  return (
    <div
      className="sync-status-indicator"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label="Cloud sync status"
      title={tooltip}
      style={{
        position: 'relative',
        display: 'grid',
        placeItems: 'center',
        width: '18px',
        height: '18px',
        cursor: 'pointer',
        boxSizing: 'border-box',
        margin: 0,
        padding: 0,
        overflow: 'visible',
      }}
    >
      {/* Single clean ripple wave radiating in Silk blue (#366cf3) when syncing */}
      {isSyncing && (
        <span
          className="sync-ripple-ring"
          style={{
            gridArea: '1 / 1',
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            border: '1.5px solid #366cf3',
            boxSizing: 'border-box',
            animation: 'syncRipple 1.15s cubic-bezier(0, 0.2, 0.8, 1) infinite',
            pointerEvents: 'none',
            margin: 'auto',
          }}
        />
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
