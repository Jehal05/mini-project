import { User } from '../models/User.js';

/** The access token carries ids and roles, not names, so a name for a record's byline is looked up (once per request). */
export async function actorName(req) {
  req.actorNameCache ??= (await User.findById(req.user.id).select('name'))?.name ?? 'Unknown';
  return req.actorNameCache;
}
