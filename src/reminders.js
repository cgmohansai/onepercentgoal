import { LocalNotifications } from '@capacitor/local-notifications'

export const isNativeApp = () => Boolean(
  window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()
)

export const GOAL_REMINDER_ID = 1001
export const ROTE_REMINDER_ID = 1002
export const REMINDER_CHANNEL_ID = 'opg_reminders_channel'

const REMINDERS = [
  {
    id: GOAL_REMINDER_ID,
    title: 'Focus on Your Goals',
    body: 'These are your sprint goals. Stay locked in and make every 1% count.',
    channelId: REMINDER_CHANNEL_ID,
    smallIcon: 'ic_stat_icon',
    iconColor: '#C9F36A'
  },
  {
    id: ROTE_REMINDER_ID,
    title: 'Complete Your Rotes',
    body: 'Your daily routine tasks are still pending. Complete them before today ends.',
    channelId: REMINDER_CHANNEL_ID,
    smallIcon: 'ic_stat_icon',
    iconColor: '#C9F36A'
  }
]

export async function ensureNotificationChannel() {
  if (!isNativeApp()) return
  try {
    await LocalNotifications.createChannel({
      id: REMINDER_CHANNEL_ID,
      name: 'Daily Sprint & Rote Reminders',
      description: 'Daily alerts for your sprint goals and daily rotes',
      importance: 5, // NotificationManager.IMPORTANCE_HIGH (5 = MAX/heads-up banner with sound & vibrate)
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
  try {
    const res = await LocalNotifications.checkExactNotificationSetting()
    return res.exact_alarm === 'granted'
  } catch {
    return true
  }
}

export async function requestExactAlarmAccess() {
  try {
    await LocalNotifications.changeExactNotificationSetting()
  } catch {}
}

export function isScheduledForToday(hour, minute) {
  const now = new Date()
  const target = new Date()
  target.setHours(hour, minute, 0, 0)
  return target.getTime() > now.getTime()
}

export async function scheduleDailyReminders(hour, minute) {
  await ensureNotificationChannel()

  // 1. Remove any previously delivered notifications from the notification shade.
  // This is vital: if a notification already triggered earlier today, leaving it
  // in the drawer causes Android to suppress sound/vibrate on new triggers due to setOnlyAlertOnce.
  try {
    await LocalNotifications.removeAllDeliveredNotifications()
  } catch {}

  // 2. Cancel any pending alarms for these reminder IDs
  await LocalNotifications.cancel({ notifications: REMINDERS.map(r => ({ id: r.id })) })

  // 3. Schedule daily recurring notifications with explicit second: 0
  // Setting second: 0 prevents Capacitor from inheriting whatever current second the clock is on.
  await LocalNotifications.schedule({
    notifications: REMINDERS.map((r, index) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      channelId: REMINDER_CHANNEL_ID,
      smallIcon: 'ic_stat_icon',
      iconColor: '#C9F36A',
      schedule: {
        // Offset the second slightly (0s and 2s) so the two notifications
        // do not collide on the exact same millisecond in the notification drawer
        on: { hour, minute, second: index * 2 },
        repeats: true,
        allowWhileIdle: true
      }
    }))
  })

  const pending = await LocalNotifications.getPending()
  return pending.notifications.length
}

export async function cancelDailyReminders() {
  try {
    await LocalNotifications.removeAllDeliveredNotifications()
  } catch {}
  await LocalNotifications.cancel({ notifications: REMINDERS.map(r => ({ id: r.id })) })
}

