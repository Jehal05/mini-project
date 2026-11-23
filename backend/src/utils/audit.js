import { AuditLog } from '../models/AuditLog.js';

/**
 * Writes one audit entry (feature 98). Never throws: an audit failure must not take a request down,
 * but it is logged loudly. With `strict: true` the error is rethrown, so a record is never shown without a log entry.
 */
export async function writeAudit({ req, actor, role, actorLabel, action, resourceType, resourceId, hospitalId, outcome = 'success', meta, strict = false }) {
  try {
    const user = actor ?? req?.user?.id;
    return await AuditLog.create({
      actor: user || undefined,
      actorLabel,
      role: role ?? req?.user?.role,
      action,
      resourceType,
      resourceId: resourceId != null ? String(resourceId) : undefined,
      hospitalId: hospitalId ?? req?.user?.hospitalId,
      outcome,
      ip: req?.ip,
      meta,
    });
  } catch (err) {
    console.error('[audit] failed to write entry', action, err.message);
    if (strict) throw err; // callers that must not proceed without a log entry (full-record views)
    return null;
  }
}
