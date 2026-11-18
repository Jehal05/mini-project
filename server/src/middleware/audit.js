import { writeAudit } from '../utils/audit.js';

/**
 * Feature 98 helper for any teammate's route: logs who did what to which record once the response
 * has been sent successfully.
 *
 *   router.get('/patients/:id', protect({...}), audit('record.view', { resourceType: 'patient', resourceId: (req) => req.params.id }), handler)
 */
export function audit(action, { resourceType, resourceId, meta } = {}) {
  return (req, res, next) => {
    res.on('finish', () => {
      if (res.statusCode >= 400) return;
      writeAudit({
        req,
        action,
        resourceType,
        resourceId: typeof resourceId === 'function' ? resourceId(req) : resourceId,
        meta: typeof meta === 'function' ? meta(req) : meta,
      });
    });
    next();
  };
}
