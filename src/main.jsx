import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const DAY = 24 * 60 * 60 * 1000
const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || ''
const apiUrl = path => `${API_BASE}${path}`
const apiFetch = (path, options) => fetch(apiUrl(path), options)

function getYearData(date = new Date()) {
  const year = date.getFullYear()
  const start = new Date(year, 0, 1)
  const nextYear = new Date(year + 1, 0, 1)
  const total = Math.round((nextYear - start) / DAY)
  const elapsed = date - start
  const percentage = Math.min(100, Math.max(0, (elapsed / (total * DAY)) * 100))
  const sprint = Math.min(100, Math.floor(percentage) + 1)
  const checkpointEnd = new Date(start.getTime() + Math.min(sprint, 100) * total * DAY / 100)
  return { year, total, elapsed, percentage, sprint, checkpointEnd }
}

function formatDuration(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return {
    days: Math.floor(seconds / 86400),
    hours: Math.floor((seconds % 86400) / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
    seconds: seconds % 60,
  }
}

function presentGoal(goal) {
  const percent = goal.progress_percent ?? Math.round((goal.progress / goal.target) * 100)
  return {
    ...goal,
    done: Boolean(goal.completed),
    kind: 'bar',
    value: percent,
    max: 100,
    label: `${percent}% progress`,
  }
}

function sanitizeFilename(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'goal'
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next
    } else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

async function createCompletionCard(goal, note) {
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  // Set temporary height to allow measuring text
  canvas.height = 2000
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')

  const titleFontSize = goal.title.length > 48 ? 58 : goal.title.length > 30 ? 66 : 74
  const noteFontSize = note.length > 170 ? 36 : note.length > 100 ? 40 : 44
  const titleLineHeight = Math.round(titleFontSize * 1.14)
  const noteLineHeight = Math.round(noteFontSize * 1.35)

  // Measure title wrapping
  ctx.font = `600 ${titleFontSize}px "DM Sans", sans-serif`
  const titleLines = wrapText(ctx, goal.title, 900)

  // Measure note wrapping
  ctx.font = `italic 400 ${noteFontSize}px "Instrument Serif", serif`
  const noteLines = wrapText(ctx, note, 860)

  // Dynamic layout calculations
  let y = 370
  const titleStartY = y
  y += titleLines.length * titleLineHeight
  const reflectionLabelY = y + 60
  const noteStartY = reflectionLabelY + 50
  y = noteStartY + noteLines.length * noteLineHeight
  const dateY = y + 60
  const footerDoneY = dateY + 70
  
  // Total canvas height = footer position + bottom padding (120)
  const canvasHeight = footerDoneY + 120
  canvas.height = canvasHeight

  const accent = '#c9f36a'
  const base = '#111310'
  const panel = '#1b1d1a'
  const text = '#f5f5ef'
  const muted = '#a4a89b'
  const displayDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  // Fill background
  const bg = ctx.createLinearGradient(0, 0, 1200, canvasHeight)
  bg.addColorStop(0, '#171916')
  bg.addColorStop(1, '#22251f')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Background orb decorations
  ctx.fillStyle = 'rgba(201, 243, 106, 0.06)'
  ctx.beginPath()
  ctx.arc(600, canvasHeight / 2, 400, 0, Math.PI * 2)
  ctx.fill()

  // Inner panel card (Full container)
  ctx.fillStyle = panel
  ctx.strokeStyle = 'rgba(201, 243, 106, 0.22)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(72, 72, 1056, canvasHeight - 144, 36)
  ctx.fill()
  ctx.stroke()

  // Center align text
  ctx.textAlign = 'center'

  // Header Brand
  ctx.fillStyle = accent
  ctx.font = '700 24px "DM Mono", monospace'
  ctx.fillText('ONEPERCENTGOAL', 600, 138)
  
  ctx.beginPath()
  ctx.arc(600, 216, 42, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(201, 243, 106, 0.55)'
  ctx.lineWidth = 2
  ctx.stroke()
  
  ctx.fillStyle = accent
  ctx.font = '600 24px "Instrument Serif", serif'
  ctx.fillText('1%', 600, 224)

  // GOAL label
  ctx.fillStyle = accent
  ctx.font = '700 20px "DM Mono", monospace'
  ctx.fillText('GOAL', 600, 310)

  // Goal Name (Title)
  ctx.fillStyle = '#f7f7f2'
  ctx.font = `600 ${titleFontSize}px "DM Sans", sans-serif`
  let currentTitleY = titleStartY
  for (const line of titleLines) {
    ctx.fillText(line, 600, currentTitleY)
    currentTitleY += titleLineHeight
  }

  // REFLECTION label
  ctx.fillStyle = accent
  ctx.font = '700 20px "DM Mono", monospace'
  ctx.fillText('REFLECTION', 600, reflectionLabelY)

  // Reflection Message (Note)
  ctx.fillStyle = text
  ctx.font = `italic 400 ${noteFontSize}px "Instrument Serif", serif`
  let currentNoteY = noteStartY
  for (const line of noteLines) {
    ctx.fillText(line, 600, currentNoteY)
    currentNoteY += noteLineHeight
  }

  // Date
  ctx.fillStyle = muted
  ctx.font = '500 26px "DM Sans", sans-serif'
  ctx.fillText(displayDate, 600, dateY)

  // DONE. footer
  ctx.fillStyle = accent
  ctx.font = '700 22px "DM Mono", monospace'
  ctx.fillText('DONE.', 600, footerDoneY)

  return canvas.toDataURL('image/png')
}

function downloadImage(dataUrl, filename) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
}

// ============================================================================
// WebGL LiquidMetal Shader Wrapper Component
// ============================================================================
const LiquidMetal = React.memo(function LiquidMetal({
  colorBack = "#343630",
  colorTint = "#c9f36a",
  speed = 0.4,
  repetition = 4,
  distortion = 0.15,
  scale = 1,
  className,
  style
}) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl')
    if (!gl) return

    const hexToRgb = (hex) => {
      const num = parseInt(hex.replace("#", ""), 16)
      return [
        ((num >> 16) & 255) / 255,
        ((num >> 8) & 255) / 255,
        (num & 255) / 255
      ]
    }

    const rgbBack = hexToRgb(colorBack)
    const rgbTint = hexToRgb(colorTint)

    const vsSource = `
      attribute vec2 position;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `

    const fsSource = `
      precision highp float;
      uniform vec2 u_resolution;
      uniform float u_time;
      uniform vec3 u_colorBack;
      uniform vec3 u_colorTint;
      uniform float u_speed;
      uniform float u_repetition;
      uniform float u_distortion;

      void main() {
        vec2 uv = gl_FragCoord.xy / u_resolution.xy;
        vec2 p = uv * u_repetition - u_repetition * 0.5;
        float t = u_time * u_speed;
        for(float i = 1.0; i < 5.0; i++) {
          p.x += sin(p.y + t + i * 0.8) * u_distortion;
          p.y += cos(p.x + t + i * 0.5) * u_distortion;
        }
        float light = sin(p.x + p.y) * 0.5 + 0.5;
        vec3 color = mix(u_colorBack, u_colorTint, light);
        color.r += sin(light * 5.0) * 0.08;
        color.b += cos(light * 5.0) * 0.08;
        gl_FragColor = vec4(color, 1.0);
      }
    `

    const createShader = (gl, type, source) => {
      const shader = gl.createShader(type)
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      return shader
    }

    const vs = createShader(gl, gl.VERTEX_SHADER, vsSource)
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource)

    const program = gl.createProgram()
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    gl.useProgram(program)

    const positionBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1, -1,  1,
      -1,  1,  1, -1,  1,  1
    ]), gl.STATIC_DRAW)

    const positionLoc = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(positionLoc)
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0)

    const resLoc = gl.getUniformLocation(program, 'u_resolution')
    const timeLoc = gl.getUniformLocation(program, 'u_time')
    const cbLoc = gl.getUniformLocation(program, 'u_colorBack')
    const ctLoc = gl.getUniformLocation(program, 'u_colorTint')
    const spLoc = gl.getUniformLocation(program, 'u_speed')
    const repLoc = gl.getUniformLocation(program, 'u_repetition')
    const distLoc = gl.getUniformLocation(program, 'u_distortion')

    let animationFrameId
    const startTime = performance.now()

    const resize = () => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
        gl.viewport(0, 0, width, height)
      }
    }

    const render = () => {
      resize()
      gl.uniform2f(resLoc, canvas.width, canvas.height)
      gl.uniform1f(timeLoc, (performance.now() - startTime) / 1000)
      gl.uniform3fv(cbLoc, rgbBack)
      gl.uniform3fv(ctLoc, rgbTint)
      gl.uniform1f(spLoc, speed)
      gl.uniform1f(repLoc, repetition)
      gl.uniform1f(distLoc, distortion)

      gl.drawArrays(gl.TRIANGLES, 0, 6)
      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(animationFrameId)
      gl.bindBuffer(gl.ARRAY_BUFFER, null)
      gl.deleteBuffer(positionBuffer)
      gl.deleteProgram(program)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
    }
  }, [colorBack, colorTint, speed, repetition, distortion])

  return (
    <div
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
        ...style
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block'
        }}
      />
    </div>
  )
})

// ============================================================================
// Premium button with WebGL liquid metal border effect
// ============================================================================
const LiquidMetalButton = React.forwardRef(function LiquidMetalButton({
  children,
  icon,
  borderWidth = 4,
  metalConfig,
  size = "md",
  className,
  disabled,
  style,
  ...props
}, ref) {
  const sizeStyles = {
    sm: { padding: '8px 24px 8px 8px', gap: '12px', fontSize: '13px' },
    md: { padding: '12px 32px 12px 12px', gap: '16px', fontSize: '16px' },
    lg: { padding: '16px 40px 16px 16px', gap: '24px', fontSize: '18px' },
  }

  const iconSizes = {
    sm: { width: '32px', height: '32px' },
    md: { width: '40px', height: '40px' },
    lg: { width: '48px', height: '48px' },
  }

  return (
    <button
      ref={ref}
      disabled={disabled}
      className={`liquid-metal-btn-trigger ${className || ''}`}
      style={{
        position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        border: 'none',
        background: 'transparent',
        padding: 0,
        outline: 'none',
        transition: 'transform 0.15s ease',
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
        ...style
      }}
      {...props}
    >
      <div
        style={{
          position: 'relative',
          borderRadius: '9999px',
          overflow: 'hidden',
          boxShadow: '0 20px 50px -12px rgba(0,0,0,0.4)',
          padding: borderWidth
        }}
      >
        {/* Liquid Metal Border Layer */}
        <LiquidMetal
          colorBack={metalConfig?.colorBack ?? "#343630"}
          colorTint={metalConfig?.colorTint ?? "#c9f36a"}
          speed={metalConfig?.speed ?? 0.4}
          repetition={metalConfig?.repetition ?? 4}
          distortion={metalConfig?.distortion ?? 0.15}
          scale={metalConfig?.scale ?? 1}
          style={{ borderRadius: '9999px' }}
        />

        {/* Inner Button Body */}
        <div
          className="liquid-metal-btn-body"
          style={{
            position: 'relative',
            zIndex: 10,
            borderRadius: '9999px',
            display: 'flex',
            alignItems: 'center',
            background: '#151714',
            border: '1px solid rgba(201, 243, 106, 0.1)',
            transition: 'background-color 0.2s ease, border-color 0.2s ease',
            ...sizeStyles[size]
          }}
        >
          {icon && (
            <div
              style={{
                borderRadius: '9999px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#242721',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)',
                ...iconSizes[size]
              }}
            >
              <span style={{ color: '#c9f36a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {icon}
              </span>
            </div>
          )}
          <span style={{
            fontWeight: 600,
            letterSpacing: '-0.025em',
            color: '#eef0e9'
          }}>
            {children}
          </span>
        </div>
      </div>
    </button>
  )
})

// ============================================================================
// MorphText - Smooth text morphing switcher with dynamic width transition
// ============================================================================
const MorphText = React.memo(function MorphText({
  interval = 2500,
  fontSize = "1em",
  fontFamily = "'Instrument Serif', serif",
  className,
}) {
  const words = React.useMemo(() => Array.from({ length: 100 }, (_, i) => `${i + 1}%`), [])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [widths, setWidths] = useState({})
  
  // Measure word widths on mount/update to prevent jumps
  useEffect(() => {
    const newWidths = {}
    words.forEach((word) => {
      const measureEl = document.createElement('span')
      measureEl.style.fontFamily = fontFamily
      measureEl.style.fontSize = fontSize
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
  const currentWidth = (widths[currentWord] || 60) + 32

  return (
    <div className={className} style={{ display: 'inline-block', verticalAlign: 'middle', position: 'relative' }}>
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
            overflow: 'visible'
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


function GoalRow({ goal, onProgress, onComplete, onShowDetails }) {
  const rowRef = useRef(null)
  const [draft, setDraft] = useState(goal.value)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    setDraft(goal.value)
  }, [goal.value])

  const hasChanged = draft !== goal.value

  const commitProgress = () => {
    const next = Math.max(goal.value, Math.min(100, Number(draft) || goal.value))
    if (next === 100) {
      onComplete(goal)
    } else if (next !== goal.value) {
      onProgress(goal, next)
    }
  }

  const resetDraft = () => {
    setDraft(goal.value)
  }

  const updateDraft = value => {
    setDraft(Math.max(goal.value, Math.min(100, Number(value) || goal.value)))
  }

  return (
    <div
      className={goal.done ? 'goal complete' : 'goal'}
      ref={rowRef}
      onClick={() => { if (goal.done && onShowDetails) onShowDetails(goal); }}
      style={{ cursor: goal.done ? 'pointer' : 'default' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onBlur={event => {
        if (!rowRef.current?.contains(event.relatedTarget)) {
          setHovered(false)
        }
      }}
      onFocus={() => {
        setHovered(true)
      }}
    >
      <span className="checkbox">{goal.done && '✓'}</span>
      <span className="goal-content">
        <span className="goal-topline">
          <span className="goal-copy">
            <b>{goal.title}</b>
            <small>{goal.label}</small>
          </span>
          {!goal.done && (
            <span className="goal-inline-actions">
              {hasChanged && <button className="ghost" onClick={commitProgress}>Save</button>}
              {hasChanged && <button className="ghost" onClick={resetDraft}>Cancel</button>}
              {!hasChanged && hovered && <button className="ghost" onClick={() => onComplete(goal)}>Complete</button>}
            </span>
          )}
        </span>
        <label className={goal.done ? 'mini-track static' : 'mini-track editable'}>
          <i style={{ width: `${hasChanged ? draft : goal.value}%` }} />
          {!goal.done && <input
            aria-label={`Update ${goal.title} progress`}
            type="range"
            min="0"
            max="100"
            value={draft}
            onChange={event => updateDraft(event.target.value)}
          />}
          {!goal.done && <span className="track-thumb" style={{ left: `${hasChanged ? draft : goal.value}%` }} />}
        </label>
      </span>
      <strong>{hasChanged ? draft : goal.value}%</strong>
    </div>
  )
}

function PageHeader({ label, title, action }) {
  return <header className="page-header">{label && <p className="eyebrow">{label}</p>}<div><h1>{title}</h1>{action}</div></header>
}

function AuthScreen({ mode, setMode, onSubmit, onGoogle, loading, error }) {
  const [form, setForm] = useState({ email: '', password: '', display_name: '' })
  return (
    <div className="auth-screen">
      <div className="auth-aurora-glow"></div>
      <section className="auth-card card premium-auth-card">
        <div className="auth-header-wrapper">
          <p className="eyebrow auth-eyebrow">SYSTEM GATEWAY</p>
          <h1 className="auth-title">
            <span>{mode === 'login' ? 'Sign in to' : 'Join'}</span> <em>OnePercentGoal</em>
          </h1>
          <p className="auth-copy">
            Every 1% counts. Log in to access your sprint boards, set compounding targets, and view real-time temporal momentum.
          </p>
        </div>

        <div className="auth-tabs">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')} type="button">Log In</button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')} type="button">Create Account</button>
        </div>

        <form className="auth-form" onSubmit={event => { event.preventDefault(); onSubmit(form, mode) }}>
          {mode === 'register' && (
            <label className="auth-field">
              <span>Display Name</span>
              <input 
                type="text" 
                value={form.display_name} 
                onChange={event => setForm(value => ({ ...value, display_name: event.target.value }))} 
                placeholder="How should we address you?" 
              />
            </label>
          )}
          <label className="auth-field">
            <span>Email Address</span>
            <input 
              type="email" 
              required 
              value={form.email} 
              onChange={event => setForm(value => ({ ...value, email: event.target.value }))} 
              placeholder="name@example.com"
            />
          </label>
          <label className="auth-field">
            <span>Secret Password</span>
            <input 
              type="password" 
              required 
              minLength={8} 
              value={form.password} 
              onChange={event => setForm(value => ({ ...value, password: event.target.value }))} 
              placeholder="••••••••"
            />
          </label>
          
          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? 'Decrypting credentials…' : mode === 'login' ? 'Enter Console' : 'Initialize Account'}
          </button>
        </form>

        <div className="auth-divider">
          <span>OR CONTINUE WITH</span>
        </div>

        <button className="google-button premium-google-btn" type="button" onClick={onGoogle} disabled={loading}>
          <svg style={{ width: '18px', height: '18px', marginRight: '10px', verticalAlign: 'middle' }} viewBox="0 0 24 24">
            <path fill="currentColor" d="M21.35,11.1H12v2.7h5.38c-0.24,1.28 -0.96,2.37 -2.04,3.1v2.58h3.29c1.92,-1.77 3.02,-4.38 3.02,-7.38c0,-0.6 -0.05,-1.2 -0.15,-1.8z" />
            <path fill="currentColor" d="M12,20.4c2.54,0 4.67,-0.84 6.23,-2.28l-3.29,-2.58c-0.91,0.61 -2.08,0.98 -2.94,0.98c-2.27,0 -4.2,-1.54 -4.89,-3.6H3.66v2.66c1.55,3.08 4.73,5.18 8.34,5.18z" />
            <path fill="currentColor" d="M7.11,12.92a5.92,5.92 0 0 1 0,-1.84V8.42H3.66a9.92,9.92 0 0 0 0,7.16l3.45,-2.66z" fillOpacity="0.9" />
            <path fill="currentColor" d="M12,5.28c1.38,0 2.62,0.47 3.59,1.4l2.69,-2.69C16.66,2.5 14.54,1.8 12,1.8c-3.61,0 -6.79,2.1 -8.34,5.18l3.45,2.66c0.69,-2.06 2.62,-3.6 4.89,-3.6z" />
          </svg>
          Google Authentication
        </button>

        {error && <p className="auth-error premium-auth-error">{error}</p>}
      </section>
    </div>
  )
}

function ProfileSetupModal({ user, onSubmit, loading, error }) {
  const [form, setForm] = useState({ username: user?.username || '', display_name: user?.display_name || '' })
  return <div className="modal-backdrop" role="presentation"><form className="completion-modal" onSubmit={event => { event.preventDefault(); onSubmit(form) }}><p className="eyebrow">PROFILE SETUP</p><h2>Choose a unique username</h2><p className="auth-copy">This is the public handle other people will see. You can also set the display name used inside the app.</p><label>Username<input autoFocus required minLength={3} maxLength={24} value={form.username} onChange={event => setForm(value => ({ ...value, username: event.target.value }))} /></label><label>Display name<input required maxLength={80} value={form.display_name} onChange={event => setForm(value => ({ ...value, display_name: event.target.value }))} /></label>{error && <p className="auth-error">{error}</p>}<div><button type="submit" disabled={loading}>{loading ? 'Saving…' : 'Continue'}</button></div></form></div>
}

function EditProfileModal({ isOpen, onClose, user, onSubmit, loading, error }) {
  const [form, setForm] = useState({
    username: user?.username || '',
    display_name: user?.display_name || '',
    bio: user?.bio || ''
  })

  useEffect(() => {
    if (user) {
      setForm({
        username: user.username || '',
        display_name: user.display_name || '',
        bio: user.bio || ''
      })
    }
  }, [user])

  if (!isOpen) return null

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <form 
        className="completion-modal" 
        onClick={event => event.stopPropagation()} 
        onSubmit={event => { 
          event.preventDefault()
          onSubmit(form.username, form.display_name, form.bio)
        }}
      >
        <p className="eyebrow" style={{ color: '#c9f36a' }}>EDIT PROFILE</p>
        <h2>Update your public identity</h2>
        
        <label>
          Username
          <input 
            required 
            minLength={3} 
            maxLength={24} 
            value={form.username} 
            onChange={event => setForm(value => ({ ...value, username: event.target.value }))} 
          />
        </label>
        
        <label>
          Display Name
          <input 
            required 
            maxLength={80} 
            value={form.display_name} 
            onChange={event => setForm(value => ({ ...value, display_name: event.target.value }))} 
          />
        </label>

        <label>
          Bio
          <textarea 
            maxLength={160} 
            placeholder="A brief bio about your sprint drive, goals, or lifestyle..."
            value={form.bio} 
            onChange={event => setForm(value => ({ ...value, bio: event.target.value }))} 
            style={{
              width: '100%',
              minHeight: '80px',
              background: '#141613',
              border: '1px solid #343630',
              borderRadius: '6px',
              padding: '12px',
              color: '#eef0e9',
              fontFamily: 'inherit',
              fontSize: '13px',
              resize: 'none',
              boxSizing: 'border-box',
              marginTop: '6px'
            }}
          />
        </label>

        {error && <p className="auth-error">{error}</p>}
        
        <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
          <button 
            type="button" 
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid #343630',
              color: '#8c9085',
              borderRadius: '8px',
              padding: '10px 16px',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button 
            type="submit" 
            disabled={loading}
            style={{
              background: '#c9f36a',
              border: 'none',
              color: '#121411',
              borderRadius: '8px',
              padding: '10px 20px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {loading ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}

function AddGoalModal({ isOpen, onClose, onSubmit, loading, deadline }) {
  const [title, setTitle] = useState('');

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <form 
        className="completion-modal" 
        onClick={event => event.stopPropagation()} 
        onSubmit={event => { 
          event.preventDefault(); 
          if (!title.trim()) return;
          onSubmit(title);
          setTitle('');
        }}
      >
        <p className="eyebrow" style={{ color: '#c9f36a' }}>NEW COMPREHENSIVE TARGET</p>
        <h2>What do you want to achieve in this sprint?</h2>
        
        {deadline && (
          <p className="goal-deadline" style={{ color: '#ff6b6b', fontFamily: '"DM Mono", monospace', fontSize: '11px', margin: '-12px 0 20px', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '14px', lineHeight: 1 }}>⏳</span> DEADLINE: {deadline.toUpperCase()}
          </p>
        )}
        
        <p className="auth-copy" style={{ marginBottom: '20px' }}>
          Define a clear, actionable goal. Small daily progress compounds into 1% achievements.
        </p>
        
        <label>
          Goal Title
          <input 
            autoFocus 
            required 
            maxLength={140} 
            placeholder="e.g. Code for 2 hours daily, read 20 pages" 
            value={title} 
            onChange={event => setTitle(event.target.value)} 
          />
        </label>
        
        <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
          <button 
            type="button" 
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid #343630',
              color: '#8c9085',
              borderRadius: '8px',
              padding: '10px 16px',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button 
            type="submit" 
            disabled={loading}
            style={{
              background: '#c9f36a',
              border: 'none',
              color: '#121411',
              borderRadius: '8px',
              padding: '10px 20px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {loading ? 'Saving…' : 'Add Target'}
          </button>
        </div>
      </form>
    </div>
  );
}

function SprintHistoryModal({ sprint, onClose, onShowGoalDetails }) {
  const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
  const start = new Date(sprint.sprint_start)
  const end = new Date(sprint.sprint_end)

  return <div className="modal-backdrop" role="presentation" onClick={onClose}>
    <section className="completion-modal sprint-modal" onClick={event => event.stopPropagation()} style={{ padding: '32px', maxWidth: '900px', width: '90%', boxSizing: 'border-box' }}>
      
      <div className="sprint-modal-columns" style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
        
        {/* Left Column: Summary and Stats */}
        <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <p className="eyebrow">SPRINT HISTORY</p>
          <h2 style={{ fontSize: '26px', marginBottom: '4px', fontWeight: '500', letterSpacing: '-.035em' }}>Sprint #{String(sprint.sprint_number).padStart(2, '0')}</h2>
          <p className="sprint-modal-dates" style={{ color: '#8c9085', fontFamily: '"DM Mono", monospace', fontSize: '13px', margin: '0 0 20px' }}>
            {dateFormat.format(start)} - {dateFormat.format(end)}
          </p>
          
          <div className="confirm-summary-simple" style={{ display: 'block', width: '100%', boxSizing: 'border-box', background: '#171916', border: '1px solid #32352f', padding: '20px 24px', borderRadius: '6px', textAlign: 'center' }}>
            <span style={{ display: 'block', color: '#8e9189', fontFamily: '"DM Mono", monospace', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: '4px' }}>Goals Set</span>
            <strong style={{ display: 'block', color: '#eef0e9', fontSize: '22px', fontWeight: '500', letterSpacing: '-.025em', marginBottom: '12px' }}>{sprint.goal_count}</strong>
            
            <span style={{ display: 'block', color: '#8e9189', fontFamily: '"DM Mono", monospace', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: '4px' }}>Goals Completed</span>
            <strong style={{ display: 'block', color: '#eef0e9', fontSize: '22px', fontWeight: '500', letterSpacing: '-.025em', marginBottom: '12px' }}>{sprint.completed_count}</strong>
            
            <span style={{ display: 'block', color: '#8e9189', fontFamily: '"DM Mono", monospace', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: '4px' }}>Average Progress</span>
            <strong style={{ display: 'block', color: '#c9f36a', fontSize: '32px', fontFamily: '"Instrument Serif", serif', fontStyle: 'italic', fontWeight: 'normal', marginBottom: '0' }}>{sprint.average_progress}%</strong>
          </div>
        </div>

        {/* Right Column: Goal Checklist Cards */}
        <div style={{ flex: '1.2 1 340px', display: 'flex', flexDirection: 'column' }}>
          <p className="eyebrow" style={{ marginBottom: '12px' }}>GOALS LIST DETAILS</p>
          
          <div className="sprint-history-list" style={{ maxHeight: '380px', overflowY: 'auto', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '4px' }}>
            {sprint.goals.length ? sprint.goals.map(goal => (
              <div key={goal.id} className="confirm-summary-simple" onClick={() => { if (goal.completed && onShowGoalDetails) onShowGoalDetails(goal); }} style={{ display: 'block', width: '100%', boxSizing: 'border-box', background: '#171916', border: '1px solid #32352f', padding: '16px 20px', borderRadius: '6px', textAlign: 'center', cursor: goal.completed ? 'pointer' : 'default' }}>
                <span style={{ display: 'block', color: '#8e9189', fontFamily: '"DM Mono", monospace', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: '4px' }}>Goal</span>
                <strong style={{ display: 'block', color: '#eef0e9', fontSize: '16px', fontWeight: '500', letterSpacing: '-.025em', marginBottom: '10px', lineHeight: '1.4' }}>{goal.title}</strong>
                
                <span style={{ display: 'block', color: '#8e9189', fontFamily: '"DM Mono", monospace', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: '4px' }}>Progress achieved</span>
                <strong style={{ display: 'block', color: goal.progress_percent === 100 ? '#c9f36a' : '#eef0e9', fontSize: '20px', fontFamily: '"Instrument Serif", serif', fontStyle: 'italic', fontWeight: 'normal', marginBottom: '8px' }}>{goal.progress_percent}%</strong>
                
                <span style={{ display: 'block', color: goal.completed ? '#c9f36a' : '#8e9189', fontFamily: '"DM Mono", monospace', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                  {goal.completed ? '✓ Completed in this sprint' : '• Carried to the next sprint'}
                </span>
              </div>
            )) : <p className="sprint-history-empty" style={{ textAlign: 'center', color: '#8c9085', fontStyle: 'italic', fontSize: '12px', margin: '20px 0' }}>No goals were recorded in this sprint.</p>}
          </div>
        </div>

      </div>

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px', borderTop: '1px solid #282a25', paddingTop: '16px' }}>
        <button className="add-button" type="button" onClick={onClose} style={{ minWidth: '120px', height: '36px', fontSize: '12px' }}>Close</button>
      </div>
    </section>
  </div>
}

// ============================================================================
// 10 Motivational Quotes Database
// ============================================================================
const MOTIVATIONAL_QUOTES = [
  { quote: "You do not rise to the level of your goals. You fall to the level of your systems.", author: "James Clear" },
  { quote: "A year from now you may wish you had started today.", author: "Karen Lamb" },
  { quote: "Time is a created thing. To say 'I don't have time' is to say 'I don't want to'.", author: "Lao Tzu" },
  { quote: "The key is in not spending time, but in investing it.", author: "Stephen R. Covey" },
  { quote: "Do not wait. The time will never be 'just right'.", author: "Napoleon Hill" },
  { quote: "Either you run the day or the day runs you.", author: "Jim Rohn" },
  { quote: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
  { quote: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.", author: "Aristotle" },
  { quote: "Small daily improvements over time lead to stunning results.", author: "Robin Sharma" },
  { quote: "The secret of getting ahead is getting started.", author: "Mark Twain" }
]

function WorkspacePage({ active, data, user, goals, profile, history, historyModal, selectedYear, availableYears, onSelectYear, onOpenSprint, onCloseSprint, onProgress, onComplete, onAdd, onShowGoalDetails, onUpdateProfile }) {
  const completed = goals.filter(goal => goal.done).length

  // Profile image cropping state
  const [cropImageSrc, setCropImageSrc] = useState(null)
  const [cropZoom, setCropZoom] = useState(1)
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 })
  const [cropImageDims, setCropImageDims] = useState({ width: 200, height: 200 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0 })

  // Edit Profile modal state
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editError, setEditError] = useState('')
  const [editLoading, setEditLoading] = useState(false)

  // Calculate active sprint date range
  const DAY = 24 * 60 * 60 * 1000
  const sprintStart = new Date(new Date(data.year, 0, 1).getTime() + (Math.min(data.sprint - 1, 99) * data.total * DAY / 100))
  const sprintEnd = new Date(data.checkpointEnd)
  const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
  const dateStr = `${dateFormat.format(sprintStart)} — ${dateFormat.format(sprintEnd)}`

  if (active === 'Goals') {
    return (
      <div className="workspace-page goals-page-custom">
        <header className="goals-page-header">
          <div className="goals-header-left">
            <span className="goals-sprint-badge">ACTIVE SPRINT CYCLE</span>
            <h1 className="goals-sprint-title">
              Sprint <em>#{String(data.sprint).padStart(2, '0')}</em>
              <span className="goals-sprint-dates">({dateStr})</span>
            </h1>
            <p className="goals-subtitle">
              All current sprint goals present here. Compounding progress is built 1% at a time.
            </p>
          </div>
          <button className="goals-primary-add-btn" onClick={onAdd}>
            Create Sprint Goal
          </button>
        </header>
        
        <section className="all-goals card">
          <div className="goal-list">
            {goals.map(goal => <GoalRow goal={goal} onProgress={onProgress} onComplete={onComplete} onShowDetails={onShowGoalDetails} key={goal.id} />)}
          </div>
        </section>
      </div>
    );
  }
  if (active === 'Timeline') {
    return (
      <div className="workspace-page timeline-page-custom">
        <header className="timeline-page-header">
          <div className="timeline-header-left">
            <span className="timeline-badge">THE YEAR IN 100 PARTS</span>
            <h1 className="timeline-title">
              Sprint <em>Timeline</em>
              <span className="timeline-year-dates">({selectedYear})</span>
            </h1>
            <p className="timeline-subtitle">
              Track your compounding progress across all 100 sprints. Click a sprint tile to inspect detailed history.
            </p>
          </div>
        </header>

        <section className="timeline">
          {history.sprints.map(summary => {
            const number = summary.sprint_number;
            const state = selectedYear < data.year ? 'past' : number < data.sprint ? 'past' : number === data.sprint ? 'current' : '';
            const start = new Date(summary.sprint_start);
            const end = new Date(summary.sprint_end);
            const tileDateStr = `${dateFormat.format(start)} — ${dateFormat.format(end)}`;
            return (
              <button className={`sprint-tile ${state}`} key={number} onClick={() => onOpenSprint(number)}>
                <span>SPRINT</span>
                <b>
                  #{String(number).padStart(2, '0')}
                  <span className="sprint-tile-dates">({tileDateStr})</span>
                </b>
                <small>{summary.completed_count} done</small>
                <strong>{summary.average_progress}% avg</strong>
                {state === 'current' && selectedYear === data.year && <i>NOW</i>}
              </button>
            );
          })}

          {selectedYear === data.year && (() => {
            const upcomingTiles = [];
            const DAY = 24 * 60 * 60 * 1000;
            const sprintDuration = (data.total * DAY) / 100;
            const baselineTime = new Date(data.checkpointEnd).getTime();

            for (let N = data.sprint + 1; N <= 100; N++) {
              const offset = N - data.sprint;
              const upcomingStart = new Date(baselineTime + (offset - 1) * sprintDuration);
              const upcomingEnd = new Date(baselineTime + offset * sprintDuration);
              const upcomingDateStr = `${dateFormat.format(upcomingStart)} — ${dateFormat.format(upcomingEnd)}`;
              
              upcomingTiles.push(
                <div key={`upcoming-${N}`} className="sprint-tile upcoming" style={{ background: '#161815', border: '1px dashed #343630', borderRadius: '6px', cursor: 'default', opacity: 0.55, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxSizing: 'border-box' }}>
                  <div>
                    <span style={{ color: '#7f8279', fontFamily: '"DM Mono", monospace', fontSize: '8px', letterSpacing: '.12em', textTransform: 'uppercase', display: 'block' }}>SPRINT</span>
                    <b style={{ display: 'block', marginTop: '9px', color: '#676a62', fontFamily: '"Instrument Serif", serif', fontSize: '30px', fontWeight: '400' }}>
                      #{String(N).padStart(2, '0')}
                      <span style={{ fontSize: '11px', fontWeight: 'normal', color: 'inherit', marginLeft: '10px', opacity: 0.8, fontFamily: '"DM Mono", monospace', verticalAlign: 'middle', display: 'inline-block', letterSpacing: '0.04em' }}>
                        ({upcomingDateStr})
                      </span>
                    </b>
                  </div>
                  <div>
                    <small style={{ display: 'block', marginTop: '18px', color: '#989c92', fontFamily: '"DM Mono", monospace', fontSize: '9px', letterSpacing: '.08em', textTransform: 'uppercase' }}>
                      UPCOMING
                    </small>
                    <strong style={{ display: 'block', marginTop: '6px', color: '#676a62', fontFamily: '"DM Mono", monospace', fontSize: '12px', fontWeight: '500' }}>
                      Not started yet
                    </strong>
                  </div>
                </div>
              );
            }
            return upcomingTiles;
          })()}
        </section>

        <div className="timeline-years">
          {availableYears.map(year => (
            <button key={year} className={year === selectedYear ? 'timeline-year active' : 'timeline-year'} onClick={() => onSelectYear(year)}>
              {year}
            </button>
          ))}
        </div>

        {historyModal && <SprintHistoryModal sprint={historyModal} onClose={onCloseSprint} onShowGoalDetails={onShowGoalDetails} />}
      </div>
    );
  }
  if (active === 'Profile') {
    const joined = profile?.user?.active_since || { year: data.year, sprint_number: data.sprint }
    const yearProgress = profile?.year || data
    const profileUser = profile?.user || user || {}
    const stats = profile?.stats || {
      goals_completed: 0,
      total_goals: 0,
      completion_rate: 0,
      current_streak: 0,
      longest_streak: 0,
    }

    return (
      <div className="workspace-page profile-page-custom">
        <header className="profile-page-header">
          <div className="profile-header-left">
            <span className="profile-badge">ACCOUNT OVERVIEW</span>
            <h1 className="profile-title">
              User <em>Profile</em>
            </h1>
            <p className="profile-subtitle">
              Manage your personal settings, view cumulative statistics, and inspect sprint achievements.
            </p>
          </div>
        </header>

        <section className="profile-hero card">
          {/* Column 1: User Identity Info */}
          <div className="profile-col-user">
            <div className="profile-avatar-container">
              <div
                className="profile-avatar large"
                onClick={() => document.getElementById('avatar-file-input').click()}
                title="Click to upload profile photo"
                style={{
                  position: 'relative',
                  cursor: 'pointer',
                  overflow: 'hidden',
                  background: '#2b2e29',
                  border: '2px solid #c9f36a',
                  boxShadow: '0 0 15px rgba(201, 243, 106, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '50%',
                }}
              >
                {profileUser.profile_photo ? (
                  <img
                    src={profileUser.profile_photo}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    alt="Profile"
                  />
                ) : (
                  (profileUser.display_name || profileUser.username || 'U').slice(0, 1).toUpperCase()
                )}
                
                <div
                  className="avatar-upload-overlay"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(0,0,0,0.6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: 0,
                    transition: 'opacity 0.15s ease',
                    fontSize: '10px',
                    fontFamily: '"DM Mono", monospace',
                    color: '#eef0e9',
                  }}
                >
                  UPLOAD
                </div>
                
                <input
                  type="file"
                  id="avatar-file-input"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 1500000) {
                      alert('Image is too large! Please upload an image smaller than 1.5MB.');
                      return;
                    }
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      const img = new Image();
                      img.src = reader.result;
                      img.onload = () => {
                        setCropImageDims({ width: img.width, height: img.height });
                        setCropImageSrc(reader.result);
                        setCropZoom(1);
                        setCropOffset({ x: 0, y: 0 });
                      };
                    };
                    reader.readAsDataURL(file);
                    e.target.value = '';
                  }}
                />
              </div>
              <div className="profile-active-pulse" />
            </div>
            
            <div className="profile-meta-details">
              <p className="eyebrow" style={{ color: '#c9f36a' }}>{profileUser.username ? `@${profileUser.username}` : 'ONEPERCENTGOAL USER'}</p>
              <h3 style={{ margin: '0 0 4px', fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 600, color: '#f6f5f1', letterSpacing: '-.05em', lineHeight: 1.15 }}>
                {profileUser.display_name || profileUser.name || 'Sai'}
              </h3>
              <p className="profile-meta" style={{ color: '#8c9085', fontSize: '13px', margin: '4px 0 12px' }}>
                Active since sprint {String(joined.sprint_number).padStart(2, '0')} · {joined.year}
              </p>
              
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="profile-edit-btn" onClick={() => setEditModalOpen(true)}>
                  Edit Profile
                </button>
                <button 
                  className="profile-edit-btn" 
                  style={{ borderColor: 'rgba(201, 243, 106, 0.35)', color: '#c9f36a' }}
                  onClick={() => {
                    const shareUrl = `${window.location.origin}/u/${profileUser.username}`;
                    navigator.clipboard.writeText(shareUrl).then(() => {
                      alert('Public profile link copied to clipboard!');
                    });
                  }}
                >
                  Share Profile
                </button>
              </div>
            </div>
          </div>
          
          {/* Column 2: Bio details */}
          <div className="profile-col-bio">
            {profileUser.bio ? (
              <>
                <span className="bio-label">BIO</span>
                <p className="bio-content-text">{profileUser.bio}</p>
              </>
            ) : (
              <p className="bio-empty-text" style={{ color: '#676a62', fontStyle: 'italic', fontSize: '13px', margin: 0 }}>
                No bio-data entered yet.
              </p>
            )}
          </div>
          
          {/* Column 3: Year progress percentage */}
          <div className="profile-col-progress">
            <span>{yearProgress.percentage.toFixed(2)}%</span>
            <small>of '{String(yearProgress.year).slice(-2)}</small>
          </div>
        </section>

        <div className="profile-stats">
          <div className="metric card"><small>GOALS COMPLETED</small><b>{stats.goals_completed}</b><span>out of {stats.total_goals} unique</span></div>
          <div className="metric card"><small>COMPLETION RATE</small><b>{stats.completion_rate}%</b><span>overall performance</span></div>
          <div className="metric card"><small>CURRENT STREAK</small><b>{stats.current_streak}</b><span>successful sprints</span></div>
          <div className="metric card"><small>LONGEST STREAK</small><b>{stats.longest_streak}</b><span>sprints record</span></div>
        </div>

        {historyModal && <SprintHistoryModal sprint={historyModal} onClose={onCloseSprint} onShowGoalDetails={onShowGoalDetails} />}
        
        <EditProfileModal
          isOpen={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          user={profileUser}
          onSubmit={async (username, displayName, bio) => {
            setEditLoading(true)
            setEditError('')
            try {
              await onUpdateProfile(username, displayName, null, bio)
              setEditModalOpen(false)
            } catch (err) {
              setEditError(err.message || 'Failed to save changes')
            } finally {
              setEditLoading(false)
            }
          }}
          loading={editLoading}
          error={editError}
        />
      
      {cropImageSrc && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.85)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          boxSizing: 'border-box'
        }}>
          <div style={{
            background: '#1d1f1c',
            border: '1px solid #343630',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '340px',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}>
            <h3 style={{ margin: '0 0 16px', color: '#eef0e9', fontSize: '18px', fontWeight: 500 }}>Crop Profile Photo</h3>
            
            {/* Viewport Mask */}
            {(() => {
              const baseScale = Math.max(200 / cropImageDims.width, 200 / cropImageDims.height);
              const imgWidth = cropImageDims.width * baseScale;
              const imgHeight = cropImageDims.height * baseScale;
              
              return (
                <div style={{
                  width: '200px',
                  height: '200px',
                  borderRadius: '50%',
                  overflow: 'hidden',
                  position: 'relative',
                  background: '#141613',
                  border: '2px solid #c9f36a',
                  boxShadow: '0 0 20px rgba(201, 243, 106, 0.25)',
                  touchAction: 'none'
                }}
                  onMouseDown={(e) => {
                    setIsDragging(true);
                    dragStart.current = { x: e.clientX - cropOffset.x, y: e.clientY - cropOffset.y };
                  }}
                  onMouseMove={(e) => {
                    if (!isDragging) return;
                    setCropOffset({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
                  }}
                  onMouseUp={() => setIsDragging(false)}
                  onMouseLeave={() => setIsDragging(false)}
                  
                  onTouchStart={(e) => {
                    setIsDragging(true);
                    const touch = e.touches[0];
                    dragStart.current = { x: touch.clientX - cropOffset.x, y: touch.clientY - cropOffset.y };
                  }}
                  onTouchMove={(e) => {
                    if (!isDragging) return;
                    const touch = e.touches[0];
                    setCropOffset({ x: touch.clientX - dragStart.current.x, y: touch.clientY - dragStart.current.y });
                  }}
                  onTouchEnd={() => setIsDragging(false)}
                >
                  <img
                    src={cropImageSrc}
                    draggable="false"
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: '50%',
                      width: `${imgWidth}px`,
                      height: `${imgHeight}px`,
                      transform: `translate(-50%, -50%) translate(${cropOffset.x}px, ${cropOffset.y}px) scale(${cropZoom})`,
                      transformOrigin: 'center center',
                      cursor: 'move',
                      userSelect: 'none',
                      pointerEvents: 'none'
                    }}
                  />
                </div>
              );
            })()}
            
            {/* Zoom Slider */}
            <div style={{ width: '100%', margin: '20px 0 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#8c9085', fontFamily: '"DM Mono", monospace', marginBottom: '8px' }}>
                <span>ZOOM</span>
                <span>{Math.round(cropZoom * 100)}%</span>
              </div>
              <input
                type="range"
                min="1"
                max="4"
                step="0.05"
                value={cropZoom}
                onChange={(e) => setCropZoom(parseFloat(e.target.value))}
                style={{
                  width: '100%',
                  accentColor: '#c9f36a',
                  background: '#2b2e29',
                  height: '4px',
                  borderRadius: '2px',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              />
            </div>
            
            {/* Buttons */}
            <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
              <button
                type="button"
                className="add-button"
                onClick={() => setCropImageSrc(null)}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: '1px solid #343630',
                  color: '#8c9085',
                  borderRadius: '24px',
                  padding: '10px',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              
              <button
                type="button"
                className="add-button"
                onClick={() => {
                  const img = new Image();
                  img.src = cropImageSrc;
                  img.onload = async () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = 200;
                    canvas.height = 200;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) return;
                    
                    ctx.fillStyle = '#1d1f1c';
                    ctx.fillRect(0, 0, 200, 200);
                    
                    const baseScale = Math.max(200 / img.width, 200 / img.height);
                    const drawWidth = img.width * baseScale * cropZoom;
                    const drawHeight = img.height * baseScale * cropZoom;
                    const dx = 100 - drawWidth / 2 + cropOffset.x;
                    const dy = 100 - drawHeight / 2 + cropOffset.y;
                    
                    ctx.drawImage(img, dx, dy, drawWidth, drawHeight);
                    
                    const croppedBase64 = canvas.toDataURL('image/jpeg', 0.85);
                    try {
                      await onUpdateProfile(
                        profileUser.username || `user_${profileUser.id}`,
                        profileUser.display_name || profileUser.name || 'User',
                        croppedBase64
                      );
                      setCropImageSrc(null);
                    } catch (err) {
                      console.error(err);
                    }
                  };
                }}
                style={{
                  flex: 1,
                  background: '#c9f36a',
                  color: '#1d1f1c',
                  border: 'none',
                  borderRadius: '24px',
                  padding: '10px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    );
  }
}

const getISTDate = () => {
  const d = new Date()
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000)
  return new Date(utc + (3600000 * 5.5))
}

function App() {
  const [now, setNow] = useState(getISTDate())
  const filterImageHref = "data:image/svg+xml," + encodeURIComponent(`
    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1' color-interpolation-filters='sRGB'>
      <g>
        <rect width='1' height='1' fill='black' />
        <rect width='1' height='1' fill='url(#red)' style='mix-blend-mode:screen' />
        <rect width='1' height='1' fill='url(#green)' style='mix-blend-mode:screen' />
        <rect width='1' height='1' fill='url(#yellow)' style='mix-blend-mode:screen' />
      </g>
      <defs>
        <radialGradient id='yellow' cx='0' cy='0' r='1' >
          <stop stop-color='yellow' />
          <stop stop-color='yellow' offset='1' stop-opacity='0' />
        </radialGradient>
        <radialGradient id='green' cx='1' cy='0' r='1' >
          <stop stop-color='green' />
          <stop stop-color='green' offset='1' stop-opacity='0' />
        </radialGradient>
        <radialGradient id='red' cx='0' cy='1' r='1' >
          <stop stop-color='red' />
          <stop stop-color='red' offset='1' stop-opacity='0' />
        </radialGradient>
      </defs>
    </svg>
  `)
  const [active, setActive] = useState('Overview')
  const [quoteIndices, setQuoteIndices] = useState([0, 1])
  const [headerHidden, setHeaderHidden] = useState(false)

  useEffect(() => {
    let lastScrollY = window.scrollY
    let scrollTimeout = null

    const handleScroll = () => {
      const currentScrollY = window.scrollY
      if (currentScrollY < lastScrollY) {
        setHeaderHidden(false)
      } else if (currentScrollY > lastScrollY && currentScrollY > 50) {
        setHeaderHidden(true)
      }

      if (scrollTimeout) clearTimeout(scrollTimeout)
      scrollTimeout = setTimeout(() => {
        setHeaderHidden(false)
      }, 250)

      lastScrollY = currentScrollY
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (scrollTimeout) clearTimeout(scrollTimeout)
    }
  }, [])
  useEffect(() => {
    if (active === 'Overview') {
      const len = MOTIVATIONAL_QUOTES.length
      if (len > 1) {
        const i1 = Math.floor(Math.random() * len)
        let i2 = Math.floor(Math.random() * len)
        while (i2 === i1) {
          i2 = Math.floor(Math.random() * len)
        }
        setQuoteIndices([i1, i2])
      }
    }
  }, [active])
  const [goals, setGoals] = useState([])
  const [addGoalModalOpen, setAddGoalModalOpen] = useState(false)
  const [addGoalLoading, setAddGoalLoading] = useState(false)
  const [timelineHistory, setTimelineHistory] = useState({ year: new Date().getFullYear(), years: [], sprints: [] })
  const [selectedTimelineYear, setSelectedTimelineYear] = useState(new Date().getFullYear())
  const [profile, setProfile] = useState(null)
  const [historyModal, setHistoryModal] = useState(null)
  const [completionFlow, setCompletionFlow] = useState(null)
  const [selectedGoalDetails, setSelectedGoalDetails] = useState(null)

  const shareMatch = window.location.pathname.match(/^\/u\/([a-zA-Z0-9_-]+)/)
  const shareUsername = shareMatch ? shareMatch[1] : null
  const [publicData, setPublicData] = useState(null)
  const [publicLoading, setPublicLoading] = useState(false)
  const [publicError, setPublicError] = useState('')
  const [publicYear, setPublicYear] = useState(new Date().getFullYear())

  useEffect(() => {
    if (shareUsername) {
      const fetchPublic = async () => {
        setPublicLoading(true)
        setPublicError('')
        try {
          const response = await apiFetch(`/api/u/${shareUsername}?year=${publicYear}`)
          if (!response.ok) {
            const err = await response.json()
            throw new Error(err.detail || 'User profile not found')
          }
          const result = await response.json()
          setPublicData(result)
        } catch (err) {
          setPublicError(err.message || 'Failed to load public profile')
        } finally {
          setPublicLoading(false)
        }
      }
      fetchPublic()
    }
  }, [shareUsername, publicYear])
  const showGoalDetails = goal => {
    setSelectedGoalDetails({
      title: goal.title,
      completion_note: goal.completion_note || goal.completed_note || ''
    })
  }
  const [sessionToken, setSessionToken] = useState(() => localStorage.getItem('onepercentgoal.token') || '')
  const [currentUser, setCurrentUser] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [authMode, setAuthMode] = useState('login')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState('')

  const buildHeaders = extra => ({ ...(extra || {}), ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}) })

  useEffect(() => {
    const id = setInterval(() => setNow(getISTDate()), 50)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const tokenFromUrl = new URLSearchParams(window.location.search).get('auth_token')
    if (tokenFromUrl) {
      localStorage.setItem('onepercentgoal.token', tokenFromUrl)
      window.history.replaceState({}, document.title, window.location.pathname)
    }
    const token = tokenFromUrl || localStorage.getItem('onepercentgoal.token')
    if (!token) {
      setAuthReady(true)
      return
    }
    setSessionToken(token)
      apiFetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(response => response.ok ? response.json() : Promise.reject(response))
      .then(data => {
        setCurrentUser(data.user)
        setAuthReady(true)
      })
      .catch(() => {
        localStorage.removeItem('onepercentgoal.token')
        setSessionToken('')
        setCurrentUser(null)
        setAuthReady(true)
      })
  }, [])

  const data = useMemo(() => getYearData(now), [now])
  const deadlineStr = useMemo(() => {
    if (!data?.checkpointEnd) return ''
    const deadlineFormat = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    return deadlineFormat.format(data.checkpointEnd)
  }, [data])
  const day = Math.floor(data.elapsed / DAY) + 1
  const start = new Date(data.checkpointEnd.getTime() - (data.total * DAY / 100))
  const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
  const hr = now.getHours()
  const greeting = hr < 4 ? 'Good night' : hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : hr < 22 ? 'Good evening' : 'Good night'
  const nextSprintMs = Math.max(0, data.checkpointEnd.getTime() - now.getTime())
  const secondsLeft = Math.floor(nextSprintMs / 1000)
  const daysLeft = Math.floor(secondsLeft / 86400)
  const hoursLeft = Math.floor((secondsLeft % 86400) / 3600)
  const minutesLeft = Math.floor((secondsLeft % 3600) / 60)
  const secsLeft = secondsLeft % 60
  const completeGoals = goals.filter(g => g.done).length

  const refreshProfile = async (token, year) => {
    const activeToken = token || sessionToken
    if (!activeToken) return
    const yr = year || selectedTimelineYear
    try {
      const response = await apiFetch(`/api/profile?year=${yr}`, { headers: { Authorization: `Bearer ${activeToken}` } })
      if (!response.ok) throw new Error('Unable to load profile')
      setProfile(await response.json())
    } catch {
      setProfile(null)
    }
  }

  const loadDashboard = async token => {
    try {
      const response = await apiFetch('/api/dashboard', { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) throw new Error('Unable to load dashboard')
      const data = await response.json()
      setGoals(data.goals.map(presentGoal))
    } catch {
      setGoals([
        presentGoal({ id: 1, title: 'Finish Palm Vein Recognition', description: 'Research project', progress_percent: 0, completed: false }),
        presentGoal({ id: 2, title: 'Read deeply', progress_percent: 60, completed: false }),
        presentGoal({ id: 3, title: 'LeetCode practice', progress_percent: 70, completed: false }),
      ])
    }
  }

  useEffect(() => {
    if (!currentUser || !sessionToken) return
    loadDashboard(sessionToken)
    refreshProfile(sessionToken, selectedTimelineYear)
  }, [currentUser, sessionToken, data.year, selectedTimelineYear])

  useEffect(() => {
    if (!currentUser || !sessionToken) return
    setSelectedTimelineYear(data.year)
  }, [data.year, currentUser, sessionToken])

  useEffect(() => {
    if (!currentUser || !sessionToken) return
    apiFetch(`/api/timeline?year=${selectedTimelineYear}`, { headers: buildHeaders() })
      .then(response => response.ok ? response.json() : Promise.reject(response))
      .then(timeline => {
        setTimelineHistory(timeline)
        setHistoryModal(null)
      })
      .catch(() => setTimelineHistory({ year: selectedTimelineYear, years: [], sprints: [] }))
  }, [selectedTimelineYear, currentUser, sessionToken])

  useEffect(() => {
    if (!currentUser || !sessionToken) return
    refreshProfile(sessionToken, selectedTimelineYear)
  }, [data.year, selectedTimelineYear, currentUser, sessionToken])

  const handleAuth = async (form, mode) => {
    setAuthLoading(true)
    setAuthError('')
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register'
      const payload = mode === 'login'
        ? { email: form.email, password: form.password }
        : { email: form.email, password: form.password, display_name: form.display_name }
      const response = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.detail || 'Authentication failed')
      localStorage.setItem('onepercentgoal.token', result.token)
      setSessionToken(result.token)
      setCurrentUser(result.user)
      setActive('Overview')
      setProfile(null)
      setGoals([])
      await loadDashboard(result.token)
      await refreshProfile(result.token)
      setAuthReady(true)
    } catch (error) {
      setAuthError(error.message || 'Authentication failed')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleGoogle = () => {
    window.location.href = apiUrl('/api/auth/google/start')
  }

  const completeProfile = async form => {
    setProfileLoading(true)
    setProfileError('')
    try {
      const response = await apiFetch('/api/auth/profile', {
        method: 'POST',
        headers: buildHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(form),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.detail || 'Unable to save profile')
      setCurrentUser(result.user)
      await refreshProfile()
    } catch (error) {
      setProfileError(error.message || 'Unable to save profile')
    } finally {
      setProfileLoading(false)
    }
  }

  const logout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST', headers: buildHeaders() })
    } catch {}
    localStorage.removeItem('onepercentgoal.token')
    setSessionToken('')
    setCurrentUser(null)
    setGoals([])
    setProfile(null)
    setTimelineHistory({ year: new Date().getFullYear(), years: [], sprints: [] })
    setHistoryModal(null)
    setCompletionFlow(null)
    setAuthMode('login')
  }

  const updateGoal = async (goal, payload) => {
    try {
      const response = await apiFetch(`/api/goals/${goal.id}`, { method: 'PATCH', headers: buildHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(payload) })
      if (!response.ok) throw new Error('Unable to update goal')
      const saved = presentGoal(await response.json())
      setGoals(items => items.map(item => item.id === goal.id ? saved : item))
      await refreshProfile()
      return true
    } catch { return false }
  }
  const updateProgress = async (goal, progress_percent) => {
    const previous = goal.value
    setGoals(items => items.map(item => item.id === goal.id ? presentGoal({ ...item, progress_percent }) : item))
    const saved = await updateGoal(goal, { progress_percent })
    if (!saved) {
      setGoals(items => items.map(item => item.id === goal.id ? presentGoal({ ...item, progress_percent: previous }) : item))
    }
  }
  const startCompletion = goal => setCompletionFlow({ goal, note: '', step: 'note' })

  const continueCompletion = () => {
    if (!completionFlow) return
    const note = completionFlow.note.trim()
    if (!note) return
    setCompletionFlow(flow => flow ? { ...flow, note, step: 'confirm' } : flow)
  }

  const completeGoal = async () => {
    if (!completionFlow) return
    const note = completionFlow.note.trim()
    const saved = await updateGoal(completionFlow.goal, { completed: true, completion_note: note })
    if (!saved) return
    try {
      const image = await createCompletionCard(completionFlow.goal, note)
      downloadImage(image, `onepercentgoal-${sanitizeFilename(completionFlow.goal.title)}.png`)
    } catch {
      // The goal is still completed even if the image download fails.
    }
    await refreshProfile()
    setCompletionFlow(null)
  }

  const addGoal = async (title) => {
    if (!title?.trim()) return
    setAddGoalLoading(true)
    try {
      const response = await apiFetch('/api/goals', { method: 'POST', headers: buildHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ title: title.trim() }) })
      if (!response.ok) throw new Error('Unable to add goal')
      const saved = presentGoal(await response.json())
      setGoals(items => [...items, saved])
      await refreshProfile()
      setAddGoalModalOpen(false)
    } catch { window.alert('The goal could not be saved.') }
    finally { setAddGoalLoading(false) }
  }

  const openSprintHistory = async sprintNumber => {
    const cached = timelineHistory.sprints.find(sprint => sprint.sprint_number === sprintNumber)
    if (cached?.goals) return setHistoryModal(cached)
    try {
      const response = await apiFetch(`/api/timeline/${sprintNumber}?year=${selectedTimelineYear}`, { headers: buildHeaders() })
      if (!response.ok) throw new Error('Unable to load sprint history')
      const sprint = await response.json()
      setTimelineHistory(items => ({ ...items, sprints: items.sprints.map(item => item.sprint_number === sprintNumber ? sprint : item) }))
      setHistoryModal(sprint)
    } catch {}
  }

  const handleUpdateProfile = async (username, displayName, profilePhoto = null, bio = null) => {
    try {
      const response = await apiFetch('/api/auth/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildHeaders()
        },
        body: JSON.stringify({
          username,
          display_name: displayName,
          profile_photo: profilePhoto,
          bio: bio !== null ? bio : currentUser?.bio || ""
        })
      })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.detail || 'Failed to update profile')
      }
      const result = await response.json()
      setCurrentUser(result.user)
      if (profile) {
        setProfile(prev => ({
          ...prev,
          user: result.user
        }))
      }
      return result.user
    } catch (e) {
      alert(e.message)
      throw e;
    }
  }

  const userLabel = currentUser?.display_name || currentUser?.name || currentUser?.email || 'Sai'
  const userInitial = (currentUser?.display_name || currentUser?.username || currentUser?.email || 'U').slice(0, 1).toUpperCase()
  const needsProfile = Boolean(currentUser?.needs_profile)

  const streak = profile?.stats?.current_streak ?? 0
  const completionRate = profile?.stats?.completion_rate ?? 0

  if (!authReady) {
    return <main className="app-shell"><div className="auth-screen"><section className="auth-card card"><p className="eyebrow">ONEPERCENTGOAL</p><h1>Loading…</h1></section></div></main>
  }

  if (shareUsername) {
    return (
      <main className="app-shell">
        <header className={`shell-header ${headerHidden ? 'header-hidden' : ''}`}>
          <div className="shell-pill">
            <button className="shell-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'instant' })} aria-label="OnePercentGoal home" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <img src="/favicon.ico" alt="Logo" style={{ width: '18px', height: '18px', objectFit: 'contain' }} />
              <span>onepercentgoal</span>
            </button>
            <button className="shell-nav-item" onClick={() => window.location.href = '/'} style={{ background: 'transparent', border: '1px solid #3c4037', color: '#c9f36a', padding: '6px 14px', borderRadius: '24px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: '"DM Mono", monospace', letterSpacing: '0.04em' }}>
              JOIN ONEPERCENTGOAL
            </button>
          </div>
        </header>

        <section className="content" style={{ paddingBottom: '60px' }}>
          {publicLoading && <p style={{ color: '#8c9085', textAlign: 'center', fontFamily: '"DM Mono", monospace' }}>Loading profile...</p>}
          {publicError && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <h2 style={{ color: '#ff6b6b', fontWeight: 500 }}>Profile Not Found</h2>
              <p style={{ color: '#8c9085', margin: '12px 0 24px' }}>{publicError}</p>
              <button className="profile-edit-btn" onClick={() => window.location.href = '/'}>Go Home</button>
            </div>
          )}
          
          {publicData && (
            <div className="workspace-page" style={{ animation: 'fadeIn 0.3s ease' }}>
              <header className="profile-page-header">
                <div className="profile-header-left">
                  <span className="profile-badge">PUBLIC SPRINT PROFILE</span>
                  <h1 className="profile-title">
                    @{publicData.user.username}<em>'s dashboard</em>
                  </h1>
                </div>
              </header>

              {/* 3-Column Profile Summary Card */}
              <section className="profile-hero card" style={{ marginBottom: '24px' }}>
                <div className="profile-col-user">
                  <div className="profile-avatar-container">
                    <div
                      className="profile-avatar large"
                      style={{
                        position: 'relative',
                        overflow: 'hidden',
                        background: '#2b2e29',
                        border: '2px solid #c9f36a',
                        boxShadow: '0 0 15px rgba(201, 243, 106, 0.15)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '50%',
                      }}
                    >
                      {publicData.user.profile_photo ? (
                        <img src={publicData.user.profile_photo} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Profile" />
                      ) : (
                        (publicData.user.display_name || publicData.user.username || 'U').slice(0, 1).toUpperCase()
                      )}
                    </div>
                    <div className="profile-active-pulse" />
                  </div>
                  
                  <div className="profile-meta-details">
                    <p className="eyebrow" style={{ color: '#c9f36a', margin: 0 }}>@{publicData.user.username}</p>
                    <h3 style={{ margin: '4px 0', fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 600, color: '#f6f5f1', letterSpacing: '-.05em', lineHeight: 1.15 }}>
                      {publicData.user.display_name}
                    </h3>
                    <p className="profile-meta" style={{ color: '#8c9085', fontSize: '13px', margin: 0 }}>
                      Active since sprint {String(publicData.user.active_since.sprint_number).padStart(2, '0')} · {publicData.user.active_since.year}
                    </p>
                  </div>
                </div>

                <div className="profile-col-bio">
                  {publicData.user.bio ? (
                    <>
                      <span className="bio-label">BIO</span>
                      <p className="bio-content-text">{publicData.user.bio}</p>
                    </>
                  ) : (
                    <p className="bio-empty-text" style={{ color: '#676a62', fontStyle: 'italic', fontSize: '13px', margin: 0 }}>
                      No bio-data entered yet.
                    </p>
                  )}
                </div>

                <div className="profile-col-progress">
                  <span>{publicData.stats.completion_rate}%</span>
                  <small>Completion Rate</small>
                </div>
              </section>

              {/* Active Sprint Goals Section */}
              <h2 style={{ fontSize: '20px', fontWeight: 500, margin: '32px 0 16px', letterSpacing: '-0.02em', color: '#eef0e9' }}>
                Active Sprint Goals <span style={{ color: '#8c9085', fontSize: '13px', fontWeight: 'normal', marginLeft: '8px' }}>(Sprint #{publicData.sprint})</span>
              </h2>
              <section className="all-goals card" style={{ marginBottom: '32px' }}>
                {publicData.goals.length === 0 ? (
                  <p style={{ color: '#8c9085', margin: 0, fontStyle: 'italic', padding: '16px' }}>No active goals for this sprint.</p>
                ) : (
                  <div className="goal-list">
                    {publicData.goals.map(goal => (
                      <div className="goal" key={goal.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px' }}>
                        <div className="goal-content" style={{ flex: 1 }}>
                          <span style={{ fontSize: '15px', color: goal.completed ? '#8c9085' : '#eef0e9', textDecoration: goal.completed ? 'line-through' : 'none' }}>
                            {goal.title}
                          </span>
                          <span style={{ fontSize: '11px', color: '#676a62', fontFamily: '"DM Mono", monospace' }}>
                            PROGRESS: {goal.progress} / {goal.target}
                          </span>
                        </div>
                        <span style={{
                          color: goal.completed ? '#c9f36a' : '#8c9085',
                          fontSize: '12px',
                          fontFamily: '"DM Mono", monospace',
                          fontWeight: 600,
                          border: `1px solid ${goal.completed ? 'rgba(201, 243, 106, 0.3)' : '#343630'}`,
                          padding: '4px 8px',
                          borderRadius: '4px',
                          background: goal.completed ? 'rgba(201, 243, 106, 0.05)' : 'transparent'
                        }}>
                          {goal.completed ? 'DONE' : 'ACTIVE'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Cumulative stats */}
              <h2 style={{ fontSize: '20px', fontWeight: 500, margin: '0 0 16px', letterSpacing: '-0.02em', color: '#eef0e9' }}>Performance Stats</h2>
              <div className="profile-stats" style={{ marginBottom: '32px' }}>
                <div className="metric card"><small>GOALS COMPLETED</small><b>{publicData.stats.goals_completed}</b><span>out of {publicData.stats.total_goals} unique</span></div>
                <div className="metric card"><small>COMPLETION RATE</small><b>{publicData.stats.completion_rate}%</b><span>overall performance</span></div>
                <div className="metric card"><small>CURRENT STREAK</small><b>{publicData.stats.current_streak}</b><span>successful sprints</span></div>
                <div className="metric card"><small>LONGEST STREAK</small><b>{publicData.stats.longest_streak}</b><span>sprints record</span></div>
              </div>

              {/* Timeline heat grid */}
              <h2 style={{ fontSize: '20px', fontWeight: 500, margin: '0 0 16px', letterSpacing: '-0.02em', color: '#eef0e9' }}>Sprint History</h2>
              <section className="timeline" style={{ marginBottom: '32px' }}>
                {publicData.history.sprints.map(summary => {
                  const number = summary.sprint_number;
                  const state = number < publicData.sprint ? 'past' : number === publicData.sprint ? 'current' : '';
                  const start = new Date(summary.sprint_start);
                  const end = new Date(summary.sprint_end);
                  const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
                  const tileDateStr = `${dateFormat.format(start)} — ${dateFormat.format(end)}`;
                  return (
                    <div className={`sprint-tile ${state}`} key={number} style={{ cursor: 'default' }}>
                      <span>SPRINT</span>
                      <b>
                        #{String(number).padStart(2, '0')}
                        <span className="sprint-tile-dates">({tileDateStr})</span>
                      </b>
                      <small>{summary.completed_count} done</small>
                      <strong>{summary.average_progress}% avg</strong>
                      {state === 'current' && <i>NOW</i>}
                    </div>
                  );
                })}
              </section>

              {/* Timeline Years */}
              <div className="timeline-years">
                {publicData.history.years.map(yr => (
                  <button key={yr} className={yr === publicYear ? 'timeline-year active' : 'timeline-year'} onClick={() => setPublicYear(yr)}>
                    {yr}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>
    );
  }

  if (!currentUser) {
    return <main className="app-shell">
      <header className={`shell-header ${headerHidden ? 'header-hidden' : ''}`}>
        <div className="shell-pill">
          <button className="shell-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'instant' })} aria-label="OnePercentGoal home" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img src="/favicon.ico" alt="Logo" style={{ width: '18px', height: '18px', objectFit: 'contain' }} />
            <span>onepercentgoal</span>
          </button>
        </div>
      </header>
      <section className="content">
        <AuthScreen mode={authMode} setMode={setAuthMode} onSubmit={handleAuth} onGoogle={handleGoogle} loading={authLoading} error={authError} />
      </section>
    </main>
  }

  return <main className="app-shell">
    <header className={`shell-header ${headerHidden ? 'header-hidden' : ''}`}>
      <div className="shell-pill">
        <button className="shell-brand" onClick={() => { setActive('Overview'); window.scrollTo({ top: 0, behavior: 'instant' }); }} aria-label="OnePercentGoal home" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img src="/favicon.ico" alt="Logo" style={{ width: '18px', height: '18px', objectFit: 'contain' }} />
          <span>onepercentgoal</span>
        </button>
        <nav className="shell-nav" aria-label="Primary">
          {['Overview', 'Goals', 'Timeline', 'Profile'].map(item => <button key={item} onClick={() => { setActive(item); window.scrollTo({ top: 0, behavior: 'instant' }); }} className={active === item ? 'shell-nav-item active' : 'shell-nav-item'}>{item}</button>)}
        </nav>
        <button className="shell-nav-item" type="button" onClick={logout}>Logout</button>
      </div>
    </header>

    <section className="content" id="top">
      {active !== 'Overview' ? <WorkspacePage active={active} data={{ ...data, day, total: data.total }} user={currentUser} goals={goals} profile={profile} history={timelineHistory} historyModal={historyModal} selectedYear={selectedTimelineYear} availableYears={timelineHistory.years} onSelectYear={setSelectedTimelineYear} onOpenSprint={openSprintHistory} onCloseSprint={() => setHistoryModal(null)} onProgress={updateProgress} onComplete={startCompletion} onAdd={() => setAddGoalModalOpen(true)} onShowGoalDetails={showGoalDetails} onUpdateProfile={handleUpdateProfile} /> : <>
      <section className="aurora-hero-wrapper">
        <div className="aurora-hero-bg"></div>

        <div className="aurora-content">
          <div className="aurora-text-group">
            <p className="eyebrow motivational-eyebrow" style={{ color: '#fff', textShadow: '0 0 8px rgba(255,255,255,0.45)', margin: '0 0 16px' }}>
              {greeting.toUpperCase()}, {userLabel.toUpperCase()}
            </p>
            <h1 className="h1-scalingSize">
              <span>Make this</span>
              <MorphText />
              <span>count.</span>
            </h1>
            <p className="billboard-subtitle" style={{ color: '#fff', opacity: 0.82, margin: '16px 0 0', maxWidth: '640px', fontSize: '16px', lineHeight: 1.55 }}>
              One percent progress every single day compounding over the year. The system is active. Are you ready?
            </p>
          </div>
          
          <div className="aurora-action-group" style={{ flexShrink: 0 }}>
            <LiquidMetalButton size="md" onClick={() => setActive('Goals')}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '16px' }}>
                Enter Goals Board
                <span style={{
                  borderRadius: '9999px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#242721',
                  width: '32px',
                  height: '32px',
                  color: '#c9f36a',
                  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)',
                  fontSize: '18px',
                  lineHeight: 1
                }}>→</span>
              </span>
            </LiquidMetalButton>
          </div>
        </div>

        <svg
          version="1.1"
          xmlns="http://www.w3.org/2000/svg"
          xmlnsXlink="http://www.w3.org/1999/xlink"
          colorInterpolationFilters="sRGB"
          style={{ position: "absolute", opacity: 0, height: 0, width: 0, pointerEvents: "none" }}
          aria-hidden="true"
          focusable="false"
        >
          <filter id="fluted" primitiveUnits="objectBoundingBox">
            <feImage
              x="0"
              y="0"
              result="image_0"
              crossOrigin="anonymous"
              href={filterImageHref}
              preserveAspectRatio="none meet"
              width=".03"
              height="1"
            />
            <feTile in="image_0" result="tile_0" />
            <feGaussianBlur stdDeviation=".0001" edgeMode="none" in="tile_0" result="bar_smoothness" x="0" y="0" />
            <feDisplacementMap scale=".08" xChannelSelector="R" yChannelSelector="G" in="SourceGraphic" in2="bar_smoothness" result="displacement_0" />
          </filter>
        </svg>
      </section>

      {/* Visual Compounding Banner */}
      <section className="compounding-banner-visual card">
        <div className="compounding-watermark">COMPOUNDING</div>
        <div className="compounding-glow"></div>
        <div className="compounding-banner-inner">
          <div className="compounding-visuals-left">
            <div className="compounding-eq-row">
              <span className="eq-term font-instrument-italic">1 Sprint</span>
              <span className="eq-operator">=</span>
              <span className="eq-result color-lime">1% of Year</span>
            </div>
            <div className="compounding-eq-row">
              <span className="eq-term font-instrument-italic">1 Sprint</span>
              <span className="eq-operator">=</span>
              <span className="eq-result color-lime">3.6 Days</span>
            </div>
          </div>
          <div className="compounding-actions-right">
            <p className="compounding-cta-text">
              Complete your mini goals in that 3.6 days in here
            </p>
            <button className="compounding-create-btn" onClick={() => setAddGoalModalOpen(true)}>
              Create Sprint Goal
            </button>
          </div>
        </div>
      </section>

      {/* High-Tech Temporal Urgency Console */}
      <section className="urgency-console">
        <div className="urgency-header">
          <span className="urgency-system-status">SYS.ACTIVE // SPRINT #{String(data.sprint).padStart(2, '0')}</span>
        </div>
        
        <div className="urgency-main">
          <div className="urgency-live-percentage">
            <div className="live-num">{data.percentage.toFixed(6)}<em>%</em></div>
            <div className="live-label">OF {data.year} COMPLETED</div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '14px', color: '#8c9085', letterSpacing: '0.12em', marginBottom: '8px', textTransform: 'uppercase' }}>
              Next sprint begins in
            </div>
            <div className="urgency-countdown-grid">
              <div className="time-block">
                <span className="time-val">{String(daysLeft).padStart(2, '0')}</span>
                <span className="time-lbl">DAYS</span>
              </div>
              <i className="time-sep">:</i>
              <div className="time-block">
                <span className="time-val">{String(hoursLeft).padStart(2, '0')}</span>
                <span className="time-lbl">HOURS</span>
              </div>
              <i className="time-sep">:</i>
              <div className="time-block">
                <span className="time-val">{String(minutesLeft).padStart(2, '0')}</span>
                <span className="time-lbl">MINUTES</span>
              </div>
              <i className="time-sep">:</i>
              <div className="time-block">
                <span className="time-val">{String(secsLeft).padStart(2, '0')}</span>
                <span className="time-lbl">SECONDS</span>
              </div>
            </div>
            <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '14px', color: '#8c9085', letterSpacing: '0.12em', marginTop: '8px', textTransform: 'uppercase' }}>
              Sprint #{String(data.sprint).padStart(2, '0')} → #{String(data.sprint + 1).padStart(2, '0')}
            </div>
          </div>
        </div>

        {/* Glowing Progress Track (Highlighted & Main) */}
        <div className="urgency-track-wrap">
          <div className="urgency-track-labels">
            <span />
            <span>YEAR REMAINING: {(100 - data.percentage).toFixed(6)}% · DAY {day} OF {data.total}</span>
          </div>
          <div className="urgency-progress-track main-highlighted-track">
            <div className="urgency-progress-bar" style={{ width: `${data.percentage}%` }} />
            <div className="urgency-progress-glow" style={{ left: `${data.percentage}%` }} />
          </div>
          <div className="urgency-progress-scale" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', color: '#8c9085', fontFamily: '"DM Mono", monospace', fontSize: '13px', letterSpacing: '.08em' }}>
            <span>{data.year}</span>
            <span>25%</span>
            <span>50%</span>
            <span>75%</span>
            <span>{data.year + 1}</span>
          </div>
        </div>

        <div className="urgency-footer-warning">
          <span className="warning-icon">✦</span>
          <p className="warning-text">Time is slipping away. Every second counts. Today is Day {day} of {data.total}. <b>Will you complete your goals, or let another day burn out?</b></p>
        </div>
      </section>

      {/* Grid containing Current Sprint, Quote and Momentum */}
      <section className="overview-grid">
        <article className="sprint-summary card">
          <div className="sprint-summary-header">
            <p className="eyebrow">ACTIVE SPRINT STATUS</p>
            <h2>
              Sprint #{String(data.sprint).padStart(2, '0')}{' '}
              <span style={{ fontSize: '15px', fontWeight: 'normal', color: 'inherit', marginLeft: '14px', letterSpacing: '0.06em', opacity: 0.85 }}>
                ({dateFormat.format(start)} — {dateFormat.format(data.checkpointEnd)})
              </span>
            </h2>
          </div>
          
          {/* Circular dial and stats */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', margin: '15px 0 20px' }}>
            <div className="sprint-progress-circle-wrap">
              <div className="sprint-progress-big-number">
                {goals.length ? Math.round(completeGoals / goals.length * 100) : 0}<em>%</em>
              </div>
              <p className="sprint-progress-label">completed</p>
            </div>
            
            <div style={{ flex: 1 }}>
              <div className="sprint-num-value" style={{ fontSize: '18px' }}>{completeGoals}/{goals.length}</div>
              <p className="sprint-num-label" style={{ margin: '2px 0 0' }}>GOALS DONE</p>
            </div>
          </div>

          {/* Real-time Sprint Checklist */}
          <div className="sprint-goals-mini-list" style={{ flex: 1, marginBottom: '15px', maxHeight: '180px', overflowY: 'auto', paddingRight: '4px' }}>
            {goals.length === 0 ? (
              <p style={{ margin: '10px 0', fontSize: '12px', color: '#8c9085', fontStyle: 'italic' }}>No goals set for this sprint. Get started!</p>
            ) : (
              goals.map(g => (
                <div key={g.id} className={`mini-goal-item ${g.done ? 'completed' : ''}`} onClick={() => { if (g.done) showGoalDetails(g); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', borderBottom: '1px solid #282a25', fontSize: '12px', cursor: g.done ? 'pointer' : 'default' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <span style={{ color: g.done ? '#c9f36a' : '#8c9085', fontWeight: 'bold' }}>{g.done ? '✓' : '•'}</span>
                    <span style={{ textDecoration: g.done ? 'line-through' : 'none', color: g.done ? '#7f8279' : '#eef0e9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.title}</span>
                  </div>
                  <span style={{ fontFamily: '"DM Mono", monospace', fontSize: '10px', color: g.done ? '#c9f36a' : '#a1a49b' }}>{g.value}%</span>
                </div>
              ))
            )}
          </div>
          
          <button className="goals-cta" onClick={() => setActive('Goals')}>
            <span>Open Sprint Board</span>
            <b>→</b>
          </button>
        </article>

        {/* Temporal Wisdom Card */}
        <article className="quote-card card" style={{ display: 'flex', flexDirection: 'column', gap: '24px', justifyContent: 'flex-start' }}>
          <p className="eyebrow" style={{ marginBottom: '4px' }}>MOTIVATIONAL DRIVE</p>
          
          {(() => {
            const q1 = MOTIVATIONAL_QUOTES[quoteIndices[0] ?? 0];
            const q2 = MOTIVATIONAL_QUOTES[quoteIndices[1] ?? 1];
            
            return (
              <>
                <div className="quote-item">
                  <blockquote style={{ margin: '0 0 10px', fontSize: '24px', lineHeight: 1.25 }}>
                    “{q1.quote}”
                  </blockquote>
                  <span className="quote-author" style={{ marginTop: '0', display: 'block' }}>
                    — {q1.author}
                  </span>
                </div>

                <div className="quote-item" style={{ borderTop: '1px solid #282a25', paddingTop: '20px' }}>
                  <blockquote style={{ margin: '0 0 10px', fontSize: '24px', lineHeight: 1.25 }}>
                    “{q2.quote}”
                  </blockquote>
                  <span className="quote-author" style={{ marginTop: '0', display: 'block' }}>
                    — {q2.author}
                  </span>
                </div>
              </>
            );
          })()}

          <div className="quote-line" style={{ marginTop: 'auto' }} />
        </article>

        {/* Live stats and momentum */}
        <article className="stats-card card">
          <p className="eyebrow">YOUR SPEED & MOMENTUM</p>
          
          <div className="stats-showcase">
            <div className="stat-giant-box" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', justifyContent: 'center', padding: '24px' }}>
              <div className="sprint-progress-circle-wrap" style={{ margin: '0 0 12px', alignItems: 'center' }}>
                <div className="sprint-progress-big-number" style={{ fontSize: '64px', lineHeight: 1 }}>
                  {streak}
                </div>
                <p className="sprint-progress-label" style={{ marginTop: '4px', fontSize: '11px' }}>Sprint Streak</p>
              </div>
              <div className="stat-giant-badge" style={{ color: '#c9f36a', fontSize: '12px' }}>{streak} Sprint{streak === 1 ? '' : 's'} Constant Progress</div>
            </div>
            
            <div className="stat-giant-box" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', justifyContent: 'center', padding: '24px' }}>
              <div className="sprint-progress-circle-wrap" style={{ margin: '0 0 12px', alignItems: 'center' }}>
                <div className="sprint-progress-big-number" style={{ fontSize: '64px', lineHeight: 1 }}>
                  {completionRate}<em>%</em>
                </div>
                <p className="sprint-progress-label" style={{ marginTop: '4px', fontSize: '11px' }}>Completion Rate</p>
              </div>
              <div className="stat-giant-badge" style={{ color: completionRate >= 80 ? '#c9f36a' : completionRate >= 60 ? '#eef0e9' : '#ffb9b9', fontSize: '12px' }}>
                {completionRate >= 80 ? 'ELITE LEVEL PERFORMANCE' : completionRate >= 60 ? 'STEADY PERFORMANCE' : 'WARNING: FOCUS INTENSIVELY'}
              </div>
            </div>
          </div>
        </article>
      </section>

      <footer><span>ONEPERCENTGOAL / {data.year}</span><span>Life changes 1% at a time.</span></footer>
      </>}
      {needsProfile && <ProfileSetupModal user={currentUser} onSubmit={completeProfile} loading={profileLoading} error={profileError} />}
      <AddGoalModal isOpen={addGoalModalOpen} onClose={() => setAddGoalModalOpen(false)} onSubmit={addGoal} loading={addGoalLoading} deadline={deadlineStr} />
      {completionFlow && completionFlow.step === 'note' && <div className="modal-backdrop" role="presentation"><form className="completion-modal" onSubmit={event => { event.preventDefault(); continueCompletion() }}><p className="eyebrow">MARK AS COMPLETED</p><h2>{completionFlow.goal.title}</h2><label className="reflection-label">How did you complete it? <span className="req-tag">Required</span><span className="desc-tag">This note will appear in the shareable image.</span></label><textarea autoFocus required value={completionFlow.note} onChange={event => setCompletionFlow(flow => flow ? { ...flow, note: event.target.value } : flow)} placeholder="Write a reflection before finishing this goal…" /><div><button type="button" onClick={() => setCompletionFlow(null)}>Cancel</button><button type="submit">Continue</button></div></form></div>}
      {completionFlow && completionFlow.step === 'confirm' && (
        <div className="modal-backdrop" role="presentation">
          <form className="completion-modal confirm-modal" onSubmit={event => { event.preventDefault(); completeGoal() }}>
            <p className="eyebrow" style={{ color: '#c9f36a' }}>CONFIRMATION</p>
            <h2 style={{ fontSize: '24px', marginBottom: '16px', fontWeight: '500', letterSpacing: '-.035em' }}>Ready to mark this goal as complete?</h2>
            
            <div className="confirm-summary-simple" style={{ display: 'block', width: '100%', boxSizing: 'border-box', background: '#171916', border: '1px solid #32352f', padding: '20px 24px', borderRadius: '6px', marginBottom: '24px', textAlign: 'center', wordBreak: 'break-word', maxHeight: '320px', overflowY: 'auto' }}>
              <span style={{ display: 'block', color: '#8e9189', fontFamily: '"DM Mono", monospace', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: '6px' }}>Goal</span>
              <strong style={{ display: 'block', color: '#eef0e9', fontSize: '20px', fontWeight: '500', letterSpacing: '-.025em', marginBottom: '20px', lineHeight: '1.4' }}>{completionFlow.goal.title}</strong>
              <span style={{ display: 'block', color: '#8e9189', fontFamily: '"DM Mono", monospace', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: '6px' }}>Reflection</span>
              <p style={{ margin: 0, color: '#c9f36a', fontSize: '24px', fontFamily: '"Instrument Serif", serif', fontStyle: 'italic', lineHeight: '1.35', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>“{completionFlow.note}”</p>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
              <button type="button" onClick={() => setCompletionFlow(null)} style={{ border: '0', background: 'none', color: '#8e9189', padding: '0', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
              <button type="button" onClick={() => setCompletionFlow(curr => curr ? { ...curr, step: 'note' } : null)}>Back</button>
              <button type="submit">Complete & Share it</button>
            </div>
          </form>
        </div>
      )}
      {selectedGoalDetails && (
        <div className="modal-backdrop" role="presentation" onClick={() => setSelectedGoalDetails(null)}>
          <div className="completion-modal confirm-modal" onClick={event => event.stopPropagation()}>
            <p className="eyebrow" style={{ color: '#c9f36a' }}>COMPLETED GOAL DETAILS</p>
            <h2 style={{ fontSize: '24px', marginBottom: '16px', fontWeight: '500', letterSpacing: '-.035em' }}>Goal Progress & Reflection</h2>
            
            <div className="confirm-summary-simple" style={{ display: 'block', width: '100%', boxSizing: 'border-box', background: '#171916', border: '1px solid #32352f', padding: '20px 24px', borderRadius: '6px', marginBottom: '24px', textAlign: 'center', wordBreak: 'break-word', maxHeight: '320px', overflowY: 'auto' }}>
              <span style={{ display: 'block', color: '#8e9189', fontFamily: '"DM Mono", monospace', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: '6px' }}>Goal</span>
              <strong style={{ display: 'block', color: '#eef0e9', fontSize: '20px', fontWeight: '500', letterSpacing: '-.025em', marginBottom: '20px', lineHeight: '1.4' }}>{selectedGoalDetails.title}</strong>
              <span style={{ display: 'block', color: '#8e9189', fontFamily: '"DM Mono", monospace', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: '6px' }}>Reflection / Note</span>
              <p style={{ margin: 0, color: '#c9f36a', fontSize: '24px', fontFamily: '"Instrument Serif", serif', fontStyle: 'italic', lineHeight: '1.35', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                “{selectedGoalDetails.completion_note || 'No reflection note was written.'}”
              </p>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <button className="add-button" type="button" onClick={() => setSelectedGoalDetails(null)} style={{ minWidth: '120px' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </section>
  </main>
}

createRoot(document.getElementById('root')).render(<App />)
