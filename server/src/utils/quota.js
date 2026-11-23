// Fixed-window counters kept in memory (one server). `key` is e.g. "bystander:ip:1.2.3.4". Swap for a shared store when scaled out.
const windows = new Map();

export function consumeQuota(key, limit, windowMs, now = Date.now()) {
  let w = windows.get(key);
  if (!w || now - w.start >= windowMs) { w = { start: now, count: 0 }; windows.set(key, w); }
  w.count += 1;
  if (windows.size > 20000) for (const [k, v] of windows) if (now - v.start >= windowMs) windows.delete(k);
  return { allowed: w.count <= limit, count: w.count, retryAfterSeconds: Math.max(1, Math.ceil((w.start + windowMs - now) / 1000)) };
}
export const resetQuotas = () => windows.clear();
