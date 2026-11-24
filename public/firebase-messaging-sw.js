/* Firebase Cloud Messaging service worker for Coin Sniper */
self.addEventListener('notificationclick', event => {
  event.stopImmediatePropagation()
  event.notification.close()
  const d = event.notification.data || {}
  const url = new URL('/', self.location.origin)
  if (d.symbol && d.timeframe) {
    for (const k of ['symbol','timeframe','side','scannerName','time','dailyChangePct','hourlyChangePct']) if (d[k] != null) url.searchParams.set(k,d[k])
    url.searchParams.set('signal','1')
  }
  event.waitUntil((async () => {
    const windows = await clients.matchAll({type:'window',includeUncontrolled:true})
    const existing = windows.find(w => new URL(w.url).origin === url.origin)
    if (existing) { await existing.navigate(url.href); await existing.focus() }
    else await clients.openWindow(url.href)
  })())
})

importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: 'AIzaSyAZahY8Ci0yGHHZcf5TLTakNod16Hihbqo',
  authDomain: 'signal-engines.firebaseapp.com',
  projectId: 'signal-engines',
  storageBucket: 'signal-engines.firebasestorage.app',
  messagingSenderId: '998907341980',
  appId: '1:998907341980:web:84aea5bfe2f6238e049159',
})

const messaging = firebase.messaging()
messaging.onBackgroundMessage(payload => {
  const title = payload.notification?.title || payload.data?.title || 'Coin Sniper Alert'
  const options = {
    body: payload.notification?.body || payload.data?.body || 'A new scanner signal is available.',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: { ...payload.data },
    tag: [payload.data?.symbol, payload.data?.timeframe, payload.data?.side, payload.data?.scannerName].filter(Boolean).join('-') || 'coin-sniper-alert',
    renotify: true,
  }
  self.registration.showNotification(title, options)
})

