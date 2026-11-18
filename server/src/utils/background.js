const pending = new Set();

/** Runs work after the response has gone out. Errors are logged, never thrown into the request. */
export function runInBackground(label, fn) {
  // Registered immediately (so drainBackground sees it) but started only after the current event-loop turn,
  // so the response is flushed to the client before any of this work uses the CPU or the database.
  const task = new Promise((resolve) => setImmediate(resolve))
    .then(fn)
    .catch((err) => console.error(`[background:${label}]`, err.message))
    .finally(() => pending.delete(task));
  pending.add(task);
}

/** Lets tests (and graceful shutdown) wait for outstanding background work. */
export async function drainBackground() {
  while (pending.size) await Promise.all([...pending]);
}
