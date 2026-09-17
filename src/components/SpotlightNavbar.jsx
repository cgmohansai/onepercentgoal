import React, { useRef, useState, useEffect } from 'react'
import { animate } from 'framer-motion'
import { House, Target, Repeat, Clock, User } from '@phosphor-icons/react'
import GlassDock from './GlassDock'

export function SpotlightNavbar({
  items = [
    { label: "Overview", href: "#overview" },
    { label: "Goals", href: "#goals" },
    { label: "Rote", href: "#rote" },
    { label: "Timeline", href: "#timeline" },
    { label: "Profile", href: "#profile" }
  ],
  className = "",
  onItemClick,
  active,
  setActive,
  keyboardHidden
}) {
  const navRef = useRef(null)
  const [hoverX, setHoverX] = useState(null)

  const normalizedItems = items.map(item =>
    typeof item === 'string' ? { label: item, href: `#${item.toLowerCase()}` } : item
  )

  const activeIndex = normalizedItems.findIndex(it => it.label === active) >= 0
    ? normalizedItems.findIndex(it => it.label === active)
    : 0

  // Refs for the "light" positions so we can animate them imperatively with framer-motion
  const spotlightX = useRef(0)
  const ambienceX = useRef(0)

  // Dynamically measure exact 20px gap below the bottom of the onepercentgoal island
  useEffect(() => {
    const updateDynamicGap = () => {
      if (!navRef.current) return
      const rect = navRef.current.getBoundingClientRect()
      const gap20Px = rect.bottom > 0 ? rect.bottom + 10 : 88
      document.documentElement.style.setProperty('--dynamic-island-20px-gap', `${gap20Px}px`)
    }

    updateDynamicGap()
    const timer = setTimeout(updateDynamicGap, 100)
    window.addEventListener('resize', updateDynamicGap)
    window.addEventListener('orientationchange', updateDynamicGap)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', updateDynamicGap)
      window.removeEventListener('orientationchange', updateDynamicGap)
    }
  }, [])

  useEffect(() => {
    if (!navRef.current) return
    const nav = navRef.current

    const handleMouseMove = (e) => {
      const rect = nav.getBoundingClientRect()
      const x = e.clientX - rect.left
      setHoverX(x)
      spotlightX.current = x
      nav.style.setProperty("--spotlight-x", `${x}px`)
    }

    const handleMouseLeave = () => {
      setHoverX(null)
      const activeItem = nav.querySelector(`[data-index="${activeIndex}"]`)
      if (activeItem) {
        const navRect = nav.getBoundingClientRect()
        const itemRect = activeItem.getBoundingClientRect()
        const targetX = itemRect.left - navRect.left + itemRect.width / 2

        animate(spotlightX.current, targetX, {
          type: "spring",
          stiffness: 200,
          damping: 20,
          onUpdate: (v) => {
            spotlightX.current = v
            nav.style.setProperty("--spotlight-x", `${v}px`)
          }
        })
      }
    }

    nav.addEventListener("mousemove", handleMouseMove)
    nav.addEventListener("mouseleave", handleMouseLeave)

    return () => {
      nav.removeEventListener("mousemove", handleMouseMove)
      nav.removeEventListener("mouseleave", handleMouseLeave)
    }
  }, [activeIndex])

  // Handle the "Ambience" (Active Item) Movement
  useEffect(() => {
    if (!navRef.current) return
    const nav = navRef.current
    const activeItem = nav.querySelector(`[data-index="${activeIndex}"]`)

    if (activeItem) {
      const navRect = nav.getBoundingClientRect()
      const itemRect = activeItem.getBoundingClientRect()
      const targetX = itemRect.left - navRect.left + itemRect.width / 2

      animate(ambienceX.current, targetX, {
        type: "spring",
        stiffness: 200,
        damping: 20,
        onUpdate: (v) => {
          ambienceX.current = v
          nav.style.setProperty("--ambience-x", `${v}px`)
        },
      })
    }
  }, [activeIndex])

  if (normalizedItems.length <= 1) {
    return (
      <div className={`spotlight-nav-wrapper ${className}`} style={{ justifyContent: 'center' }}>
        <nav ref={navRef} className="spotlight-nav" style={{ padding: '0 20px', justifyContent: 'center' }}>
          <div className="spotlight-brand-inside" style={{ padding: '0 4px', cursor: 'default' }}>
            <img src="/favicon.ico" alt="Logo" style={{ width: 'clamp(14px, 3.8vw, 20px)', height: 'clamp(14px, 3.8vw, 20px)', objectFit: 'contain' }} />
            <span>onepercentgoal</span>
          </div>
        </nav>
      </div>
    )
  }

  return (
    <div className={`spotlight-nav-wrapper ${className}`}>
      <nav ref={navRef} className="spotlight-nav">
        {/* Brand Logo inside single unified pill */}
        <button
          className="spotlight-brand-inside"
          onClick={() => {
            if (setActive) setActive('Overview')
            window.scrollTo({ top: 0, behavior: 'instant' })
          }}
          aria-label="OnePercentGoal home"
        >
          <img src="/favicon.ico" alt="Logo" style={{ width: 'clamp(14px, 3.8vw, 20px)', height: 'clamp(14px, 3.8vw, 20px)', objectFit: 'contain' }} />
          <span>onepercentgoal</span>
        </button>

        {/* Desktop Nav Items */}
        <ul className="spotlight-nav-ul desktop-nav-only">
          {normalizedItems.map((item, idx) => {
            const label = item.label
            const isActive = activeIndex === idx
            const weight = isActive ? 'fill' : 'bold'

            const renderNavIcon = (lbl) => {
              if (lbl === 'Overview') return <House size={16} weight={weight} />
              if (lbl === 'Goals') return <Target size={16} weight={weight} />
              if (lbl === 'Rote') return <Repeat size={16} weight={weight} />
              if (lbl === 'Timeline') return <Clock size={16} weight={weight} />
              if (lbl === 'Profile') return <User size={16} weight={weight} />
              return null
            }

            return (
              <li key={idx} className="spotlight-nav-li">
                <a
                  href={item.href}
                  data-index={idx}
                  onClick={(e) => {
                    e.preventDefault()
                    if (item.onClick) {
                      item.onClick()
                      return
                    }
                    if (setActive) setActive(item.label)
                    onItemClick?.(item, idx)
                    window.scrollTo({ top: 0, behavior: 'instant' })
                  }}
                  className={`spotlight-nav-link ${isActive ? 'active' : ''}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  {renderNavIcon(label)}
                  <span>{label}</span>
                </a>
              </li>
            )
          })}
        </ul>

        {/* 1. Moving Spotlight Layer (Desktop Only) */}
        <div
          className="spotlight-glow-layer desktop-nav-only"
          style={{
            opacity: hoverX !== null ? 1 : 0,
            background: `radial-gradient(120px circle at var(--spotlight-x, 50%) 100%, var(--spotlight-color, rgba(201, 243, 106, 0.22)) 0%, transparent 60%)`
          }}
        />

        {/* 2. Active State Ambience Line (Desktop Only) */}
        <div
          className="spotlight-ambience-layer desktop-nav-only"
          style={{
            background: `radial-gradient(40px circle at var(--ambience-x, 50%) 100%, var(--ambience-color, rgba(201, 243, 106, 1)) 0%, transparent 80%)`
          }}
        />
      </nav>

      {/* Mobile Glass Dock (Pinned to bottom of phone screen) */}
      <GlassDock items={normalizedItems.map(it => it.label)} active={active} setActive={setActive} keyboardHidden={keyboardHidden} />
    </div>
  )
}

export default SpotlightNavbar
