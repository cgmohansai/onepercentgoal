import React, { useRef, useState, useEffect } from 'react'

export function GoalRow({ goal, onProgress, onComplete, onDelete, onShowDetails }) {
  const rowRef = useRef(null)
  const [draft, setDraft] = useState(goal.value)
  const [isSelected, setIsSelected] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  useEffect(() => {
    setDraft(goal.value)
  }, [goal.value])

  const hasChanged = draft !== goal.value
  const showActions = isSelected || isHovered || hasChanged

  // Deselect and revert uncommitted changes if user taps or presses any other part of the screen
  useEffect(() => {
    if (!isSelected && !hasChanged && !isHovered) return

    const handlePointerDownOutside = (event) => {
      if (rowRef.current && !rowRef.current.contains(event.target)) {
        setIsSelected(false)
        setIsHovered(false)
        setDraft(goal.value)
      }
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsSelected(false)
        setIsHovered(false)
        setDraft(goal.value)
      }
    }

    document.addEventListener('pointerdown', handlePointerDownOutside)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDownOutside)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isSelected, hasChanged, isHovered, goal.value])

  const commitProgress = (e) => {
    if (e) e.stopPropagation()
    const next = Math.max(goal.value, Math.min(100, Number(draft) || goal.value))
    setIsSelected(false)
    setIsHovered(false)
    if (next === 100) {
      onComplete(goal)
    } else if (next !== goal.value) {
      onProgress(goal, next)
    }
  }

  const resetDraft = (e) => {
    if (e) e.stopPropagation()
    setDraft(goal.value)
    setIsSelected(false)
    setIsHovered(false)
  }

  const updateDraft = (value) => {
    setDraft(Math.max(goal.value, Math.min(100, Number(value) || goal.value)))
  }

  const handleRowClick = () => {
    if (goal.done) {
      if (onShowDetails) onShowDetails(goal)
      return
    }
    setIsSelected(true)
  }

  return (
    <div
      className={`goal${goal.done ? ' complete' : ''}${isSelected ? ' selected' : ''}`}
      ref={rowRef}
      onClick={handleRowClick}
      style={{ cursor: goal.done ? 'pointer' : 'default' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <span className="checkbox">{goal.done && '✓'}</span>
      <span className="goal-content">
        <span className="goal-topline">
          <span className="goal-copy">
            <b>{goal.title}</b>
            <small>{goal.label}</small>
          </span>
          {!goal.done && (
            <span className="goal-inline-actions">
              {hasChanged && (
                <>
                  <button type="button" className="ghost" onPointerDown={(e) => e.stopPropagation()} onClick={commitProgress}>Save</button>
                  <button type="button" className="ghost" onPointerDown={(e) => e.stopPropagation()} onClick={resetDraft}>Cancel</button>
                </>
              )}
              {!hasChanged && showActions && (
                <>
                  <button
                    type="button"
                    className="ghost"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      onComplete(goal)
                    }}
                  >
                    Complete
                  </button>
                  <button
                    type="button"
                    className="ghost btn-delete"
                    aria-label={`Delete ${goal.title}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(goal)
                    }}
                  >
                    Delete
                  </button>
                </>
              )}
            </span>
          )}
        </span>
        <label
          className={goal.done ? 'mini-track static' : 'mini-track editable'}
          onClick={(e) => e.stopPropagation()}
        >
          <i style={{ width: `${hasChanged ? draft : goal.value}%` }} />
          {!goal.done && (
            <input
              aria-label={`Update ${goal.title} progress`}
              type="range"
              min="0"
              max="100"
              value={draft}
              onPointerDown={() => setIsSelected(true)}
              onChange={(event) => {
                setIsSelected(true)
                updateDraft(event.target.value)
              }}
            />
          )}
          {!goal.done && (
            <span
              className="track-thumb"
              style={{
                left: `${hasChanged ? draft : goal.value}%`,
                opacity: showActions ? 1 : undefined,
              }}
            />
          )}
        </label>
      </span>
      <strong>{hasChanged ? draft : goal.value}%</strong>
    </div>
  )
}

export default GoalRow
