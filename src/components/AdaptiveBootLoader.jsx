import React, { useState, useEffect } from 'react'
import KineticTextLoader from './KineticTextLoader'
import { Ripple } from './Ripple'
import { isNativeApp } from '../reminders'

export function isMobileDevice() {
  if (typeof window === 'undefined') return false
  if (isNativeApp()) return true
  if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) return true
  if (window.innerWidth <= 768) return true
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) return true
  return false
}

export function MobileRippleLoader({ showBrand = true }) {
  return (
    <div className="boot-content" role="status" aria-label="Loading">
      <Ripple
        size={54}
        showDot={false}
        style={{ color: '#c9f36a' }}
        className="boot-ripple"
      />
      {showBrand && (
        <div className="boot-brand">
          <img
            src="/favicon.ico"
            alt="OnePercentGoal"
            className="boot-logo"
          />
          <span className="boot-name">OnePercentGoal</span>
        </div>
      )}
    </div>
  )
}

export function AdaptiveLoader({ text = "Loading", showBrand = true, fullscreen = true }) {
  const [mobile, setMobile] = useState(() => isMobileDevice())

  useEffect(() => {
    const handleResize = () => setMobile(isMobileDevice())
    window.addEventListener('resize', handleResize)
    window.addEventListener('orientationchange', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleResize)
    }
  }, [])

  const content = mobile ? (
    <MobileRippleLoader showBrand={showBrand} />
  ) : (
    <KineticTextLoader text={text} showBrand={showBrand} />
  )

  if (fullscreen) {
    return (
      <div className="ktl-fullscreen-overlay">
        {content}
      </div>
    )
  }

  return content
}

export default AdaptiveLoader
