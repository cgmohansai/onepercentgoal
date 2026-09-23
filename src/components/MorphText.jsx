import React, { useState, useEffect } from 'react'

// ============================================================================
// MorphText - Smooth text morphing switcher with global background progression
// ============================================================================
const words = Array.from({ length: 100 }, (_, i) => `${i + 1}%`)

let globalMorphIndex = 0
const morphListeners = new Set()
let globalIntervalId = null
let currentIntervalMs = 5000

function ensureGlobalMorphTimer(interval = 5000) {
  if (typeof window === 'undefined') return
  if (globalIntervalId && currentIntervalMs !== interval) {
    clearInterval(globalIntervalId)
    globalIntervalId = null
  }
  currentIntervalMs = interval
  if (!globalIntervalId) {
    globalIntervalId = setInterval(() => {
      if (globalMorphIndex < words.length - 1) {
        globalMorphIndex += 1
        morphListeners.forEach((fn) => fn(globalMorphIndex))
      }
    }, interval)
  }
}

// Start timer immediately with 5000ms (5 seconds) cadence
ensureGlobalMorphTimer(5000)

export function resetMorphIndex() {
  globalMorphIndex = 0
  if (globalIntervalId) {
    clearInterval(globalIntervalId)
    globalIntervalId = null
  }
  ensureGlobalMorphTimer(currentIntervalMs)
  morphListeners.forEach((fn) => fn(0))
}

// Pause the morphing percentage/timer (e.g. while the auth loading overlay
// is up) and resume it afterwards — timers start only when the dashboard is visible.
export function pauseMorphTimer() {
  if (globalIntervalId) {
    clearInterval(globalIntervalId)
    globalIntervalId = null
  }
}

export function resumeMorphTimer() {
  ensureGlobalMorphTimer(currentIntervalMs)
}

export const MorphText = React.memo(function MorphText({
  interval = 5000,
  fontSize = "1em",
  fontFamily = "'Instrument Serif', serif",
  className,
  resetOnMount = false,
}) {
  useEffect(() => {
    if (resetOnMount) {
      resetMorphIndex()
    }
  }, [resetOnMount])

  const [currentIndex, setCurrentIndex] = useState(globalMorphIndex)
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth <= 768 || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 768px)')
    const handleMedia = () => setIsMobile(mq.matches || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent))
    if (mq.addEventListener) {
      mq.addEventListener('change', handleMedia)
    }
    return () => {
      if (mq.removeEventListener) {
        mq.removeEventListener('change', handleMedia)
      }
    }
  }, [])

  useEffect(() => {
    ensureGlobalMorphTimer(interval)
    // Sync with global index on mount (keeps progress even when switching tabs)
    setCurrentIndex(globalMorphIndex)
    const listener = (idx) => setCurrentIndex(idx)
    morphListeners.add(listener)
    return () => {
      morphListeners.delete(listener)
    }
  }, [interval])

  const filterId = "morph-threshold-filter"
  const currentWord = words[currentIndex]

  // Dynamic responsive width in em so it scales in lockstep with font-size on both phone and desktop
  // Maintains equal, constant spacing on left and right without jarring shifts
  const charCount = currentWord.length
  const currentWidthEm = charCount === 2 ? 1.05 : charCount === 3 ? 1.38 : 1.76

  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        verticalAlign: 'middle',
        position: 'relative',
        margin: '0',
        padding: '0'
      }}
    >
      <svg
        aria-hidden="true"
        focusable="false"
        style={{ position: "absolute", width: 0, height: 0, pointerEvents: "none" }}
      >
        <defs>
          <filter id={filterId}>
            <feColorMatrix
              in="SourceGraphic"
              type="matrix"
              values={isMobile
                ? "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 16 -3"
                : "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -6"}
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>

      <div
        style={{
          fontSize,
          fontWeight: 700,
          fontStyle: 'italic',
          color: '#c9f36a',
          textShadow: '0 0 15px rgba(201, 243, 106, 0.45)',
          filter: `url(#${filterId})`,
          fontFamily,
          userSelect: 'none',
          pointerEvents: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0',
          padding: '0'
        }}
      >
        <div
          className="morph-word-rotator"
          style={{
            height: "1.2em",
            width: `${currentWidthEm}em`,
            transition: isMobile
              ? 'width 1.7s cubic-bezier(0.35, 0, 0.25, 1)'
              : 'width 1.6s cubic-bezier(0.25, 1, 0.5, 1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'visible',
            margin: '0',
            padding: '0'
          }}
        >
          {words.map((word, i) => {
            const isActive = i === currentIndex
            const isPrev = i === (currentIndex - 1 + words.length) % words.length

            // Desktop mode restores the normal animation as before
            let opacity = 0
            let scale = isMobile ? 0.95 : 0.8
            let blur = isMobile ? '8px' : '20px'
            let transitionStr = isMobile
              ? 'opacity 1.7s cubic-bezier(0.35, 0, 0.25, 1), filter 1.7s cubic-bezier(0.35, 0, 0.25, 1), transform 1.7s cubic-bezier(0.35, 0, 0.25, 1)'
              : 'opacity 1.4s ease-in-out, filter 1.6s ease-in-out, transform 1.6s ease-in-out'

            if (isActive) {
              opacity = 1
              scale = 1
              blur = '0px'
              transitionStr = isMobile
                ? 'opacity 1.7s cubic-bezier(0.35, 0, 0.25, 1), filter 1.7s cubic-bezier(0.35, 0, 0.25, 1), transform 1.7s cubic-bezier(0.35, 0, 0.25, 1)'
                : 'opacity 1.4s cubic-bezier(0.16, 1, 0.3, 1), filter 1.6s cubic-bezier(0.25, 1, 0.5, 1), transform 1.6s cubic-bezier(0.25, 1, 0.5, 1)'
            } else if (isPrev) {
              opacity = 0
              scale = isMobile ? 1.04 : 1.2
              blur = isMobile ? '8px' : '20px'
              transitionStr = isMobile
                ? 'opacity 1.7s cubic-bezier(0.35, 0, 0.25, 1), filter 1.7s cubic-bezier(0.35, 0, 0.25, 1), transform 1.7s cubic-bezier(0.35, 0, 0.25, 1)'
                : 'opacity 1.4s cubic-bezier(0.7, 0, 0.84, 0), filter 1.6s cubic-bezier(0.25, 1, 0.5, 1), transform 1.6s cubic-bezier(0.25, 1, 0.5, 1)'
            } else {
              // Non-active items stay hidden without consuming animation performance
              transitionStr = 'none'
            }

            return (
              <span
                key={`${word}-${i}`}
                style={{
                  position: 'absolute',
                  top: "50%",
                  left: "50%",
                  transform: `translate(-50%, -50%) scale(${scale})`,
                  opacity,
                  filter: `blur(${blur})`,
                  whiteSpace: "nowrap",
                  transition: transitionStr,
                  margin: '0',
                  padding: '0'
                }}
              >
                {word}
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
})

export default MorphText
