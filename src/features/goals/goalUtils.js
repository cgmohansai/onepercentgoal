/**
 * Goal utilities, normalization, and card rendering for OnePercentGoal (OPG).
 */

import { Media } from '@capacitor-community/media'

/**
 * Normalizes a goal object from the API or local state into standard UI presentation format.
 * Ensures properties like 'done', 'value', 'kind', and 'label' are properly derived.
 *
 * @param {object} goal - Raw goal object
 * @returns {object} Normalized goal
 */
export function presentGoal(goal) {
  if (!goal) return goal
  const percent =
    goal.progress_percent ??
    (goal.target ? Math.round((goal.progress / goal.target) * 100) : 0)
  return {
    ...goal,
    done: Boolean(goal.completed),
    kind: 'bar',
    value: percent,
    max: 100,
    label: `${percent}% progress`,
  }
}

/**
 * Creates an optimistic goal object for instant UI updates before server confirmation.
 *
 * @param {string} title - Goal title
 * @param {object} [overrides={}] - Optional property overrides
 * @returns {object} Optimistic goal with a temporary ID
 */
export function createOptimisticGoal(title, overrides = {}) {
  const tempId = 'temp-goal-' + Date.now()
  return presentGoal({
    id: tempId,
    title: title?.trim() || '',
    description: '',
    progress_percent: 0,
    completed: false,
    created_at: new Date().toISOString(),
    ...overrides,
  })
}

/**
 * Merges server goals with any client-side optimistic goals that are still in flight.
 *
 * @param {Array} currentGoals - Current goal state
 * @param {Array} serverGoals - Fresh goals received from the server
 * @returns {Array} Merged goal list
 */
export function mergeGoals(currentGoals = [], serverGoals = []) {
  const pendingTemps = currentGoals.filter(g => String(g.id).startsWith('temp-'))
  const merged = [...serverGoals]
  for (const tg of pendingTemps) {
    if (!merged.some(m => m.id === tg.id || m.title === tg.title)) {
      merged.push(tg)
    }
  }
  return merged
}

/**
 * Returns fallback starter goals for offline or initial showcase state.
 * @returns {Array}
 */
export function getFallbackGoals() {
  return [
    presentGoal({
      id: 1,
      title: 'Finish Palm Vein Recognition',
      description: 'Research project',
      progress_percent: 0,
      completed: false,
    }),
    presentGoal({
      id: 2,
      title: 'Read deeply',
      progress_percent: 60,
      completed: false,
    }),
    presentGoal({
      id: 3,
      title: 'LeetCode practice',
      progress_percent: 70,
      completed: false,
    }),
  ]
}

/**
 * Sanitizes a goal title for use in exported filenames.
 *
 * @param {string} value
 * @returns {string}
 */
export function sanitizeFilename(value) {
  return (
    String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'goal'
  )
}

/**
 * Helper to wrap text into lines fitting a canvas context's maxWidth.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} maxWidth
 * @returns {string[]}
 */
export function wrapText(ctx, text, maxWidth) {
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

/**
 * Generates a visual completion card for a finished goal as a PNG data URL.
 *
 * @param {object} goal - Completed goal
 * @param {string} note - User reflection note
 * @returns {Promise<string>} PNG Data URL
 */
export async function createCompletionCard(goal, note) {
  if (typeof document === 'undefined') {
    throw new Error('Canvas rendering is only supported in browser environments')
  }
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 2000
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')

  const titleFontSize =
    goal.title.length > 48 ? 58 : goal.title.length > 30 ? 66 : 74
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

  const canvasHeight = footerDoneY + 120
  canvas.height = canvasHeight

  const accent = '#c9f36a'
  const panel = '#1b1d1a'
  const text = '#f5f5ef'
  const muted = '#a4a89b'
  const now = new Date()
  const displayDate = `${now.toLocaleString('en-US', {
    month: 'short',
  })} ${now.getDate()}, ${now.getFullYear()}, ${String(now.getHours()).padStart(
    2,
    '0'
  )}:${String(now.getMinutes()).padStart(2, '0')}`

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

  // Inner panel card
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

/**
 * Downloads a data URL image to the user's filesystem in a browser environment.
 *
 * @param {string} dataUrl
 * @param {string} filename
 */
export function downloadImage(dataUrl, filename) {
  if (typeof document === 'undefined') return
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
}

/**
 * Saves a data URL image to the native photo album via Capacitor Media plugin.
 *
 * @param {string} dataUrl
 * @param {string} filename
 * @returns {Promise<boolean>}
 */
export async function saveImageToGallery(dataUrl, filename) {
  let albumsRes
  try {
    albumsRes = await Media.getAlbums()
  } catch {
    albumsRes = { albums: [] }
  }
  let album = (albumsRes.albums || []).find(a => a.name === 'OnePercentGoal')
  if (!album) {
    try {
      await Media.createAlbum({ name: 'OnePercentGoal' })
    } catch {}
    try {
      const res = await Media.getAlbums()
      album = (res.albums || []).find(a => a.name === 'OnePercentGoal')
    } catch {
      album = null
    }
  }
  if (!album) return false
  await Media.savePhoto({
    path: dataUrl,
    albumIdentifier: album.identifier,
    fileName: filename.replace(/\.png$/, ''),
  })
  return true
}
