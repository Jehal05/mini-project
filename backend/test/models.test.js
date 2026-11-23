// Schema tests that need no database (validateSync).
import { describe, it, expect } from 'vitest'
import mongoose from 'mongoose'
import { VitalReading, EmergencyCase, buildAcceptOperation } from '../src/models/index.js'

const id = () => new mongoose.Types.ObjectId()

describe('VitalReading', () => {
  it('accepts a normal reading and fills statuses', async () => {
    const r = new VitalReading({ patient: id(), hr: 78, sys: 122, dia: 80, spo2: 98, temp: 36.8, rr: 16 })
    await r.validate()
    expect(r.status).toBe('normal')
    expect(r.statuses.hr).toBe('normal')
    expect(r.simulated).toBe(true)
  })

  it('marks the worst vital (cardiac scenario)', async () => {
    const r = new VitalReading({ patient: id(), hr: 132, spo2: 87, scenario: 'cardiac_event' })
    await r.validate()
    expect(r.statuses.hr).toBe('critical')
    expect(r.status).toBe('critical')
  })

  it('requires patient and heart rate', () => {
    const err = new VitalReading({}).validateSync()
    expect(err.errors.patient).toBeDefined()
    expect(err.errors.hr).toBeDefined()
  })

  it('refuses a non-simulated reading', () => {
    const err = new VitalReading({ patient: id(), hr: 80, simulated: false }).validateSync()
    expect(err.errors.simulated).toBeDefined()
  })

  it('rejects impossible values and unknown scenarios', () => {
    const err = new VitalReading({ patient: id(), hr: 80, spo2: 140, scenario: 'zombie' }).validateSync()
    expect(err.errors.spo2).toBeDefined()
    expect(err.errors.scenario).toBeDefined()
  })

  it('labels JSON output as Simulated', () => {
    const json = new VitalReading({ patient: id(), hr: 80 }).toJSON()
    expect(json.label).toBe('Simulated')
  })
})

describe('EmergencyCase', () => {
  const base = () => ({
    patient: id(),
    patientCode: 'HT-2026-0001',
    source: 'auto_detection',
    location: { point: { coordinates: [73.8567, 18.5204] }, accuracyM: 25 },
  })

  it('creates a Level 3 case awaiting confirmation', () => {
    const c = new EmergencyCase(base())
    expect(c.validateSync()).toBeUndefined()
    expect(c.status).toBe('awaiting_confirmation')
    expect(c.severity).toBe(3)
    expect(c.escalation.radiusKm).toBe(10)
    expect(c.isActive).toBe(true)
  })

  it('rejects an unknown source and bad coordinates', () => {
    const err = new EmergencyCase({ ...base(), source: 'telepathy', location: { point: { coordinates: [200, 18] } } }).validateSync()
    expect(err.errors.source).toBeDefined()
    expect(err.errors['location.point.coordinates']).toBeDefined()
  })

  it('needs a reason to cancel', () => {
    const err = new EmergencyCase({ ...base(), status: 'cancelled' }).validateSync()
    expect(err.errors['cancellation.reason']).toBeDefined()
    const ok = new EmergencyCase({ ...base(), status: 'cancelled', cancellation: { reason: 'false_alarm' } })
    expect(ok.validateSync()).toBeUndefined()
    expect(ok.isActive).toBe(false)
  })

  it('validates hospital rejection reasons', () => {
    const err = new EmergencyCase({
      ...base(),
      hospitalResponses: [{ hospital: id(), round: 1, status: 'rejected', rejectReason: 'bored' }],
    }).validateSync()
    expect(err.errors['hospitalResponses.0.rejectReason']).toBeDefined()
  })

  it('adds timeline events and de-duplicates acknowledgements', () => {
    const c = new EmergencyCase(base())
    c.addEvent('detection', { message: 'HR > 120 and SpO2 < 90' })
    expect(c.timeline).toHaveLength(1)
    expect(c.acknowledge({ recipientType: 'contact', recipientId: '+919800000000', name: 'Priya' })).toBe(true)
    expect(c.acknowledge({ recipientType: 'contact', recipientId: '+919800000000', name: 'Priya' })).toBe(false)
    expect(c.acknowledgements).toHaveLength(1)
  })

  it('accept operation only matches a searching case with a live notification', () => {
    const caseId = id()
    const hospital = id()
    const { filter, update, options } = buildAcceptOperation(caseId, hospital, id())
    expect(filter.status).toBe('searching')
    expect(filter.hospitalResponses.$elemMatch).toEqual({ hospital, status: 'notified' })
    expect(update.$set.status).toBe('accepted')
    expect(options.arrayFilters).toHaveLength(2)
  })
})

describe('VitalReading retention (review 11)', async () => {
  const { retentionDays, DEFAULT_RETENTION_DAYS, MIN_RETENTION_DAYS } = await import('../src/models/VitalReading.js')

  it('has a TTL index on recordedAt, 30 days by default', () => {
    const ttl = VitalReading.schema.indexes().find(([fields, opts]) => fields.recordedAt === 1 && opts.expireAfterSeconds)
    expect(ttl).toBeDefined()
    expect(ttl[1].expireAfterSeconds).toBe(30 * 24 * 3600)
    expect(DEFAULT_RETENTION_DAYS).toBe(30)
  })

  it('reads VITALS_RETENTION_DAYS but never goes below 8 days', () => {
    expect(retentionDays({})).toBe(30)
    expect(retentionDays({ VITALS_RETENTION_DAYS: '90' })).toBe(90)
    expect(retentionDays({ VITALS_RETENTION_DAYS: '3' })).toBe(MIN_RETENTION_DAYS)
    expect(retentionDays({ VITALS_RETENTION_DAYS: 'abc' })).toBe(30)
  })
})
