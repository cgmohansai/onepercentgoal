import React from 'react'
import './AnimatedPlusButton.css'

function AnimatedPlusButton({
  onClick,
  className,
  color = '#c9f36a',
  size = 24,
  title,
  ariaLabel
}) {
  const hexToRgba = (hex, alpha) => {
    const h = hex.replace('#', '')
    const r = parseInt(h.substring(0, 2), 16)
    const g = parseInt(h.substring(2, 4), 16)
    const b = parseInt(h.substring(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      className={`animated-plus-btn${className ? ' ' + className : ''}`}
      style={{
        width: size * 1.6,
        height: size * 1.6,
        border: `1px solid ${hexToRgba(color, 0.4)}`,
        background: hexToRgba(color, 0.15),
        boxShadow: `0 0 0 1px rgba(0, 0, 0, 0.3) inset`
      }}
    >
      <span
        style={{ fontSize: size, lineHeight: 1, fontWeight: 700, color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        +
      </span>
    </button>
  )
}

export default AnimatedPlusButton
