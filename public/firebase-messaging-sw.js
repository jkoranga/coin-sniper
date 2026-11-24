/* Firebase Cloud Messaging service worker for Coin Sniper */
self.addEventListener('notificationclick', event => {
  event.stopImmediatePropagation()
  event.notification.close()
  const d = event.notification.data || {}
  const tf = {'1m':'1','3m':'3','5m':'5','15m':'15','30m':'30','1h':'60','4h':'240','1d':'D'}[d.timeframe] || '15'
  const symbol = String(d.symbol || '').toUpperCase()
  const url = symbol && symbol !== 'WEBPUSH' ? 'https://www.tradingview.com/chart/?symbol=BYBIT:'+encodeURIComponent(symbol.replace(/USDT$/,'')+'USDT.P')+'&interval='+tf : self.location.origin
  event.waitUntil(clients.openWindow(url))
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
    timestamp: Number(payload.data?.time) || Date.now(),
    actions: [{action:'chart',title:'Open TradingView'}],
  }
  self.registration.showNotification(title, options)
})

