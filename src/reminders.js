import { registerPlugin } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { getYearData } from './utils/dateUtils'

export const isNativeApp = () => Boolean(
  window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()
)

export const NativeAlarmPlugin = registerPlugin('NativeAlarmPlugin')

export const GOAL_REMINDER_ID = 1001
export const ROTE_REMINDER_ID = 1002
export const REMINDER_CHANNEL_ID = 'opg_reminders_channel'

export function calculateSprintTimeLeft(hour, minute, sprintEndInput) {
  let endDate = null
  if (sprintEndInput) {
    endDate = new Date(sprintEndInput)
  }
  if (!endDate || isNaN(endDate.getTime())) {
    try {
      const stored = localStorage.getItem('opg.sprint.current')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed?.sprint_end) endDate = new Date(parsed.sprint_end)
      }
    } catch {}
  }
  // The cached sprint end goes stale after rollover (sprints last ~3.6 days).
  // Recompute the live boundary offline instead of reporting 0h 0m.
  if (!endDate || isNaN(endDate.getTime()) || endDate.getTime() <= Date.now()) {
    try {
      const yearData = getYearData()
      const liveEnd = yearData.checkpointEnd || (yearData.sprint_end ? new Date(yearData.sprint_end) : null)
      if (liveEnd && !isNaN(liveEnd.getTime()) && liveEnd.getTime() > Date.now()) {
        endDate = liveEnd
      }
    } catch {}
  }
  if (!endDate || isNaN(endDate.getTime())) {
    const yearData = getYearData()
    endDate = yearData.checkpointEnd || new Date(yearData.sprint_end)
  }

  const now = new Date()
  const triggerTime = new Date(now)
  triggerTime.setHours(hour, minute, 0, 0)
  if (triggerTime.getTime() <= now.getTime()) {
    triggerTime.setDate(triggerTime.getDate() + 1)
  }

  const diffMs = endDate.getTime() - triggerTime.getTime()
  if (diffMs > 0) {
    const totalMins = Math.floor(diffMs / (60 * 1000))
    const h = Math.floor(totalMins / 60)
    const m = totalMins % 60
    return `${h}h ${m}m`
  }

  const directDiffMs = endDate.getTime() - now.getTime()
  if (directDiffMs > 0) {
    const totalMins = Math.floor(directDiffMs / (60 * 1000))
    const h = Math.floor(totalMins / 60)
    const m = totalMins % 60
    return `${h}h ${m}m`
  }

  return '0h 0m'
}

export function calculateTodayTimeLeft(hour, minute) {
  const totalMinsToday = Math.max(0, (24 * 60) - (hour * 60 + minute))
  const roteHours = Math.floor(totalMinsToday / 60)
  const roteMins = totalMinsToday % 60
  return `${roteHours}h ${roteMins}m`
}

export function getReminders(hour = 21, minute = 0, sprintEndInput = null) {
  const sprintLeftStr = calculateSprintTimeLeft(hour, minute, sprintEndInput)
  const todayLeftStr = calculateTodayTimeLeft(hour, minute)

  return [
    {
      id: GOAL_REMINDER_ID,
      title: `Only ${sprintLeftStr} left!`,
      body: 'Go smash those goals before the sprint ends. 💪',
      largeBody: 'Go smash those goals before the sprint ends. 💪',
      channelId: REMINDER_CHANNEL_ID,
      smallIcon: 'ic_stat_icon',
      iconColor: '#C9F36A'
    },
    {
      id: ROTE_REMINDER_ID,
      title: `Yo, ${todayLeftStr} left today! ⏳`,
      body: "Your rotes aren't gonna complete themselves. Get moving, buddy! 🔥",
      largeBody: "Your rotes aren't gonna complete themselves. Get moving, buddy! 🔥",
      channelId: REMINDER_CHANNEL_ID,
      smallIcon: 'ic_stat_icon',
      iconColor: '#C9F36A'
    }
  ]
}

export async function ensureNotificationChannel() {
  if (!isNativeApp()) return
  try {
    await LocalNotifications.createChannel({
      id: REMINDER_CHANNEL_ID,
      name: 'Daily Sprint & Rote Reminders',
      description: 'Daily alerts for your sprint goals and daily rotes',
      importance: 4, // 4 = android.app.NotificationManager.IMPORTANCE_HIGH (heads-up banner with sound & vibrate)
      visibility: 1, // NotificationCompat.VISIBILITY_PUBLIC
      vibration: true,
      lights: true,
      lightColor: '#C9F36A'
    })
  } catch (err) {
    console.warn('Failed to ensure notification channel:', err)
  }
}

export async function checkNotificationPermission() {
  try {
    const perm = await LocalNotifications.checkPermissions()
    return perm.display === 'granted'
  } catch {
    return false
  }
}

export async function requestNotificationPermission() {
  const perm = await LocalNotifications.requestPermissions()
  return perm.display === 'granted'
}

export async function areExactAlarmsAllowed() {
  return true
}

export async function requestExactAlarmAccess() {}

export async function isBatteryOptimizationIgnored() {
  if (!isNativeApp()) return true
  try {
    const res = await NativeAlarmPlugin.isBatteryOptimizationIgnored()
    return Boolean(res?.ignored)
  } catch {
    return true
  }
}

export async function requestBatteryOptimization() {
  if (!isNativeApp()) return false
  try {
    const res = await NativeAlarmPlugin.requestBatteryOptimization()
    return Boolean(res?.requested)
  } catch {
    return false
  }
}

export function isScheduledForToday(hour, minute) {
  const now = new Date()
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0)
  return target.getTime() > now.getTime()
}

export function getTargetDates(hour, minute) {
  const now = new Date()
  let targetGoal = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0)
  if (targetGoal.getTime() <= now.getTime()) {
    targetGoal.setDate(targetGoal.getDate() + 1)
  }
  const targetRote = new Date(targetGoal.getTime() + 10000)
  return { targetGoal, targetRote }
}

export async function scheduleDailyReminders(hour, minute, sprintEndInput = null, sprintStartInput = null) {
  await ensureNotificationChannel()

  let sprintEndMs = 0
  let sprintStartMs = 0
  let endDate = null
  if (sprintEndInput) endDate = new Date(sprintEndInput)
  if (!endDate || isNaN(endDate.getTime())) {
    try {
      const stored = localStorage.getItem('opg.sprint.current')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed?.sprint_end) endDate = new Date(parsed.sprint_end)
      }
    } catch {}
  }
  if (!endDate || isNaN(endDate.getTime())) {
    const yearData = getYearData()
    endDate = yearData.checkpointEnd || new Date(yearData.sprint_end)
  }
  if (endDate && !isNaN(endDate.getTime())) {
    sprintEndMs = endDate.getTime()
  }
  // Sprint start lets the native alarm roll the boundary forward on fire day,
  // so the countdown never sticks at 0h 0m after a sprint rolls over.
  let startDate = null
  if (sprintStartInput) startDate = new Date(sprintStartInput)
  if ((!startDate || isNaN(startDate.getTime())) && endDate && !isNaN(endDate.getTime())) {
    try {
      const stored = localStorage.getItem('opg.sprint.current')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed?.sprint_start) startDate = new Date(parsed.sprint_start)
      }
    } catch {}
  }
  if ((!startDate || isNaN(startDate.getTime())) && endDate && !isNaN(endDate.getTime())) {
    try {
      const yearData = getYearData()
      const liveStart = yearData.sprintStart || (yearData.sprint_start ? new Date(yearData.sprint_start) : null)
      if (liveStart && !isNaN(liveStart.getTime())) startDate = liveStart
    } catch {}
  }
  if (startDate && !isNaN(startDate.getTime())) {
    sprintStartMs = startDate.getTime()
  }

  // Clear any legacy delivered notifications and pending alarms
  try {
    await LocalNotifications.removeAllDeliveredNotifications()
  } catch {}
  try {
    await LocalNotifications.cancel({
      notifications: [
        { id: GOAL_REMINDER_ID },
        { id: ROTE_REMINDER_ID },
        { id: 2001 },
        { id: 2002 }
      ]
    })
  } catch {}

  // Industry-grade native scheduling via AlarmManager.setAlarmClock:
  // Wakes the CPU at the exact second even on Xiaomi (MIUI/HyperOS) and Oppo (ColorOS)
  if (isNativeApp()) {
    try {
      await NativeAlarmPlugin.scheduleDailyReminders({
        hour,
        minute,
        sprintEndMs,
        sprintStartMs
      })
      return 2
    } catch (e) {
      console.warn('NativeAlarmPlugin scheduling fallback:', e)
    }
  }

  return 2
}

export async function cancelDailyReminders() {
  try {
    await LocalNotifications.removeAllDeliveredNotifications()
  } catch {}
  try {
    await LocalNotifications.cancel({
      notifications: [
        { id: GOAL_REMINDER_ID },
        { id: ROTE_REMINDER_ID },
        { id: 2001 },
        { id: 2002 }
      ]
    })
  } catch {}

  if (isNativeApp()) {
    try {
      await NativeAlarmPlugin.cancelDailyReminders()
    } catch (e) {
      console.warn('NativeAlarmPlugin cancel error:', e)
    }
  }
}
