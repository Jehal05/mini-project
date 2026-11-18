/** The suite wipes its database, so refuse to run against anything not clearly meant for tests. */
export function assertSafeTestDb(uri) {
  let name = '';
  try { name = decodeURIComponent(new URL(uri).pathname.replace(/^\//, '')); } catch { /* handled below */ }
  if (!/test/i.test(name)) {
    throw new Error(`Refusing to run: MONGO_URI_TEST must point at a database whose name contains "test" (got "${name || 'none'}"). The tests delete everything in it.`);
  }
}
