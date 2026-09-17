import React from 'react'

export function GoalDetailsModal({ goal, onClose }) {
  if (!goal) return null

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="completion-modal confirm-modal" onClick={event => event.stopPropagation()}>
        <p className="eyebrow" style={{ color: '#c9f36a' }}>COMPLETED GOAL DETAILS</p>
        <h2 style={{ fontSize: '24px', marginBottom: '16px', fontWeight: '500', letterSpacing: '-.035em' }}>Goal Progress & Reflection</h2>
        
        <div className="confirm-summary-simple" style={{ display: 'block', width: '100%', boxSizing: 'border-box', background: '#171916', border: '1px solid #32352f', padding: '20px 24px', borderRadius: '6px', marginBottom: '24px', textAlign: 'center', wordBreak: 'break-word', maxHeight: '320px', overflowY: 'auto' }}>
          <span style={{ display: 'block', color: '#8e9189', fontFamily: '"DM Mono", monospace', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: '6px' }}>Goal</span>
          <strong style={{ display: 'block', color: '#eef0e9', fontSize: '20px', fontWeight: '500', letterSpacing: '-.025em', marginBottom: '20px', lineHeight: '1.4' }}>{goal.title}</strong>
          <span style={{ display: 'block', color: '#8e9189', fontFamily: '"DM Mono", monospace', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: '6px' }}>Reflection / Note</span>
          <p style={{ margin: 0, color: '#c9f36a', fontSize: '24px', fontFamily: '"Instrument Serif", serif', fontStyle: 'italic', lineHeight: '1.35', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            “{goal.completion_note || 'No reflection note was written.'}”
          </p>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <button className="add-button" type="button" onClick={onClose} style={{ minWidth: '120px' }}>Close</button>
        </div>
      </div>
    </div>
  )
}

export default GoalDetailsModal
