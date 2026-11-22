import { AuditLog } from '../models/index.js';

// Admin actions (backup, verify, export, restore). `actor` is a User id when real admin auth exists, otherwise empty.
export const writeAdminAudit = ({ actor, action, meta }) => AuditLog.create({ actor, action: `admin_${action}`, resourceType: 'admin', meta });
