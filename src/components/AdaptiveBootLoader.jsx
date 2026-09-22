import React, { useState, useEffect } from 'react'
import KineticTextLoader from './KineticTextLoader'
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
      <svg viewBox="0 0 44 44" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg" className="boot-ripple">
        <title>Loading...</title>
        <g fill="none" fillRule="evenodd" strokeWidth="2">
          <circle cx="22" cy="22" r="1">
            <animate attributeName="r" begin="0s" calcMode="spline" dur="1.8s" keySplines="0.165, 0.84, 0.44, 1" keyTimes="0; 1" repeatCount="indefinite" values="1; 20" />
            <animate attributeName="stroke-opacity" begin="0s" calcMode="spline" dur="1.8s" keySplines="0.3, 0.61, 0.355, 1" keyTimes="0; 1" repeatCount="indefinite" values="1; 0" />
          </circle>
        </g>
      </svg>
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
