// Socket.IO handshake: the client sends its access token as `auth: { token }`. Without a valid one the
// connection is refused. A connected user is placed in the rooms their role entitles them to; patient rooms
// are joined later with `vitals:subscribe`, which runs the same access check as the REST routes.

import { userFromToken } from '../middleware/authenticate.js'
import { HOSPITAL_ROLES } from '../models/User.js'
import { ADMIN_ROOM, hospitalRoom } from '../../../shared/emergency.js'
import { patientRoom } from '../simulation/engine.js'

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
    return next()
  } catch (err) {
    return next(Object.assign(new Error(err.message ?? 'Authentication failed'), { data: { code: err.code ?? 'AUTH_FAILED' } }))
  }
}
