import React, { useRef, useState, useEffect } from 'react'

export function GoalRow({ goal, onProgress, onComplete, onDelete, onShowDetails }) {
  const rowRef = useRef(null)
  const [draft, setDraft] = useState(goal.value)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    setDraft(goal.value)
  }, [goal.value])

  const hasChanged = draft !== goal.value

  const commitProgress = () => {
    const next = Math.max(goal.value, Math.min(100, Number(draft) || goal.value))
    if (next === 100) {
      onComplete(goal)
    } else if (next !== goal.value) {
      onProgress(goal, next)
    }
  }

  const resetDraft = () => {
    setDraft(goal.value)
  }

  const updateDraft = value => {
    setDraft(Math.max(goal.value, Math.min(100, Number(value) || goal.value)))
  }

  return (
    <div
      className={goal.done ? 'goal complete' : 'goal'}
      ref={rowRef}
      onClick={() => { if (goal.done && onShowDetails) onShowDetails(goal); }}
      style={{ cursor: goal.done ? 'pointer' : 'default' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onBlur={event => {
        if (!rowRef.current?.contains(event.relatedTarget)) {
          setHovered(false)
        }
      }}
      onFocus={() => {
        setHovered(true)
      }}
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
              {hasChanged && <button className="ghost" onClick={commitProgress}>Save</button>}
              {hasChanged && <button className="ghost" onClick={resetDraft}>Cancel</button>}
              {!hasChanged && hovered && (
                <>
                  <button className="ghost" onClick={() => onComplete(goal)}>Complete</button>
                  <button className="ghost btn-delete" onClick={(e) => { e.stopPropagation(); onDelete(goal); }}>Delete</button>
                </>
              )}
            </span>
          )}
          {goal.done && hovered && (
            <span className="goal-inline-actions">
              <button className="ghost btn-delete" onClick={(e) => { e.stopPropagation(); onDelete(goal); }}>Delete</button>
            </span>
          )}
        </span>
        <label className={goal.done ? 'mini-track static' : 'mini-track editable'}>
          <i style={{ width: `${hasChanged ? draft : goal.value}%` }} />
          {!goal.done && <input
            aria-label={`Update ${goal.title} progress`}
            type="range"
            min="0"
            max="100"
            value={draft}
            onChange={event => updateDraft(event.target.value)}
          />}
          {!goal.done && <span className="track-thumb" style={{ left: `${hasChanged ? draft : goal.value}%` }} />}
        </label>
      </span>
      <strong>{hasChanged ? draft : goal.value}%</strong>
    </div>
  )
}

export default GoalRow
