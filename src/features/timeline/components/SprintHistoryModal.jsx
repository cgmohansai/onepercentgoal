import React from 'react'
import { formatDateWithTime } from '../../../utils/dateUtils'

export function SprintHistoryModal({ sprint, onClose, onShowGoalDetails }) {
  const start = new Date(sprint.sprint_start)
  const end = new Date(sprint.sprint_end)

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="completion-modal sprint-modal" onClick={event => event.stopPropagation()} style={{ padding: '32px', maxWidth: '900px', width: '90%', boxSizing: 'border-box' }}>
        
        <div className="sprint-modal-columns" style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
          
          {/* Left Column: Summary and Stats */}
          <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <p className="eyebrow">SPRINT HISTORY</p>
            <h2 style={{ fontSize: '26px', marginBottom: '4px', fontWeight: '500', letterSpacing: '-.035em' }}>Sprint #{String(sprint.sprint_number).padStart(2, '0')}</h2>
            <p className="sprint-modal-dates" style={{ color: '#8c9085', fontFamily: '"DM Mono", monospace', fontSize: '13px', margin: '0 0 20px' }}>
              {formatDateWithTime(start)} — {formatDateWithTime(end)}
            </p>
            
            <div className="confirm-summary-simple" style={{ display: 'block', width: '100%', boxSizing: 'border-box', background: '#171916', border: '1px solid #32352f', padding: '20px 24px', borderRadius: '6px', textAlign: 'center' }}>
              <span style={{ display: 'block', color: '#8e9189', fontFamily: '"DM Mono", monospace', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: '4px' }}>Goals Set</span>
              <strong style={{ display: 'block', color: '#eef0e9', fontSize: '22px', fontWeight: '500', letterSpacing: '-.025em', marginBottom: '12px' }}>{sprint.goal_count}</strong>
              
              <span style={{ display: 'block', color: '#8e9189', fontFamily: '"DM Mono", monospace', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: '4px' }}>Goals Completed</span>
              <strong style={{ display: 'block', color: '#eef0e9', fontSize: '22px', fontWeight: '500', letterSpacing: '-.025em', marginBottom: '12px' }}>{sprint.completed_count}</strong>
              
              <span style={{ display: 'block', color: '#8e9189', fontFamily: '"DM Mono", monospace', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: '4px' }}>Average Progress</span>
              <strong style={{ display: 'block', color: '#c9f36a', fontSize: '32px', fontFamily: '"Instrument Serif", serif', fontStyle: 'italic', fontWeight: 'normal', marginBottom: '0' }}>{sprint.average_progress}%</strong>
            </div>
          </div>

          {/* Right Column: Goal Checklist Cards */}
          <div style={{ flex: '1.2 1 340px', display: 'flex', flexDirection: 'column' }}>
            <p className="eyebrow" style={{ marginBottom: '12px' }}>GOALS LIST DETAILS</p>
            
            <div className="sprint-history-list" style={{ maxHeight: '380px', overflowY: 'auto', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '4px' }}>
              {sprint.goals.length ? sprint.goals.map(goal => (
                <div key={goal.id} className="confirm-summary-simple" onClick={() => { if (goal.completed && onShowGoalDetails) onShowGoalDetails(goal); }} style={{ display: 'block', width: '100%', boxSizing: 'border-box', background: '#171916', border: '1px solid #32352f', padding: '16px 20px', borderRadius: '6px', textAlign: 'center', cursor: goal.completed ? 'pointer' : 'default' }}>
                  <span style={{ display: 'block', color: '#8e9189', fontFamily: '"DM Mono", monospace', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: '4px' }}>Goal</span>
                  <strong style={{ display: 'block', color: '#eef0e9', fontSize: '16px', fontWeight: '500', letterSpacing: '-.025em', marginBottom: '10px', lineHeight: '1.4' }}>{goal.title}</strong>
                  
                  <span style={{ display: 'block', color: '#8e9189', fontFamily: '"DM Mono", monospace', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: '4px' }}>Progress achieved</span>
                  <strong style={{ display: 'block', color: goal.progress_percent === 100 ? '#c9f36a' : '#eef0e9', fontSize: '20px', fontFamily: '"Instrument Serif", serif', fontStyle: 'italic', fontWeight: 'normal', marginBottom: '8px' }}>{goal.progress_percent}%</strong>
                  
                  <span style={{ display: 'block', color: goal.completed ? '#c9f36a' : '#8e9189', fontFamily: '"DM Mono", monospace', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                    {goal.completed ? '✓ Completed in this sprint' : '• Carried to the next sprint'}
                  </span>
                </div>
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
