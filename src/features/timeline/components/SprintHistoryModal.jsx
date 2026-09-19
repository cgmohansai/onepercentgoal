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
          <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <p className="eyebrow" style={{ marginBottom: '12px', textAlign: 'center' }}>SPRINT HISTORY</p>
            
            <div className="sprint-history-panel" style={{ width: '100%' }}>
              <div className="confirm-summary-simple" style={{ display: 'block', width: '100%', boxSizing: 'border-box', background: '#171916', border: '1px solid #32352f', padding: '20px 24px', borderRadius: '6px', textAlign: 'center' }}>
                <h2 style={{ fontSize: '26px', marginBottom: '4px', fontWeight: '500', letterSpacing: '-.035em' }}>Sprint #{String(sprint.sprint_number).padStart(2, '0')}</h2>
                <p className="sprint-modal-dates" style={{ color: '#8c9085', fontFamily: '"DM Mono", monospace', fontSize: '13px', margin: '0 0 20px' }}>
                  {formatDateWithTime(start)} — {formatDateWithTime(end)}
                </p>

                <span style={{ display: 'block', color: '#8e9189', fontFamily: '"DM Mono", monospace', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: '4px' }}>Goals Set</span>
                <strong style={{ display: 'block', color: '#eef0e9', fontSize: '22px', fontWeight: '500', letterSpacing: '-.025em', marginBottom: '12px' }}>{sprint.goal_count}</strong>
                
                <span style={{ display: 'block', color: '#8e9189', fontFamily: '"DM Mono", monospace', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: '4px' }}>Goals Completed</span>
                <strong style={{ display: 'block', color: '#eef0e9', fontSize: '22px', fontWeight: '500', letterSpacing: '-.025em', marginBottom: '12px' }}>{sprint.completed_count}</strong>
                
                <span style={{ display: 'block', color: '#8e9189', fontFamily: '"DM Mono", monospace', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: '4px' }}>Average Progress</span>
                <strong style={{ display: 'block', color: '#c9f36a', fontSize: '32px', fontFamily: '"Instrument Serif", serif', fontStyle: 'italic', fontWeight: 'normal', marginBottom: '0' }}>{sprint.average_progress}%</strong>
              </div>
            </div>
          </div>

          {/* Right Column: Goal Checklist Cards */}
          <div style={{ flex: '1.2 1 300px', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <p className="eyebrow" style={{ marginBottom: '12px' }}>GOALS LIST DETAILS</p>
            
            <div className="sprint-history-list">
              {sprint.goals.length ? sprint.goals.map(goal => (
                <button key={goal.id} type="button" className="confirm-summary-simple" onClick={() => { if (goal.completed && onShowGoalDetails) onShowGoalDetails(goal); }} disabled={!goal.completed} aria-label={goal.completed ? `View details for ${goal.title}` : goal.title} style={{ display: 'block', width: '100%', boxSizing: 'border-box', background: '#171916', border: '1px solid #32352f', padding: '16px 20px', borderRadius: '6px', textAlign: 'center', cursor: goal.completed ? 'pointer' : 'default', font: 'inherit', color: 'inherit' }}>
                  <span style={{ display: 'block', color: '#8e9189', fontFamily: '"DM Mono", monospace', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: '4px' }}>Goal</span>
                  <strong style={{ display: 'block', color: '#eef0e9', fontSize: '16px', fontWeight: '500', letterSpacing: '-.025em', marginBottom: '10px', lineHeight: '1.4' }}>{goal.title}</strong>
                  
                  <span style={{ display: 'block', color: '#8e9189', fontFamily: '"DM Mono", monospace', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: '4px' }}>Progress achieved</span>
                  <strong style={{ display: 'block', color: goal.progress_percent === 100 ? '#c9f36a' : '#eef0e9', fontSize: '20px', fontFamily: '"Instrument Serif", serif', fontStyle: 'italic', fontWeight: 'normal', marginBottom: '8px' }}>{goal.progress_percent}%</strong>
                  
                  <span style={{ display: 'block', color: goal.completed ? '#c9f36a' : '#8e9189', fontFamily: '"DM Mono", monospace', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                    {goal.completed ? '✓ Completed in this sprint' : '• Carried to the next sprint'}
                  </span>
                </button>
              )) : <p className="sprint-history-empty" style={{ textAlign: 'center', color: '#8c9085', fontStyle: 'italic', fontSize: '12px', margin: '20px 0' }}>No goals were recorded in this sprint.</p>}
            </div>
          </div>

        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px', borderTop: '1px solid #282a25', paddingTop: '16px' }}>
          <button className="add-button" type="button" onClick={onClose} style={{ minWidth: '120px', height: '36px', fontSize: '12px' }}>Close</button>
        </div>
      </section>
    </div>
  )
}

export default SprintHistoryModal
