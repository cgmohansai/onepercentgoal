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
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const unsub = subscribeSyncStatus(state => {
      setSyncState(state)
    })
    return unsub
  }, [])

  const { status, pendingCount, isOnline } = syncState

  // If synced with no pending items, we can keep the badge minimal / subtle
  const isPending = status === SyncStatus.PENDING || pendingCount > 0
  const isOffline = status === SyncStatus.OFFLINE || !isOnline
  const isSyncing = status === SyncStatus.SYNCING

  const handleClick = (e) => {
    e.stopPropagation()
    if (isPending && isOnline) {
      flushSyncQueue()
      if (onShowToast) onShowToast('Syncing pending changes to server…', true)
    } else if (isOffline) {
      if (onShowToast) {
        onShowToast('Offline: Changes saved safely to device. Will sync to server when connected.', true)
      }
    } else {
      if (onShowToast) onShowToast('All changes are synced with the server', false)
    }
    setExpanded(prev => !prev)
  }

  // Label and appearance
  let dotColor = '#a8e63d' // green
  let label = 'Synced'
  let textColor = '#8e9189'
  let borderColor = 'rgba(255, 255, 255, 0.08)'
  let bgColor = 'rgba(20, 21, 19, 0.75)'

  if (isSyncing) {
    dotColor = '#60a5fa' // blue
    label = 'Syncing to server…'
    textColor = '#93c5fd'
    borderColor = 'rgba(96, 165, 250, 0.3)'
    bgColor = 'rgba(23, 37, 84, 0.75)'
  } else if (isPending) {
    dotColor = '#fbbf24' // amber
    label = pendingCount > 1 ? `Waiting for internet (${pendingCount})` : 'Waiting for internet to sync'
    textColor = '#fde68a'
    borderColor = 'rgba(251, 191, 36, 0.3)'
    bgColor = 'rgba(69, 41, 7, 0.75)'
  } else if (isOffline) {
    dotColor = '#f87171' // red/amber
    label = 'Offline • Saved locally'
    textColor = '#fca5a5'
    borderColor = 'rgba(248, 113, 113, 0.3)'
    bgColor = 'rgba(69, 10, 10, 0.75)'
  }

  return (
    <div
      className="sync-status-badge"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      title="Tap to check server sync status"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 8px',
        borderRadius: '12px',
        fontSize: '10.5px',
        fontFamily: '"DM Mono", monospace',
        letterSpacing: '.04em',
        background: bgColor,
        border: `1px solid ${borderColor}`,
        color: textColor,
        cursor: 'pointer',
        userSelect: 'none',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        transition: 'all 0.2s ease',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: dotColor,
          boxShadow: isSyncing || isPending ? `0 0 6px ${dotColor}` : 'none',
          display: 'inline-block',
          animation: isSyncing ? 'pulse 1s infinite alternate' : 'none',
        }}
      />
      <span style={{ whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </div>
  )
}

export default SyncStatusBadge
