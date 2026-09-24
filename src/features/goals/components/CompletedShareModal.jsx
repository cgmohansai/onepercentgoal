import React, { useState } from 'react'
import { useEscapeKey } from '../../../hooks/useEscapeKey'
import { isNativeApp } from '../../../reminders'
import { downloadImage, sanitizeFilename } from '../goalUtils'
import { Share } from '@capacitor/share'
import { Filesystem, Directory } from '@capacitor/filesystem'

function dataUrlToBase64(dataUrl) {
  const comma = dataUrl.indexOf(',')
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
}

export function CompletedShareModal({ completedShare, onClose, onShowToast }) {
  useEscapeKey(onClose, !completedShare)
  const [sharing, setSharing] = useState(false)
  if (!completedShare) return null

  const filename = `onepercentgoal-${sanitizeFilename(completedShare.goal.title)}.png`

  const shareNativeImage = async () => {
    if (!completedShare.image || sharing) return
    setSharing(true)
    try {
      // Gallery save already happens automatically; write a shareable copy to
      // cache and open the OS share sheet (any social app) with the image.
      const saved = await Filesystem.writeFile({
        path: `share/${filename}`,
        data: dataUrlToBase64(completedShare.image),
        directory: Directory.Cache,
        recursive: true,
      })
      await Share.share({
        title: 'Goal Completed!',
        text: `${completedShare.goal.title} — ${completedShare.note}`,
        files: [saved.uri],
        dialogTitle: 'Share your win',
      })
    } catch (err) {
      const msg = String(err?.message || '')
      // Dismissing the sheet is not an error.
      if (!/cancel|dismiss/i.test(msg) && onShowToast) {
        onShowToast('Could not open share sheet')
      }
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="completion-modal confirm-modal" onClick={event => event.stopPropagation()}>
        <p className="eyebrow eyebrow-sm congrats-eyebrow" style={{ color: '#c9f36a' }}>CONGRATS</p>
        <h2 className="congrats-hero">Goal Completed!</h2>

        <div className="confirm-summary-simple" style={{ display: 'block', width: '100%', boxSizing: 'border-box', background: '#171916', border: '1px solid #32352f', padding: '20px 24px', borderRadius: '6px', marginBottom: '24px', textAlign: 'center', wordBreak: 'break-word', maxHeight: '320px', overflowY: 'auto' }}>
          <span style={{ display: 'block', color: '#8e9189', fontFamily: '"DM Mono", monospace', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: '6px' }}>Completed</span>
          <strong style={{ display: 'block', color: '#eef0e9', fontSize: '20px', fontWeight: '500', letterSpacing: '-.025em', marginBottom: '20px', lineHeight: '1.4' }}>{completedShare.goal.title}</strong>
          <span style={{ display: 'block', color: '#8e9189', fontFamily: '"DM Mono", monospace', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: '6px' }}>Reflection</span>
          <p style={{ margin: 0, color: '#c9f36a', fontSize: '24px', fontFamily: '"Instrument Serif", serif', fontStyle: 'italic', lineHeight: '1.35', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>“{completedShare.note}”</p>
        </div>

        <p style={{ color: '#a5a79e', fontSize: '14px', lineHeight: 1.5, margin: '0 0 24px', textAlign: 'center' }}>Your progress is saved. Share this win as an image.</p>

        <div className="modal-actions center-actions">
          <button type="button" className="modal-btn modal-btn-secondary" onClick={onClose}>Done</button>
          <button
            type="button"
            className="modal-btn modal-btn-primary"
            disabled={!completedShare.image || sharing}
            onClick={() => {
              if (!completedShare.image || sharing) return
              if (isNativeApp()) {
                shareNativeImage()
              } else {
                downloadImage(completedShare.image, filename)
              }
            }}
          >
            {!completedShare.image ? 'Preparing…' : sharing ? 'Sharing…' : 'Share it'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default CompletedShareModal
