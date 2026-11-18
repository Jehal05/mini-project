// Starts an in-memory MongoDB for integration tests, or returns null if it
// cannot (offline / blocked download) so those tests are skipped, not failed.
export async function startMongo(tag) {
  try {
    const { MongoMemoryServer } = await import('mongodb-memory-server')
    return await MongoMemoryServer.create()
  } catch (err) {
    console.warn(`[${tag}] Skipping DB tests: ${err.message.split('\n')[0]}`)
    return null
  }
}
