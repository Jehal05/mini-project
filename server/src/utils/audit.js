import { AuditLog } from '../models/AuditLog.js';

/**
 * Writes one audit entry (feature 98). Never throws: an audit failure must not take a request down,
 * but it is logged loudly. Callers on security-critical paths still `await` it.
 */
export async function writeAudit({ req, actor, role, actorLabel, action, resourceType, resourceId, hospitalId, outcome = 'success', meta }) {
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
    return null;
  }
}
