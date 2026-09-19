import React, { useRef, useEffect } from 'react'
import { cn } from '../utils/cn'

export function KineticTextLoader({ 
  className = "", 
  text: _propText = "Loading", 
  showBrand = true, 
  ...props 
}) {
  const text = "Loading"
  const letters = text.split("")
  const lRef = useRef(null)
  const iRef = useRef(null)
  const dotRef = useRef(null)

  useEffect(() => {
    let rafId = null
    const alignDot = () => {
      rafId = null
      const lEl = lRef.current
      const iEl = iRef.current
      const dotEl = dotRef.current
      if (!lEl || !iEl || !dotEl) return
      const wrap = dotEl.parentElement
      if (!wrap) return
      let scale = 1
      try {
        const m = new DOMMatrix(getComputedStyle(wrap).transform)
        if (m && m.a) scale = m.a
      } catch (e) {
        scale = 1
      }
      const wrapRect = wrap.getBoundingClientRect()
      const lsOf = el => parseFloat(getComputedStyle(el).letterSpacing) || 0
      const rectOf = el => {
        const rect = el.getBoundingClientRect()
        return {
          left: (rect.left - wrapRect.left) / scale,
          width: rect.width / scale - lsOf(el)
        }
      }
      const dotW = dotEl.offsetWidth
      const lRect = rectOf(lEl)
      const iRect = rectOf(iEl)
      const lSpot = lRect.left + 0.14 * lRect.width
      const iCenter = iRect.left + iRect.width / 2
      const half = (iCenter - lSpot) / 2
      dotEl.style.setProperty('--ktl-i-shift', `${half}px`)
      dotEl.style.setProperty('--ktl-l-shift', `${half - 2}px`)
      dotEl.style.left = `${Math.round(iCenter - half - dotW / 2)}px`
    }
    const schedule = () => {
      if (!rafId) rafId = requestAnimationFrame(alignDot)
    }
    schedule()
    const ro = new ResizeObserver(schedule)
    if (lRef.current) ro.observe(lRef.current)
    if (iRef.current) ro.observe(iRef.current)
    window.addEventListener('resize', schedule)
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule)
    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      ro.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [text])

  return (
    <div 
      className={cn("ktl-wrapper-box", className)} 
      {...props}
    >
      <div className="ktl-inner-box">
        {/* The moving dot */}
        <div ref={dotRef} className="ktl-moving-dot-exact" />
        
        <p className="ktl-text-exact" aria-label={text}>
          {letters.map((char, index) => {
            if (index === 0 && char.toUpperCase() === 'L') {
              return (
                <span key={index} ref={lRef} className="ktl-char-l-animated">
                  {char}
                </span>
              )
            }
            
            if (index === 4 && char.toLowerCase() === 'i') {
              return (
                <span key={index} ref={iRef} className="ktl-char-i-animated">
                  {char === 'i' ? 'ı' : char}
                </span>
              )
            }

            return (
              <span key={index} className="ktl-char-base">
                {char}
              </span>
            )
          })}
        </p>
      </div>

      {showBrand && (
        <div className="ktl-brand-badge">
          <img
            src="/icons/icon-192.png"
            alt="OnePercentGoal"
            className="ktl-brand-icon"
            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/icon.png'; }}
          />
          <span className="ktl-brand-text">ONEPERCENTGOAL</span>
        </div>
      )}
    </div>
  )
}

export default KineticTextLoader
