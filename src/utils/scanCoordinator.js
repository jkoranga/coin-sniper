// Shared per-page scanner queue. Every mounted timeframe can remain armed while
// only a small number make market-data requests at once.
const MAX_PARALLEL_TIMEFRAMES = 2
let running = 0
const waiting = []

function drain() {
  while (running < MAX_PARALLEL_TIMEFRAMES && waiting.length) {
    const entry = waiting.shift()
    if (entry.signal?.aborted) {
      entry.signal?.removeEventListener('abort', entry.onAbort)
      entry.resolve(null)
      continue
    }
    entry.signal?.removeEventListener('abort', entry.onAbort)
    running += 1
    let released = false
    entry.resolve(() => {
      if (released) return
      released = true
      running = Math.max(0, running - 1)
      drain()
    })
  }
}

export function acquireScannerSlot(signal) {
  return new Promise(resolve => {
    if (signal?.aborted) { resolve(null); return }
    const entry = { signal, resolve, onAbort: null }
    entry.onAbort = () => {
      const i = waiting.indexOf(entry)
      if (i < 0) return // already granted; caller releases in finally
      waiting.splice(i, 1)
      signal?.removeEventListener('abort', entry.onAbort)
      resolve(null)
    }
    signal?.addEventListener('abort', entry.onAbort, { once: true })
    waiting.push(entry)
    drain()
  })
}
