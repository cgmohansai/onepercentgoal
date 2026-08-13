import { LocalNotifications } from '@capacitor/local-notifications'

export const isNativeApp = () => Boolean(
  window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()
)

export const GOAL_REMINDER_ID = 1001
export const ROTE_REMINDER_ID = 1002

const REMINDERS = [
  {
    id: GOAL_REMINDER_ID,
    title: 'Focus on Your Goals',
    body: 'These are your sprint goals. Stay locked in and make every 1% count.'
  },
  {
    id: ROTE_REMINDER_ID,
    title: 'Complete Your Rotes',
    body: 'Your daily routine tasks are still pending. Complete them before today ends.'
  }
]

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

export async function scheduleDailyReminders(hour, minute) {
  await LocalNotifications.cancel({ notifications: REMINDERS.map(r => ({ id: r.id })) })
  await LocalNotifications.schedule({
    notifications: REMINDERS.map(r => ({
      id: r.id,
      title: r.title,
      body: r.body,
      schedule: { on: { hour, minute }, repeats: true, allowWhileIdle: true }
    }))
  })
  const pending = await LocalNotifications.getPending()
  return pending.notifications.length
}

export async function cancelDailyReminders() {
  await LocalNotifications.cancel({ notifications: REMINDERS.map(r => ({ id: r.id })) })
}
