import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { acquireScannerSlot } from '../src/utils/scanCoordinator.js'

test('maximum two timeframes run concurrently; remaining timeframe runs after release', async () => {
  const releaseFirst = await acquireScannerSlot()
  const releaseSecond = await acquireScannerSlot()
  let thirdGranted = false
  const third = acquireScannerSlot().then(release => {
    thirdGranted = Boolean(release)
    return release
  })
  await Promise.resolve()
  assert.equal(thirdGranted, false)
  releaseFirst()
  const releaseThird = await third
  assert.equal(thirdGranted, true)
  releaseThird()
  releaseSecond()
})
test('queued abort does not block the next timeframe', async () => {
  const releaseFirst = await acquireScannerSlot()
  const releaseSecond = await acquireScannerSlot()
  const controller = new AbortController()
  const cancelled = acquireScannerSlot(controller.signal)
  const next = acquireScannerSlot()
  controller.abort()
  assert.equal(await cancelled, null)
  releaseFirst()
  const releaseNext = await next
  assert.equal(typeof releaseNext, 'function')
  releaseNext()
  releaseSecond()
})
test('duplicate release is harmless', async () => {
  const release = await acquireScannerSlot()
  release()
  release()
  const next = await acquireScannerSlot()
  assert.equal(typeof next, 'function')
  next()
})
test('auto scheduling does not depend on the visible timeframe tab', () => {
  const source = readFileSync(new URL('../src/components/DeltaScannerTab.jsx', import.meta.url), 'utf8')
  assert.match(source, /const autoRunEnabled = scanReady && readyToScan && \(autoEnabled \|\| loopMode\)/)
  assert.match(source, /Pattern changes affect scanning without resetting the Auto countdown/)
  assert.match(source, /acquireScannerSlot\(abortRef\.current\.signal\)/)
  assert.doesNotMatch(source, /if \(!isActive \|\| !readyToScan\) return/)
})
