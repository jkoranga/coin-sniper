import { getApp } from 'firebase/app'
import { getMessaging, getToken } from 'firebase/messaging'

const VAPID_PUBLIC_KEY = 'BOFx8esZCZ5pxJXzZjsnaARvY43sCM8xK-yYQst0LjDeEAKQhCc25FbUvmjWyxhr0l7RycnTW0v247tI_U_hvHw'

export async function registerWebPush() {
  if (!('serviceWorker' in navigator) || !('Notification' in window)) {
    throw new Error('This browser does not support Web Push.')
  }
  if (Notification.permission !== 'granted') {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') throw new Error('Notification permission was not granted.')
  }
  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
  await navigator.serviceWorker.ready
  const messaging = getMessaging(getApp())
  const token = await getToken(messaging, {
    vapidKey: VAPID_PUBLIC_KEY,
    serviceWorkerRegistration: registration,
  })
  if (!token) throw new Error('Could not create a push registration token.')
  return token
}

export async function sendWebPushTest() {
  const { getAuth } = await import('firebase/auth')
  const user = getAuth(getApp()).currentUser
  if (!user) throw new Error('Please sign in first.')
  const workerUrl = (import.meta.env.VITE_SCANNER_WORKER_URL || '').replace(/\/$/, '')
  if (!workerUrl) throw new Error('Test Worker URL is not configured in this Preview.')
  const idToken = await user.getIdToken()
  const response = await fetch(workerUrl + '/test-push', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + idToken },
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || !result.ok) throw new Error(result.error || 'Test push failed.')
  return result
}
