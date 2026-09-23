import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { House, Target, Repeat, Clock, User, NotePencil } from '@phosphor-icons/react'
import { cn } from '../utils/cn'

export function GlassDock({ items, active, setActive, keyboardHidden }) {
  const [mounted, setMounted] = useState(false)
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return (
      window.innerWidth <= 768 ||
      Boolean(window.Capacitor?.isNativePlatform?.())
    )
  })

  useEffect(() => {
    setMounted(true)
    const handleResize = () => {
      setIsMobile(
        window.innerWidth <= 768 ||
        Boolean(window.Capacitor?.isNativePlatform?.())
      )
    }
    window.addEventListener('resize', handleResize)
    window.addEventListener('orientationchange', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleResize)
    }
  }, [])

  // Never render dock on desktop mode — strictly mobile view only
  if (!mounted || !isMobile) return null
  if (!items || items.length <= 1) return null

  const getIcon = (label, isActive) => {
    const weight = isActive ? 'fill' : 'regular'
    switch (label) {
      case 'Overview':
        return <House size={22} weight={weight} />
      case 'Goals':
        return <Target size={22} weight={isActive ? 'bold' : 'regular'} />
      case 'Rote':
        return <Repeat size={22} weight={weight} />
      case 'Notes':
        return <NotePencil size={22} weight={weight} />
      case 'Timeline':
        return <Clock size={22} weight={weight} />
      case 'Profile':
        return <User size={22} weight={weight} />
      default:
        return <House size={22} weight={weight} />
    }
  }

  return createPortal(
    <div className={`glass-dock-mobile-wrapper${keyboardHidden ? ' dock-hidden' : ''}`}>
      <div className="glass-dock">
        {items.map((item) => {
          const label = typeof item === 'string' ? item : item.label
          const isActive = active === label

          return (
            <button
              key={label}
              type="button"
              className={cn('glass-dock-item', isActive && 'active')}
              onClick={() => {
                if (setActive) setActive(label)
                window.scrollTo({ top: 0, behavior: 'instant' })
              }}
              title={label}
              aria-label={label}
            >
              {getIcon(label, isActive)}
            </button>
          )
        })}
      </div>
    </div>,
    document.body
  )
}

export default GlassDock
