import React from 'react'
import { useEscapeKey } from '../../../hooks/useEscapeKey'
import { isNativeApp } from '../../../reminders'
import { downloadImage, sanitizeFilename } from '../goalUtils'
import { triggerSideCannons } from '../../../utils/confetti'

export function CompletedShareModal({ completedShare, onClose }) {
  useEscapeKey(onClose, !completedShare)
  if (!completedShare) return null

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="completion-modal confirm-modal" onClick={event => event.stopPropagation()}>
        <p className="eyebrow" style={{ color: '#c9f36a' }}>CONGRATS</p>
        <h2 style={{ fontSize: '24px', marginBottom: '16px', fontWeight: '500', letterSpacing: '-.035em', textAlign: 'center' }}>Goal Completed!</h2>

        <div className="confirm-summary-simple" style={{ display: 'block', width: '100%', boxSizing: 'border-box', background: '#171916', border: '1px solid #32352f', padding: '20px 24px', borderRadius: '6px', marginBottom: '24px', textAlign: 'center', wordBreak: 'break-word', maxHeight: '320px', overflowY: 'auto' }}>
          <span style={{ display: 'block', color: '#8e9189', fontFamily: '"DM Mono", monospace', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: '6px' }}>Completed</span>
          <strong style={{ display: 'block', color: '#eef0e9', fontSize: '20px', fontWeight: '500', letterSpacing: '-.025em', marginBottom: '20px', lineHeight: '1.4' }}>{completedShare.goal.title}</strong>
          <span style={{ display: 'block', color: '#8e9189', fontFamily: '"DM Mono", monospace', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: '6px' }}>Reflection</span>
          <p style={{ margin: 0, color: '#c9f36a', fontSize: '24px', fontFamily: '"Instrument Serif", serif', fontStyle: 'italic', lineHeight: '1.35', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>“{completedShare.note}”</p>
        </div>

        <p style={{ color: '#a5a79e', fontSize: '14px', lineHeight: 1.5, margin: '0 0 24px', textAlign: 'center' }}>Your progress is saved. Share this win as an image.</p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
          <button type="button" onClick={onClose} style={{ border: '0', background: 'none', color: '#8e9189', padding: '0', cursor: 'pointer', fontSize: '12px' }}>Done</button>
          <button
            type="button"
            className="add-button"
            disabled={!completedShare.image}
            onClick={() => {
              if (!completedShare.image) return
              triggerSideCannons()
              if (isNativeApp()) {
                onClose()
              } else {
                downloadImage(completedShare.image, `onepercentgoal-${sanitizeFilename(completedShare.goal.title)}.png`)
              }
            }}
          >
            {completedShare.image ? (isNativeApp() ? 'Saved to Photos' : 'Share it') : 'Preparing…'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default CompletedShareModal
