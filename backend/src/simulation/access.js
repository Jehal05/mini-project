// INTERIM access control for the monitoring module (review item 3).
//
// TODO(Jehal): replace both checks with the real auth from Phase 2:
//   - presenter guard  -> JWT middleware + role check (central_admin only)
//   - authorizeSubscribe -> allow a socket to join patient:<id> only if it is
//     that patient, a family link, or staff of a hospital handling their case
// Until then these keep a hosted demo from being open to anyone.

import { timingSafeEqual } from 'node:crypto'

export const PRESENTER_KEY_HEADER = 'x-presenter-key'

const isProduction = (env) => env.NODE_ENV === 'production'

function sameSecret(a, b) {
  const x = Buffer.from(String(a))
  const y = Buffer.from(String(b))
  return x.length === y.length && timingSafeEqual(x, y)
}

/**
 * Guards POST /scenario with a shared key sent in the x-presenter-key header.
 * - PRESENTER_KEY set:            header must match, otherwise 401
 * - unset, NODE_ENV=production:   503 (fails closed; the demo is never left open)
 * - unset in development:         open, so local demos need no setup
 */
export function createPresenterKeyGuard({ env = process.env } = {}) {
  return function presenterKeyGuard(req, res, next) {
    const key = env.PRESENTER_KEY
    if (!key) {
      if (isProduction(env)) {
        return res.status(503).json({ error: 'Presenter controls are disabled: set PRESENTER_KEY on the server' })
      }
      return next()
    }
    const sent = req.get(PRESENTER_KEY_HEADER)
    if (!sent || !sameSecret(sent, key)) {
      return res.status(401).json({ error: 'Presenter key required', code: 'PRESENTER_KEY_REQUIRED' })
    }
    return next()
  }
}

/**
 * Default socket check for vitals:subscribe.
 * Development: allow all. Production: deny until a real check is passed to
 * attachSimulation({ authorizeSubscribe }), so live vitals are never public by accident.
 */
export function defaultAuthorizeSubscribe({ env = process.env } = {}) {
   
  return async function authorizeSubscribe(_socket, _patientId) {
    return !isProduction(env)
  }
}
