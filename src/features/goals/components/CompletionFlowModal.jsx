import React from 'react'
import { useEscapeKey } from '../../../hooks/useEscapeKey'

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
          <p className="eyebrow">MARK AS COMPLETED</p>
          <h2>{flow.goal.title}</h2>
          <label className="reflection-label">
            How did you complete it? <span className="req-tag">Required</span>
            <span className="desc-tag">This note will appear in the shareable image.</span>
          </label>
          <textarea
            autoFocus
            required
            value={flow.note}
            onChange={event => setFlow(curr => curr ? { ...curr, note: event.target.value } : curr)}
            placeholder="Write a reflection before finishing this goal…"
          />
          <div>
            <button type="button" onClick={onCancel}>Cancel</button>
            <button type="submit">Continue</button>
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
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
            <button type="button" onClick={onCancel} style={{ border: '0', background: 'none', color: '#8e9189', padding: '0', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
            <button type="button" onClick={() => setFlow(curr => curr ? { ...curr, step: 'note' } : null)}>Back</button>
            <button type="submit">Complete & Share it</button>
          </div>
        </form>
      </div>
    )
  }

  return null
}

export default CompletionFlowModal
