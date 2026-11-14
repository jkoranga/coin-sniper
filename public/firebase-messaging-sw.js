/* Firebase Cloud Messaging service worker for Coin Sniper */
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js')

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
    data: { url: payload.data?.url || 'https://coin-sniper.vercel.app/' },
    tag: [payload.data?.symbol, payload.data?.timeframe, payload.data?.side].filter(Boolean).join('-'),
  }
  self.registration.showNotification(title, options)
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url || 'https://coin-sniper.vercel.app/'
  event.waitUntil(clients.openWindow(url))
})
