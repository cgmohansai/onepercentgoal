import confetti from 'canvas-confetti'

/**
 * Trigger celebratory side cannons confetti animation
 * Runs for 3 seconds from left and right screen edges
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

export default triggerSideCannons
