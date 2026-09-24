import React from 'react'
import { useEscapeKey } from '../../../hooks/useEscapeKey'
import { formatDateWithTime } from '../../../utils/dateUtils'

export function SprintHistoryModal({ sprint, onClose, onShowGoalDetails }) {
  useEscapeKey(onClose, !sprint)
  const start = new Date(sprint.sprint_start)
  const end = new Date(sprint.sprint_end)

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="completion-modal sprint-modal" onClick={event => event.stopPropagation()}>
        
        <div className="sprint-modal-columns">
          
          {/* Left Column: Summary and Stats */}
          <div className="sprint-summary-col">
            <p className="eyebrow sprint-col-eyebrow">SPRINT HISTORY</p>
            
            <div className="sprint-history-panel">
              <div className="sprint-summary-card">
                <h2 className="sprint-summary-title">Sprint #{String(sprint.sprint_number).padStart(2, '0')}</h2>
                <p className="sprint-modal-dates">
                  {formatDateWithTime(start)} — {formatDateWithTime(end)}
                </p>

                <div className="sprint-stats-grid">
                  <div className="sprint-stat-item">
                    <span className="sprint-stat-label">Goals Set</span>
                    <strong className="sprint-stat-val">{sprint.goal_count}</strong>
                  </div>
                  
                  <div className="sprint-stat-item">
                    <span className="sprint-stat-label">Goals Completed</span>
                    <strong className="sprint-stat-val">{sprint.completed_count}</strong>
                  </div>
                  
                  <div className="sprint-stat-item sprint-stat-progress">
                    <span className="sprint-stat-label">Average Progress</span>
                    <strong className="sprint-stat-avg">{sprint.average_progress}%</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Goal Checklist Cards */}
          <div className="sprint-goals-col">
            <p className="eyebrow sprint-col-eyebrow">GOALS LIST DETAILS</p>
            
            <div className="sprint-history-list">
              {sprint.goals.length ? sprint.goals.map(goal => (
                <button
                  key={goal.id}
                  type="button"
                  className="sprint-goal-item-card"
                  onClick={() => { if (goal.completed && onShowGoalDetails) onShowGoalDetails(goal); }}
                  disabled={!goal.completed}
                  aria-label={goal.completed ? `View details for ${goal.title}` : goal.title}
                >
                  <span className="sprint-item-eyebrow">Goal</span>
                  <strong className="sprint-item-title">{goal.title}</strong>
                  
                  <div className="sprint-item-footer">
                    <div>
                      <span className="sprint-item-eyebrow">Progress</span>
                      <strong className={`sprint-item-progress ${goal.progress_percent === 100 ? 'complete' : ''}`}>
                        {goal.progress_percent}%
                      </strong>
                    </div>
                    <span className={`sprint-item-status-tag ${goal.completed ? 'completed' : 'carried'}`}>
                      {goal.completed ? '✓ Completed' : '• Carried to next'}
                    </span>
                  </div>
                </button>
              )) : (
                <p className="sprint-history-empty">No goals were recorded in this sprint.</p>
              )}
            </div>
          </div>

        </div>

        <div className="modal-actions center-actions" style={{ marginTop: '20px' }}>
          <button className="modal-btn modal-btn-secondary" type="button" onClick={onClose}>Close</button>
        </div>
      </section>
    </div>
  )
}

export default SprintHistoryModal
