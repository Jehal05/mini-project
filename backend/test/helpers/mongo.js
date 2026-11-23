// Starts an in-memory MongoDB for integration tests (review item 7).
//
// If MongoDB cannot start (offline, blocked download):
//   - CI=true or REQUIRE_DB_TESTS=1  -> throw, so the run FAILS instead of looking green
//   - otherwise (local laptop)        -> print a loud warning and return null; the
//                                        DB suites are skipped and show as skipped
export function requireDbTests(env = process.env) {
  return env.CI === 'true' || env.CI === '1' || env.REQUIRE_DB_TESTS === '1'
}

async function defaultCreate() {
  const { MongoMemoryServer } = await import('mongodb-memory-server')
  return MongoMemoryServer.create()
}

export async function startMongo(tag, { env = process.env, create = defaultCreate, log = console } = {}) {
  try {
    return await create()
  } catch (err) {
    const reason = err.message.split('\n')[0]
    if (requireDbTests(env)) {
      throw new Error(`[${tag}] MongoDB tests are required (CI or REQUIRE_DB_TESTS=1) but MongoDB could not start: ${reason}`)
    }
    log.warn(
      [
        '',
        '================================================================',
        ` WARNING [${tag}]: MongoDB could not start, so its tests are SKIPPED.`,
        ` Reason: ${reason}`,
        ' Results below do NOT cover the database. Fix the download or set',
        ' MONGOMS_SYSTEM_BINARY to a local mongod, then run again.',
        '================================================================',
        '',
      ].join('\n'),
    )
    return null
  }
}
