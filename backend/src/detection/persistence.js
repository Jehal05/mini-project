// Features 31-33: the "3 ticks in a row" rule.
//
// A vital only counts as abnormal once it has been abnormal for N consecutive
// readings, so one noisy spike never fires. The confirmed level is the WEAKEST
// level seen in the last N readings: three Critical ticks confirm Critical, but
// Critical, Warning, Critical only confirms Warning.

import { PERSISTENCE_TICKS } from '../../../shared/detection.js'

export function createPersistence(required = PERSISTENCE_TICKS) {
  const windows = new Map() // key -> last `required` levels (numbers)

  return {
    required,
    /** Add one reading's level for a key (0 = fine) and return the confirmed level. */
    push(key, level) {
      const w = windows.get(key) ?? []
      w.push(level)
      if (w.length > required) w.shift()
      windows.set(key, w)
      return w.length < required ? 0 : Math.min(...w)
    },
    reset() {
      windows.clear()
    },
  }
}
