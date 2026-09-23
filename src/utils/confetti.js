import confetti from 'canvas-confetti'

export function prefersReducedMotion() {
  try {
    return typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/**
 * Trigger celebratory side cannons confetti animation
 * Runs for 3 seconds from left and right screen edges.
 * Kept for legacy use; goal completion no longer fires confetti (FR-18).
 */
export function triggerSideCannons() {
  const end = Date.now() + 3 * 1000 // 3 seconds
  const colors = [
    '#c9f36a', // Lime accent
    '#ff3838', // Vibrant Red
    '#ff9f43', // Bright Orange
    '#feca57', // Golden Yellow
    '#1dd1a1', // Mint Emerald
    '#00d2d3', // Cyan
    '#2e86de', // Bright Blue
    '#a55eea', // Royal Purple
    '#ff6b81', // Hot Pink
    '#fd79a8', // Rose
    '#0984e3', // Electric Blue
    '#e056fd', // Neon Violet
  ]

  const frame = () => {
    if (Date.now() > end) return
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 60,
      startVelocity: 60,
      origin: { x: 0, y: 0.5 },
      colors: colors,
      zIndex: 999999,
    })
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 60,
      startVelocity: 60,
      origin: { x: 1, y: 0.5 },
      colors: colors,
      zIndex: 999999,
    })
    requestAnimationFrame(frame)
  }
  frame()
}

/**
 * Small, brief upward pop for rote completion only (FR-18).
 * Fires from the completed routine's own position. Never fired for
 * Pass/postpone. No-op when reduced motion is preferred.
 */
export function triggerRotePop(origin = { x: 0.5, y: 0.75 }) {
  if (prefersReducedMotion()) return
  try {
    confetti({
      particleCount: 28,
      spread: 55,
      startVelocity: 32,
      ticks: 120,
      gravity: 1.1,
      scalar: 0.85,
      origin,
      colors: ['#c9f36a', '#f6f5f1', '#8fd14f'],
      zIndex: 999999,
      disableForReducedMotion: true,
    })
  } catch {}
}

export default triggerSideCannons
