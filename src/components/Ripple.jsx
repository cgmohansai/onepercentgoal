import React from 'react'
import { cn } from '../utils/cn'

/**
 * Universal Ripple loader — single source of truth for ALL loading +
 * syncing UI on website + Android native app.
 *
 * Two SMIL waves radiate from the exact center (22,22) of a 44x44 viewBox,
 * and the minimal solid dot is an SVG circle at that SAME coordinate, with
 * its radius derived from `dotSize`/`size` so it always renders at exactly
 * `dotSize` px. Dot and wave origin are therefore the identical point by
 * construction — no CSS positioning that can drift.
 *
 * Idle state (e.g. synced badge) renders the same component with
 * `showWaves={false}` so the dot never jumps between states.
 */
function Ripple({
  className,
  style,
  size = 18,
  dotSize = 5,
  dotStyle,
  showDot = true,
  showWaves = true,
  ...svgRest
}) {
  const px = typeof size === 'number' ? size : parseFloat(size) || 18
  const dotPx = typeof dotSize === 'number' ? dotSize : parseFloat(dotSize) || 5
  // viewBox is 44 units wide and renders at `px` screen px:
  // r (viewBox units) = (dotPx / 2) / (px / 44)
  const dotR = (dotPx * 44) / (2 * px)

  return (
    <span
      className={cn('opg-ripple', className)}
      style={{
        position: 'relative',
        display: 'inline-grid',
        placeItems: 'center',
        width: `${px}px`,
        height: `${px}px`,
        color: '#c8f26a',
        flexShrink: 0,
        ...style,
      }}
    >
      <svg
        viewBox="0 0 44 44"
        fill="none"
        stroke="currentColor"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        {...svgRest}
        style={{
          width: '100%',
          height: '100%',
          overflow: 'visible',
          display: 'block',
          ...(svgRest.style || {}),
        }}
      >
        <title>Loading...</title>
        {showWaves && (
          <g fill="none" fillRule="evenodd" strokeWidth="2">
            <circle cx="22" cy="22" r="1">
              <animate
                attributeName="r"
                begin="0s"
                calcMode="spline"
                dur="1.8s"
                keySplines="0.165, 0.84, 0.44, 1"
                keyTimes="0; 1"
                repeatCount="indefinite"
                values="1; 20"
              />
              <animate
                attributeName="stroke-opacity"
                begin="0s"
                calcMode="spline"
                dur="1.8s"
                keySplines="0.3, 0.61, 0.355, 1"
                keyTimes="0; 1"
                repeatCount="indefinite"
                values="1; 0"
              />
            </circle>
            <circle cx="22" cy="22" r="1">
              <animate
                attributeName="r"
                begin="-0.9s"
                calcMode="spline"
                dur="1.8s"
                keySplines="0.165, 0.84, 0.44, 1"
                keyTimes="0; 1"
                repeatCount="indefinite"
                values="1; 20"
              />
              <animate
                attributeName="stroke-opacity"
                begin="-0.9s"
                calcMode="spline"
                dur="1.8s"
                keySplines="0.3, 0.61, 0.355, 1"
                keyTimes="0; 1"
                repeatCount="indefinite"
                values="1; 0"
              />
            </circle>
          </g>
        )}
        {showDot && (
          <circle cx="22" cy="22" r={dotR} fill="currentColor" stroke="none" style={dotStyle} />
        )}
      </svg>
    </span>
  )
}

export { Ripple }
export default Ripple
