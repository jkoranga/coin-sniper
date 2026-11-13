// Sync only the active scanner configuration to the background Worker.
// Firebase ID token is used for authentication; Telegram credentials never leave Cloudflare Secrets.
const WORKER_URL = 'https://coin-sniper-scanner.jagdishkoranga.workers.dev'

const DELTA_TFS = ['1m','3m','5m','15m','30m','1h','4h','1d']

export async function syncBackgroundScanner(firebaseUser, settings) {
  if (!firebaseUser) return false
  try {
    const idToken = await firebaseUser.getIdToken()
    const patterns = (settings.customPatterns || []).map(pattern => ({
      ...pattern,
      conditions: (pattern.conditions || []).filter(condition => condition.enabled),
    }))
    const payload = {
      enabled: Boolean(settings.tgOn),
      patterns,
      timeframes: DELTA_TFS.filter(tf =>
        patterns.some(pattern => pattern.enabled && Array.isArray(pattern.tfs) &&
          pattern.tfs.includes(tf) && pattern.conditions.length > 0)
      ),
      scanModeByTf: Object.fromEntries(DELTA_TFS.map(tf => [
        tf, settings[`delta_scanMode_${tf}`] ?? settings.scanMode ?? 'all',
      ])),
      customPairs: Array.isArray(settings.customPairs) ? settings.customPairs : [],
      volumeFilter: settings.volumeFilter || 'all',
      dedupMs: 15 * 60 * 1000,
      updatedAt: Date.now(),
    }

    const response = await fetch(`${WORKER_URL}/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
    })
    return response.ok
  } catch (error) {
    console.warn('[CoinSniper] Background scanner sync failed:', error?.message || error)
    return false
  }
}
