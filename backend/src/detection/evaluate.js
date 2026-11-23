// Features 31-35, 38: turn one tick's confirmed statuses into a severity level and the
// reasons for it. Pure functions: no clock, no database, easy to test.

import { VITAL_KEYS, STATUS, vitalStatus, formatVital } from '../../../shared/vitals.js'
import { SEVERITY } from '../../../shared/emergency.js'
import { vitalDirection } from '../../../shared/detection.js'
import { RULES } from './rules.js'

export const STATUS_RANK = Object.freeze({ normal: 0, warning: 1, critical: 2 })
const RANK_STATUS = ['normal', 'warning', 'critical']

/** Raw status of every vital for one reading, as a rank (0/1/2). */
export function statusRanks(vitals, thresholds) {
  const out = {}
  for (const key of VITAL_KEYS) out[key] = STATUS_RANK[vitalStatus(key, vitals[key], thresholds)]
  return out
}

/**
 * Feature 35: how far a vital is from the patient's own baseline.
 * Returns null when it is within the limit, otherwise { change, unit } where `change`
 * is the signed percentage (or absolute amount for spo2/temp).
 */
export function baselineDeviation(key, value, baseline, limits) {
  const limit = limits[key]
  const base = baseline?.[key]
  if (!limit || typeof base !== 'number' || typeof value !== 'number' || base === 0) return null
  const diff = value - base
  if (limit.pct !== undefined) {
    const pct = (diff / base) * 100
    return Math.abs(pct) >= limit.pct ? { change: pct, unit: '%' } : null
  }
  if (limit.drop !== undefined) {
    return -diff >= limit.drop ? { change: diff, unit: 'abs' } : null
  }
  if (limit.abs !== undefined) {
    return Math.abs(diff) >= limit.abs ? { change: diff, unit: 'abs' } : null
  }
  return null
}

/** The bound a value crossed, for the reason text and the stored `threshold`. */
export function crossedBound(key, status, dir, thresholds) {
  const t = thresholds[key]
  if (!t) return null
  if (status === STATUS.CRITICAL) {
    if (dir === 'low') return t.critical.below ?? null
    return t.critical.above ?? t.critical.atOrAbove ?? null
  }
  return dir === 'low' ? t.normal[0] : t.normal[1]
}

function describeVital(key, value, status, dir, thresholds) {
  const t = thresholds[key]
  const bound = crossedBound(key, status, dir, thresholds)
  const word = dir === 'low' ? 'below' : 'above'
  const unit = t.unit ? ` ${t.unit}` : ''
  return {
    text: `${t.label} ${formatVital(key, value, thresholds)}${unit} is ${word} ${bound}`,
    bound,
  }
}

const conditionMet = (c, ctx) => {
  const have = STATUS_RANK[ctx.confirmed[c.vital] ?? 'normal']
  if (have < STATUS_RANK[c.min]) return false
  return vitalDirection(c.vital, ctx.vitals[c.vital], ctx.thresholds) === c.dir
}

function fire(rule, ctx) {
  if (rule.type === 'multi') {
    if (!rule.all.every((c) => conditionMet(c, ctx))) return null
    const parts = rule.all.map((c) => describeVital(c.vital, ctx.vitals[c.vital], ctx.confirmed[c.vital], c.dir, ctx.thresholds).text)
    return {
      rule: rule.id,
      level: rule.level,
      vital: null,
      message: `${rule.label}: ${parts.join('; ')}`,
      conditions: rule.all.length,
    }
  }

  if (rule.type === 'vital') {
    const status = ctx.confirmed[rule.vital] ?? 'normal'
    if (STATUS_RANK[status] < STATUS_RANK[rule.min]) return null
    // Level 2 only for Critical, Level 1 only for Warning: a Critical vital does not also fire the Warning rule.
    if (STATUS_RANK[status] > STATUS_RANK[rule.min]) return null
    const value = ctx.vitals[rule.vital]
    const dir = vitalDirection(rule.vital, value, ctx.thresholds)
    if (!dir) return null
    const d = describeVital(rule.vital, value, status, dir, ctx.thresholds)
    return { rule: rule.id, level: rule.level, vital: rule.vital, value, threshold: d.bound, message: d.text, conditions: 1 }
  }

  if (rule.type === 'baseline') {
    if (!ctx.baselineConfirmed[rule.vital]) return null
    const value = ctx.vitals[rule.vital]
    const dev = baselineDeviation(rule.vital, value, ctx.baseline, ctx.limits)
    if (!dev) return null
    const t = ctx.thresholds[rule.vital]
    const base = formatVital(rule.vital, ctx.baseline[rule.vital], ctx.thresholds)
    const amount = dev.unit === '%' ? `${Math.abs(Math.round(dev.change))}%` : `${Math.abs(Number(dev.change.toFixed(1)))} ${t.unit}`
    const way = dev.change > 0 ? 'above' : 'below'
    return {
      rule: rule.id,
      level: rule.level,
      vital: rule.vital,
      value,
      threshold: ctx.baseline[rule.vital],
      message: `${t.label} is ${amount} ${way} this patient's own baseline (${base} ${t.unit})`,
      conditions: 1,
    }
  }
  return null
}

/**
 * @param {object} ctx
 * @param {object} ctx.vitals            current displayed values
 * @param {object} ctx.thresholds        effective thresholds (global + per-patient overrides)
 * @param {object} ctx.confirmed         vital -> 'normal'|'warning'|'critical' after the 3-tick rule
 * @param {object} ctx.baseline          the patient's baseline vitals
 * @param {object} ctx.limits            baseline limits (feature 35)
 * @param {object} ctx.baselineConfirmed vital -> true when far from baseline for 3 ticks in a row
 * @returns {{ level: 0|1|2|3, rules: object[], primary: object|null }}
 */
export function evaluate(ctx, rules = RULES) {
  const order = new Map(rules.map((r, i) => [r.id, i]))
  const fired = []
  for (const rule of rules) {
    const hit = fire(rule, ctx)
    if (hit) fired.push(hit)
  }
  // Feature 34: combined rules outrank single ones.
  fired.sort((a, b) => b.level - a.level || b.conditions - a.conditions || order.get(a.rule) - order.get(b.rule))
  const level = fired.length ? fired[0].level : 0
  return { level, rules: fired, primary: fired[0] ?? null }
}

export const severityInfo = (level) => (level ? { level, key: SEVERITY[level].key, label: SEVERITY[level].label, action: SEVERITY[level].action } : null)

export { RANK_STATUS }
