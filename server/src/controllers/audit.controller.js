import { AuditLog } from '../models/AuditLog.js';

/** Feature 98: central admins can filter the audit log; nobody can edit it. */
export async function listAuditLogs(req, res) {
  const { actor, role, action, resourceType, resourceId, hospitalId, outcome, from, to, page, limit } = req.valid;
  const filter = {};
  if (actor) {
    const escaped = actor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [{ actorLabel: { $regex: escaped, $options: 'i' } }, ...(/^[a-f\d]{24}$/i.test(actor) ? [{ actor }] : [])];
  }
  if (role) filter.role = role;
  if (action) filter.action = action;
  if (resourceType) filter.resourceType = resourceType;
  if (resourceId) filter.resourceId = resourceId;
  if (hospitalId) filter.hospitalId = hospitalId;
  if (outcome) filter.outcome = outcome;
  if (from || to) filter.createdAt = { ...(from && { $gte: from }), ...(to && { $lte: to }) };

  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  res.json({ items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
}
