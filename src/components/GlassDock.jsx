import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { House, Target, Repeat, Clock, User } from '@phosphor-icons/react'
import { cn } from '../utils/cn'

export function GlassDock({ items, active, setActive, keyboardHidden }) {
  if (!items || items.length <= 1) return null

  const getIcon = (label, isActive) => {
    const weight = isActive ? 'fill' : 'regular'
    switch (label) {
      case 'Overview':
        return <House size={22} weight={weight} />
      case 'Goals':
        return <Target size={22} weight={weight} />
      case 'Rote':
        return <Repeat size={22} weight={weight} />
      case 'Timeline':
        return <Clock size={22} weight={weight} />
      case 'Profile':
        return <User size={22} weight={weight} />
      default:
        return <House size={22} weight={weight} />
    }
  }

  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

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
