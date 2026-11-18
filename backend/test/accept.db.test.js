// Feature 65 against a real (in-memory) MongoDB: two hospitals accept at once, only one wins.
// mongodb-memory-server downloads a mongod binary on first run. If it cannot start,
// these tests fail in CI / with REQUIRE_DB_TESTS=1 and are skipped loudly otherwise.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import mongoose from 'mongoose'
import { EmergencyCase } from '../src/models/index.js'
import { startMongo } from './helpers/mongo.js'

const server = await startMongo('accept.db.test')

describe.skipIf(!server)('EmergencyCase.acceptIfPending (MongoDB)', () => {
  beforeAll(async () => {
    await mongoose.connect(server.getUri())
  })

  afterAll(async () => {
    await mongoose.disconnect()
    await server?.stop()
  })

  const newCase = async (hospitals) =>
    EmergencyCase.create({
      patient: new mongoose.Types.ObjectId(),
      source: 'auto_detection',
      status: 'searching',
      hospitalResponses: hospitals.map((h, i) => ({ hospital: h, round: 1, rank: i + 1 })),
    })

  it('lets exactly one of two simultaneous accepts win', async () => {
    const [a, b, c] = [1, 2, 3].map(() => new mongoose.Types.ObjectId())
    const ec = await newCase([a, b, c])

    const results = await Promise.all([
      EmergencyCase.acceptIfPending(ec._id, a, new mongoose.Types.ObjectId()),
      EmergencyCase.acceptIfPending(ec._id, b, new mongoose.Types.ObjectId()),
    ])
    const winners = results.filter(Boolean)
    expect(winners).toHaveLength(1)

    const saved = await EmergencyCase.findById(ec._id)
    expect(saved.status).toBe('accepted')
    const statuses = saved.hospitalResponses.map((r) => r.status).sort()
    expect(statuses).toEqual(['accepted', 'superseded', 'superseded'])
    expect(saved.timeline.at(-1).type).toBe('accepted')
  })

  it('refuses a hospital that was never notified', async () => {
    const ec = await newCase([new mongoose.Types.ObjectId()])
    const res = await EmergencyCase.acceptIfPending(ec._id, new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId())
    expect(res).toBeNull()
  })

  it('refuses after the patient cancelled', async () => {
    const h = new mongoose.Types.ObjectId()
    const ec = await newCase([h])
    ec.status = 'cancelled'
    ec.cancellation = { reason: 'feeling_better' }
    await ec.save()
    expect(await EmergencyCase.acceptIfPending(ec._id, h, new mongoose.Types.ObjectId())).toBeNull()
  })
})
