/**
 * Timeline utilities and transformation helpers for OnePercentGoal (OPG).
 */

/**
 * Creates an empty timeline history container.
 *
 * @param {number} [year=new Date().getFullYear()] - Target year
 * @returns {{ year: number, years: Array<number>, sprints: Array<object> }}
 */
export function createEmptyTimeline(year = new Date().getFullYear()) {
  return {
    year: Number(year) || new Date().getFullYear(),
    years: [],
    sprints: [],
  }
}

/**
 * Normalizes timeline payload received from API or fallback state.
 *
 * @param {object|null} data - Raw timeline response
 * @param {number} [fallbackYear=new Date().getFullYear()] - Fallback year
 * @returns {{ year: number, years: Array<number>, start_sprint: number, end_sprint: number, sprints: Array<object> }}
 */
export function normalizeTimeline(data, fallbackYear = new Date().getFullYear()) {
  const year = Number(data?.year) || Number(fallbackYear) || new Date().getFullYear()
  return {
    year,
    years: Array.isArray(data?.years) ? data.years : [year],
    start_sprint: Number(data?.start_sprint) || 1,
    end_sprint: Number(data?.end_sprint) || 100,
    sprints: Array.isArray(data?.sprints) ? data.sprints : [],
  }
}

/**
 * Formats a single date into short month and day (e.g., 'Jan 1', 'Sep 17').
 *
 * @param {Date|string|number} dateObj
 * @returns {string} Formatted date string or empty string
 */
export function formatTimelineDate(dateObj) {
  if (!dateObj) return ''
  const d = new Date(dateObj)
  if (isNaN(d.getTime())) return ''
  const month = d.toLocaleString('en-US', { month: 'short' })
  const day = d.getDate()
  return `${month} ${day}`
}

/**
 * Formats a sprint date range (e.g., 'Sep 17 — Sep 20').
 *
 * @param {Date|string|number} start
 * @param {Date|string|number} end
 * @returns {string} Formatted range string
 */
export function formatSprintDateRange(start, end) {
  const startStr = formatTimelineDate(start)
  const endStr = formatTimelineDate(end)
  if (!startStr && !endStr) return ''
  if (!startStr) return endStr
  if (!endStr) return startStr
  return `${startStr} — ${endStr}`
}

/**
 * Determines the visual state class for a sprint tile ('past', 'current', or '').
 *
 * @param {number} sprintNumber - Sprint number
 * @param {number} selectedYear - Currently viewed year
 * @param {number} currentYear - Authoritative current sprint year
 * @param {number} currentSprint - Authoritative current sprint number
 * @returns {string} 'past' | 'current' | ''
 */
export function getSprintTileState(sprintNumber, selectedYear, currentYear, currentSprint) {
  const num = Number(sprintNumber)
  const sYear = Number(selectedYear)
  const cYear = Number(currentYear)
  const cSprint = Number(currentSprint)

  if (sYear < cYear) return 'past'
  if (sYear > cYear) return ''
  if (num < cSprint) return 'past'
  if (num === cSprint) return 'current'
  return ''
}

/**
 * Immutably updates or replaces a specific sprint inside a timeline history object.
 *
 * @param {object} timeline - Current timeline state
 * @param {number} sprintNumber - Sprint number to update
 * @param {object} detailedSprint - New sprint detail object
 * @returns {object} Updated timeline history object
 */
export function updateSprintInTimeline(timeline, sprintNumber, detailedSprint) {
  if (!timeline || !Array.isArray(timeline.sprints)) {
    return { ...(timeline || createEmptyTimeline()), sprints: [detailedSprint] }
  }
  const targetNum = Number(sprintNumber)
  const exists = timeline.sprints.some(s => Number(s.sprint_number) === targetNum)
  const updatedSprints = exists
    ? timeline.sprints.map(s => Number(s.sprint_number) === targetNum ? { ...s, ...detailedSprint } : s)
    : [...timeline.sprints, detailedSprint]

  return {
    ...timeline,
    sprints: updatedSprints,
  }
}

/**
 * Calculates aggregate performance statistics across a list of sprint summaries.
 *
 * @param {Array<object>} sprints - List of sprint summaries
 * @returns {{ total_sprints: number, completed_sprints: number, total_goals: number, completed_goals: number, average_progress: number }}
 */
export function calculateTimelineStats(sprints = []) {
  const safeSprints = Array.isArray(sprints) ? sprints : []
  let totalGoals = 0
  let completedGoals = 0
  let totalProgress = 0

  for (const s of safeSprints) {
    totalGoals += Number(s.goal_count || 0)
    completedGoals += Number(s.completed_count || 0)
    totalProgress += Number(s.average_progress || 0)
  }

  const avgProgress = safeSprints.length > 0 ? Math.round(totalProgress / safeSprints.length) : 0

  return {
    total_sprints: safeSprints.length,
    completed_sprints: safeSprints.filter(s => Number(s.completed_count) > 0).length,
    total_goals: totalGoals,
    completed_goals: completedGoals,
    average_progress: avgProgress,
  }
}

/**
 * Synchronizes the active sprint in timelineHistory with the current goals list immediately.
 *
 * @param {object} timeline - Current timeline state
 * @param {number} currentYear - Current active sprint year
 * @param {number} currentSprintNumber - Current active sprint number
 * @param {Array<object>} goalsList - Current active goals array
 * @returns {object} Updated timeline
 */
export function syncTimelineWithGoals(timeline, currentYear, currentSprintNumber, goalsList = []) {
  if (!timeline || Number(timeline.year) !== Number(currentYear)) {
    return timeline
  }
  const sNum = Number(currentSprintNumber)
  const total = goalsList.length
  const completed = goalsList.filter(g => Boolean(g.done || g.completed)).length
  const totalPercent = goalsList.reduce((sum, g) => sum + (Number(g.value ?? g.progress_percent ?? g.progress ?? 0)), 0)
  const average_progress = total ? Math.round(totalPercent / total) : 0

  const mappedGoals = goalsList.map(g => ({
    id: g.id,
    title: g.title,
    target: g.target || 100,
    progress: g.progress || 0,
    progress_percent: g.value ?? g.progress_percent ?? (g.target ? Math.round((g.progress / g.target) * 100) : 0),
    completed: Boolean(g.done || g.completed),
    completion_note: g.completion_note || null,
    created_at: g.created_at,
  }))

  const existingSprints = Array.isArray(timeline.sprints) ? timeline.sprints : []
  const found = existingSprints.some(s => Number(s.sprint_number) === sNum)

  const updatedSprints = found
    ? existingSprints.map(s => {
        if (Number(s.sprint_number) === sNum) {
          return {
            ...s,
            goal_count: total,
            completed_count: completed,
            average_progress,
            goals: mappedGoals,
          }
        }
        return s
      })
    : [
        ...existingSprints,
        {
          year: currentYear,
          sprint_number: sNum,
          goal_count: total,
          completed_count: completed,
          average_progress,
          goals: mappedGoals,
        }
      ]

  return {
    ...timeline,
    sprints: updatedSprints,
  }
}

