// Review item 7: database tests must not pass silently when MongoDB is missing.
import { describe, it, expect, vi } from 'vitest'
import { startMongo, requireDbTests } from './helpers/mongo.js'

const failing = () => Promise.reject(new Error('Download failed (403)\nmore detail'))

describe('startMongo', () => {
  it('fails the run in CI when MongoDB cannot start', async () => {
    await expect(startMongo('t', { env: { CI: 'true' }, create: failing, log: { warn: vi.fn() } })).rejects.toThrow(/required.*Download failed/)
  })

  it('fails the run when REQUIRE_DB_TESTS=1', async () => {
    await expect(startMongo('t', { env: { REQUIRE_DB_TESTS: '1' }, create: failing, log: { warn: vi.fn() } })).rejects.toThrow(/required/)
  })

  it('skips locally with a loud warning', async () => {
    const log = { warn: vi.fn() }
    expect(await startMongo('t', { env: {}, create: failing, log })).toBeNull()
    expect(log.warn.mock.calls[0][0]).toMatch(/SKIPPED/)
    expect(log.warn.mock.calls[0][0]).toMatch(/do NOT cover the database/)
  })

  it('returns the server when it starts', async () => {
    const server = { getUri: () => 'mongodb://x' }
    expect(await startMongo('t', { env: { CI: 'true' }, create: async () => server })).toBe(server)
  })

  it('reads the environment flags', () => {
    expect(requireDbTests({ CI: 'true' })).toBe(true)
    expect(requireDbTests({ CI: '1' })).toBe(true)
    expect(requireDbTests({ REQUIRE_DB_TESTS: '1' })).toBe(true)
    expect(requireDbTests({})).toBe(false)
  })
})
