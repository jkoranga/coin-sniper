// Send each signed-in user's own scanner settings to the shared Cloudflare Worker.
// Telegram credentials travel only over HTTPS and are encrypted by the Worker before KV storage.
const WORKER_URL = 'https://coin-sniper-scanner.jagdishkoranga.workers.dev'

const DELTA_TFS = ['1m','3m','5m','15m','30m','1h','4h','1d']

export async function syncBackgroundScanner(firebaseUser, settings) {
  if (!firebaseUser) return false
  try {
    const idToken = await firebaseUser.getIdToken()
    const patterns = (settings.customPatterns || [])
      .filter(pattern => pattern.enabled === true)
      .map(pattern => ({
        ...pattern,
        conditions: (pattern.conditions || []).filter(condition => condition.enabled === true),
      }))
    const payload = {
      enabled: Boolean(settings.tgOn && settings.tgToken && settings.tgChatId),
      tgToken: settings.tgToken || '',
      tgChatId: settings.tgChatId || '',
      patterns,
      timeframes: DELTA_TFS.filter(tf =>
        patterns.some(pattern => Array.isArray(pattern.tfs) && pattern.tfs.includes(tf) && pattern.conditions.length > 0)
      ),
      scanModeByTf: Object.fromEntries(DELTA_TFS.map(tf => [
        tf, settings[\`delta_scanMode_${tf}\`] ?? settings.scanMode ?? 'all',
      ])),
      customPairs: Array.isArray(settings.customPairs) ? settings.customPairs : [],
      volumeFilter: settings.volumeFilter || 'all',
      updatedAt: Date.now(),
    }

    const response = await fetch(\`${WORKER_URL}/sync\`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: \`Bearer ${idToken}\`,
      },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      console.warn('[CoinSniper] Background scanner sync rejected:', response.status)
      return false
    }
    return true
  } catch (error) {
    console.warn('[CoinSniper] Background scanner sync failed:', error?.message || error)
    return false
  }
}
