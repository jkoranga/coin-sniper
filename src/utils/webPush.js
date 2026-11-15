import { getApp } from 'firebase/app'
import { getMessaging, getToken, onMessage } from 'firebase/messaging'

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

export async function listenForForegroundMessages() {
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return () => {}

  const messaging = getMessaging(getApp())
  const unsubscribe = onMessage(messaging, async payload => {
    if (Notification.permission !== 'granted') return

    const title = payload.notification?.title || payload.data?.title || 'Coin Sniper Alert'
    const body = payload.notification?.body || payload.data?.body || 'A new scanner signal is available.'
    const options = {
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      data: { url: payload.data?.url || 'https://coin-sniper.vercel.app/' },
      tag: [payload.data?.symbol, payload.data?.timeframe, payload.data?.side].filter(Boolean).join('-') || 'coin-sniper-alert',
    }

    try {
      const registration = await navigator.serviceWorker.getRegistration()
        || await navigator.serviceWorker.register('/firebase-messaging-sw.js')
      await registration.showNotification(title, options)
    } catch (error) {
      console.warn('[CoinSniper] Could not show foreground push notification:', error?.message || error)
    }
  })

  return unsubscribe
}
