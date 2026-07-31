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

export async function requestNotificationPermission() {
  const perm = await LocalNotifications.requestPermissions()
  return Boolean(perm.display)
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
}

export async function cancelDailyReminders() {
  await LocalNotifications.cancel({ notifications: REMINDERS.map(r => ({ id: r.id })) })
}
