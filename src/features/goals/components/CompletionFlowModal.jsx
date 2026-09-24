import React from 'react'
import { useEscapeKey } from '../../../hooks/useEscapeKey'
import HeaderInfoTooltip from '../../../components/HeaderInfoTooltip'

export function CompletionFlowModal({ flow, setFlow, onContinue, onComplete, onCancel }) {
  useEscapeKey(onCancel, !flow)
  if (!flow) return null

  if (flow.step === 'note') {
    return (
      <div className="modal-backdrop" role="presentation">
        <form
          className="completion-modal"
          onSubmit={event => {
            event.preventDefault()
            onContinue()
          }}
        >
        <p className="eyebrow eyebrow-sm">Mark as completed</p>
        <h2 className="modal-title-lg">{flow.goal.title}</h2>
        <div className="reflection-label-row" style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label htmlFor="completion-reflection-note" className="reflection-label" style={{ margin: 0 }}>
            How did you complete it? (Required)
          </label>
          <HeaderInfoTooltip description="This note will appear in the shareable image." />
        </div>
        <textarea
          id="completion-reflection-note"
          autoFocus
          required
          value={flow.note}
          onChange={event => setFlow(curr => curr ? { ...curr, note: event.target.value } : curr)}
          placeholder="Your final sprint reflection…"
        />
        <div className="modal-actions">
          <button type="button" className="modal-btn modal-btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="modal-btn modal-btn-primary">Continue</button>
        </div>
      </form>
    </div>
  )
}

  if (flow.step === 'confirm') {
    return (
      <div className="modal-backdrop" role="presentation">
        <form
          className="completion-modal confirm-modal"
          onSubmit={event => {
            event.preventDefault()
            onComplete()
          }}
        >
          <p className="eyebrow" style={{ color: '#c9f36a' }}>CONFIRMATION</p>
          <h2 style={{ fontSize: '24px', marginBottom: '16px', fontWeight: '500', letterSpacing: '-.035em' }}>Ready to mark this goal as complete?</h2>
          
          <div className="confirm-summary-simple" style={{ display: 'block', width: '100%', boxSizing: 'border-box', background: '#171916', border: '1px solid #32352f', padding: '20px 24px', borderRadius: '6px', marginBottom: '24px', textAlign: 'center', wordBreak: 'break-word', maxHeight: '320px', overflowY: 'auto' }}>
            <span style={{ display: 'block', color: '#8e9189', fontFamily: '"DM Mono", monospace', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: '6px' }}>Goal</span>
            <strong style={{ display: 'block', color: '#eef0e9', fontSize: '20px', fontWeight: '500', letterSpacing: '-.025em', marginBottom: '20px', lineHeight: '1.4' }}>{flow.goal.title}</strong>
            <span style={{ display: 'block', color: '#8e9189', fontFamily: '"DM Mono", monospace', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: '6px' }}>Reflection</span>
            <p style={{ margin: 0, color: '#c9f36a', fontSize: '24px', fontFamily: '"Instrument Serif", serif', fontStyle: 'italic', lineHeight: '1.35', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>“{flow.note}”</p>
          </div>
          
          <div className="modal-actions center-actions">
            <button type="button" className="modal-btn modal-btn-secondary" onClick={onCancel}>Cancel</button>
            <button type="button" className="modal-btn modal-btn-secondary" onClick={() => setFlow(curr => curr ? { ...curr, step: 'note' } : null)}>Back</button>
            <button type="submit" className="modal-btn modal-btn-primary">Complete & Share it</button>
          </div>
        </form>
      </div>
    )
  }

  return null
}

export default CompletionFlowModal
