import { validateConditionConfig } from './patternEngine.js'

// Describe the exact LEFT-TO-RIGHT grouping used by compilePattern.
// No settings are changed here: the guide is read-only and safe for old patterns.
export function inspectPatternLogic(pattern) {
  const all = Array.isArray(pattern?.conditions) ? pattern.conditions : []
  const active = all.map((c, i) => ({ ...c, conditionNumber: i + 1 })).filter(c => c.enabled)
  const errors = []
  const warnings = []
  const valid = active.filter(c => validateConditionConfig(c).valid).length
  if (!active.length) errors.push('No enabled conditions. Turn ON at least one condition.')
  if (!Array.isArray(pattern?.tfs) || !pattern.tfs.length) {
    errors.push('Select at least one timeframe to scan.')
  }
  for (const cond of active) {
    const check = validateConditionConfig(cond)
    if (!check.valid) errors.push(`C${cond.conditionNumber}: ${check.reason}`)
    if (cond.mirrorReviewReason) errors.push(`C${cond.conditionNumber}: Mirror requires review before use.`)
    if (!cond.histCompare && !cond.rangeCheck && cond.rhsMode === 'field' &&
        cond.lhsField === cond.rhsField && (cond.lhsOffset ?? 0) === (cond.rhsOffset ?? 0)) {
      warnings.push(`C${cond.conditionNumber}: Both sides use the same indicator and candle. This comparison cannot detect a crossover.`)
    }
    if (!cond.histCompare && !cond.rangeCheck && cond.rhsMode === 'pctdiff' &&
        cond.lhsField === cond.rhsField && (cond.lhsOffset ?? 0) === (cond.rhsOffset ?? 0)) {
      warnings.push(`C${cond.conditionNumber}: Comparing an indicator with itself gives 0% gap on the same candle.`)
    }
    if (cond.histCompare && (cond.histCurrentFrom ?? 1) === 0) {
      // One notice for all candles using the still-running current bar.
      if (!warnings.some(w => w.includes('running candle 0'))) {
        warnings.push('Historical comparison uses running candle 0; signal can change before the candle closes.')
      }
    }
  }
  if (valid !== active.length) warnings.push('Incomplete active conditions will not produce valid scanner signals.')
  const sections = []
  let i = 0
  while (i < active.length) {
    const groupId = active[i].groupId
    const members = []
    if (groupId) {
      while (i < active.length && active[i].groupId === groupId) members.push(active[i++])
    } else members.push(active[i++])
    sections.push({ members, groupId, joinAfter: members.at(-1)?.joinNext === 'OR' ? 'OR' : 'AND' })
  }
  const fold = (members) => members.reduce((acc, c, j) => {
    const label = `C${c.conditionNumber}`
    return j === 0 ? label : `(${acc} ${members[j - 1].joinNext === 'OR' ? 'OR' : 'AND'} ${label})`
  }, '')
  const chunks = sections.map(section => ({
    expression: section.groupId && section.members.length > 1
      ? `(${fold(section.members)})`
      : fold(section.members),
    members: section.members.map(c => c.conditionNumber),
    group: !!section.groupId,
    joinAfter: section.joinAfter,
  }))
  const expression = chunks.reduce((acc, section, j) => (
    j === 0 ? section.expression :
      `(${acc} ${chunks[j - 1].joinAfter} ${section.expression})`
  ), '')
  const ungroupedOr = chunks.slice(0, -1).some(s => s.joinAfter === 'OR')
  if (ungroupedOr) warnings.push(
    'OR is used BETWEEN groups / standalone conditions. It can bypass earlier AND rules. If all other conditions must pass, use AND outside and OR only inside the intended group.'
  )
  const groupedOr = sections.some(section => section.groupId && section.members.slice(0, -1).some(c => c.joinNext === 'OR'))
  if (groupedOr && !ungroupedOr) {
    warnings.push('Grouped OR is correctly separated: the group needs an internal alternative, while its connection to other rules remains AND.')
  }
  return {
    expression: expression || 'No enabled conditions',
    active: active.length,
    ready: errors.length === 0,
    errors,
    warnings,
    groupedOr,
    ungroupedOr,
  }
}
