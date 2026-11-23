// Case numbers such as EC-2026-0001. They come from the same counters collection as patient ids, one
// sequence per year, so the numbers never repeat and never depend on a count of documents.

import { nextSequence } from '../models/Counter.js'
import { EmergencyCase } from '../models/EmergencyCase.js'

export const formatCaseNumber = (year, seq) => `EC-${year}-${String(seq).padStart(4, '0')}`

/**
 * Gives a new case its number, once. Safe to call twice (the second call changes nothing).
 * A case in an emergency must never fail because numbering failed, so errors are logged and the
 * case simply stays without a number until the next call.
 */
export async function assignCaseNumber(caseId, { logger = console, now = () => new Date() } = {}) {
  try {
    const open = await EmergencyCase.exists({ _id: caseId, caseNumber: { $exists: false } })
    if (!open) return null
    const year = now().getFullYear()
    const caseNumber = formatCaseNumber(year, await nextSequence(`caseNumber:${year}`))
    const done = await EmergencyCase.findOneAndUpdate({ _id: caseId, caseNumber: { $exists: false } }, { $set: { caseNumber } }, { returnDocument: 'after' }).lean()
    return done?.caseNumber ?? null
  } catch (err) {
    logger.error?.('[emergency] could not number case', String(caseId), err.message)
    return null
  }
}
