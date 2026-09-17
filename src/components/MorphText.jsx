import React, { useState, useEffect, useRef } from 'react'

// ============================================================================
// MorphText - Smooth text morphing switcher with dynamic width transition
// ============================================================================
export const MorphText = React.memo(function MorphText({
  interval = 2500,
  fontSize = "1em",
  fontFamily = "'Instrument Serif', serif",
  className,
}) {
  const words = React.useMemo(() => Array.from({ length: 100 }, (_, i) => `${i + 1}%`), [])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [widths, setWidths] = useState({})
  const [measured, setMeasured] = useState(false)
  const morphRootRef = useRef(null)
  
  // Measure word widths on mount/update to prevent jumps
  useEffect(() => {
    const newWidths = {}
    const parentFontSize = morphRootRef.current?.parentElement
      ? getComputedStyle(morphRootRef.current.parentElement).fontSize
      : fontSize
    words.forEach((word) => {
      const measureEl = document.createElement('span')
      measureEl.style.fontFamily = fontFamily
      measureEl.style.fontSize = parentFontSize
      measureEl.style.fontWeight = '700'
      measureEl.style.fontStyle = 'italic'
      measureEl.style.position = 'absolute'
      measureEl.style.visibility = 'hidden'
      measureEl.style.whiteSpace = 'nowrap'
      measureEl.innerText = word
      document.body.appendChild(measureEl)
      newWidths[word] = measureEl.getBoundingClientRect().width
      document.body.removeChild(measureEl)
    })
    setWidths(newWidths)
    setMeasured(true)
  }, [words, fontSize, fontFamily])

  // Cycle index smoothly and stop at 100%
  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentIndex((prev) => {
        if (prev >= words.length - 1) {
          clearInterval(intervalId)
          return prev
        }
        return prev + 1
      })
    }, interval)
    return () => clearInterval(intervalId)
  }, [words.length, interval])
  const filterId = "morph-threshold-filter"
  const currentWord = words[currentIndex]
  const currentWidth = (widths[currentWord] || 60) + 24

  return (
    <div ref={morphRootRef} className={className} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', verticalAlign: 'middle', position: 'relative', margin: '0 0.12em', visibility: measured ? 'visible' : 'hidden' }}>
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
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 25 -9"
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
          pointerEvents: 'none'
        }}
      >
        <div
          className="morph-word-rotator"
          style={{
            height: "1.2em",
            width: `${currentWidth}px`,
            transition: 'width 1.6s cubic-bezier(0.25, 1, 0.5, 1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'visible',
            paddingRight: '0.15em'
          }}
        >
          {words.map((word, i) => {
            const isActive = i === currentIndex
            const isPrev = i === (currentIndex - 1 + words.length) % words.length
            
            let opacity = 0
            let scale = 0.8
            let blur = '20px'
            let transitionStr = 'opacity 1.4s ease-in-out, filter 1.6s ease-in-out, transform 1.6s ease-in-out'

            if (isActive) {
              opacity = 1
              scale = 1
              blur = '0px'
              transitionStr = 'opacity 1.4s cubic-bezier(0.16, 1, 0.3, 1), filter 1.6s cubic-bezier(0.25, 1, 0.5, 1), transform 1.6s cubic-bezier(0.25, 1, 0.5, 1)'
            } else if (isPrev) {
              opacity = 0
              scale = 1.2
              blur = '20px'
              transitionStr = 'opacity 1.4s cubic-bezier(0.7, 0, 0.84, 0), filter 1.6s cubic-bezier(0.25, 1, 0.5, 1), transform 1.6s cubic-bezier(0.25, 1, 0.5, 1)'
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
                  transition: transitionStr
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
