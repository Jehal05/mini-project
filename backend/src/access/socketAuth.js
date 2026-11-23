// Socket.IO handshake: the client sends its access token as `auth: { token }`. Without a valid one the
// connection is refused. A connected user is placed in the rooms their role entitles them to; patient rooms
// are joined later with `vitals:subscribe`, which runs the same access check as the REST routes.

import { sessionStillLive, userFromToken } from '../middleware/authenticate.js'
import { HOSPITAL_ROLES } from '../models/User.js'
import { ADMIN_ROOM, hospitalRoom } from '../../../shared/emergency.js'
import { patientRoom } from '../simulation/engine.js'

// A socket outlives its 15-minute access token, so the login is re-checked now and then: after logout,
// password reset or deactivation the connection is closed instead of staying open until the browser leaves.
export const recheckMs = () => Number(process.env.SOCKET_RECHECK_MS) || 60_000

function watchSession(socket) {
  const timer = setInterval(async () => {
    try {
      if (!(await sessionStillLive(socket.data.user))) {
        socket.emit('auth:ended', { code: 'SESSION_REVOKED' })
        socket.disconnect(true)
      }
    } catch { /* a database hiccup must not drop a patient's live connection */ }
  }, recheckMs())
  timer.unref?.()
  socket.on('disconnect', () => clearInterval(timer))
}

export async function socketAuth(socket, next) {
  try {
    const token = socket.handshake?.auth?.token
    if (typeof token !== 'string' || !token) return next(Object.assign(new Error('Authentication required'), { data: { code: 'NO_TOKEN' } }))
    const user = await userFromToken(token)
    socket.data.user = user
    // Own patient room: the patient receives their own emergency and vitals events without asking.
    if (user.role === 'patient' && user.patientId) socket.join(patientRoom(user.patientId))
    if (user.role === 'central_admin') socket.join(ADMIN_ROOM)
    if (HOSPITAL_ROLES.includes(user.role) && user.hospitalId) socket.join(hospitalRoom(user.hospitalId))
    watchSession(socket)
    return next()
  } catch (err) {
    return next(Object.assign(new Error(err.message ?? 'Authentication failed'), { data: { code: err.code ?? 'AUTH_FAILED' } }))
  }
}
