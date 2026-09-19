import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

/**
 * HeaderInfoTooltip - Cloud-style speech bubble for section titles
 * Renders an inline (i) info button that toggles a floating cloud message.
 * Rendered through a React Portal directly into document.body to ensure it
 * floats completely free of any container boundaries, overflow, or scrollbars.
 */
export function HeaderInfoTooltip({ description }) {
  const [isOpen, setIsOpen] = useState(false)
  const [bubbleStyle, setBubbleStyle] = useState({})
  const [arrowLeft, setArrowLeft] = useState('20px')
  const containerRef = useRef(null)
  const bubbleRef = useRef(null)

  const updatePosition = () => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 400
    // Keep at least 14px safe margin from viewport edges
    const maxAllowedWidth = Math.min(380, screenWidth - 28)
    
    // Horizontal alignment: Center over button, clamp within safe viewport boundaries
    const btnCenter = rect.left + rect.width / 2
    let left = btnCenter - maxAllowedWidth / 2
    if (left + maxAllowedWidth > screenWidth - 14) {
      left = screenWidth - 14 - maxAllowedWidth
    }
    if (left < 14) {
      left = 14
    }

    // Button center relative to bubble for arrow placement
    const arrowX = Math.max(16, Math.min(maxAllowedWidth - 24, btnCenter - left - 6))

    // Vertical positioning: attach below button
    const top = rect.bottom + 10

    setBubbleStyle({
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      width: `${maxAllowedWidth}px`,
      maxWidth: `calc(100vw - 28px)`,
      zIndex: 99999
    })
    setArrowLeft(`${arrowX}px`)
  }

  useEffect(() => {
    if (!isOpen) return

    updatePosition()

    const handlePointerDown = (e) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target) &&
        (!bubbleRef.current || !bubbleRef.current.contains(e.target))
      ) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }

    const handleResizeOrScroll = () => {
      updatePosition()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleResizeOrScroll)
    window.addEventListener('scroll', handleResizeOrScroll, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleResizeOrScroll)
      window.removeEventListener('scroll', handleResizeOrScroll, true)
    }
  }, [isOpen])

  return (
    <span className="cloud-info-container" ref={containerRef}>
      <button
        type="button"
        className={`cloud-info-btn ${isOpen ? 'is-active' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen((prev) => !prev)
        }}
        aria-label="Show description"
        aria-expanded={isOpen}
        title="More information"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ display: 'block', pointerEvents: 'none' }}
        >
          <line x1="12" y1="17" x2="12" y2="11" />
          <line x1="12" y1="7" x2="12.01" y2="7" />
        </svg>
      </button>

      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={bubbleRef}
          className="cloud-bubble"
          role="dialog"
          aria-modal="false"
          style={{
            ...bubbleStyle,
            '--bubble-arrow-left': arrowLeft
          }}
        >
          <div className="cloud-bubble-content">
            {description}
          </div>
        </div>,
        document.body
      )}
    </span>
  )
}

export default HeaderInfoTooltip
