// Ported from Daksh's branch to OUR statuses (his 'searching' is our 'pending'). NOT RUN yet: needs mongodb-memory-server or a local mongod
// (set MONGOMS_SYSTEM_BINARY). Without one the suite is skipped.
// Phase 7 on a real MongoDB: every transition is one atomic conditional update, so the races below
// have exactly one winner. Each test names the naive version it is meant to catch.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { EmergencyCase, Detection } from '../../src/models/index.js'
import { EmergencyService } from '../../src/emergency/service.js'
import { EMERGENCY_EVENTS as EV, ADMIN_ROOM, ESCALATION } from '../../../shared/emergency.js'
import { startMongo } from '../helpers/mongo.js'
import { fakeIo } from '../monitoring/helpers/detection.js'

const mongo = await startMongo('emergency.service.test')
const silent = { warn() {}, error() {}, log() {} }
const oid = () => new mongoose.Types.ObjectId()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

describe.skipIf(!mongo)('emergency service (MongoDB)', () => {
  let io
  let discovery
  let svc

  beforeAll(async () => {
    await mongoose.connect(mongo.getUri('emergency'))
    await EmergencyCase.init() // the one-live-case index must exist before the SOS tests
  })
  afterAll(async () => {
    svc?.stop()
    await mongoose.disconnect()
    await mongo.stop()
  })
  beforeEach(() => {
    svc?.stop()
    io = fakeIo()
    discovery = { notify: vi.fn().mockResolvedValue([]) }
    svc = new EmergencyService({ io, discovery, logger: silent, patientRecordFor: async () => null, contactsFor: async () => [] })
  })

  const sent = () => io.emits.filter((e) => e.event === EV.SENT)
  const awaiting = (extra = {}) =>
    EmergencyCase.create({ patient: oid(), source: 'auto_detection', severity: 'critical', status: 'awaiting_confirmation', escalation: { confirmDeadline: new Date(Date.now() + 10_000), round: 0, radiusKm: 10 }, ...extra })
  const searching = (extra = {}) =>
    EmergencyCase.create({ patient: oid(), source: 'manual_sos', severity: 'critical', status: 'pending', escalation: { round: 1, radiusKm: 10, roundStartedAt: new Date() }, ...extra })
  const reload = (c) => EmergencyCase.findById(c._id).lean()

  describe('43, 44: confirmation and the server-side deadline', () => {
    it('the deadline and "send now" together send exactly once (a version that lets both run notifies twice)', async () => {
      for (let i = 0; i < 20; i += 1) {
        io.emits.length = 0
        discovery.notify.mockClear()
        const c = await awaiting()
        const [auto, manual] = await Promise.all([svc.autoSend(c._id), svc.confirm(c._id, { chestPain: true })])
        expect([Boolean(auto), manual.changed].filter(Boolean)).toHaveLength(1)
        expect(discovery.notify).toHaveBeenCalledTimes(1)
        expect(sent()).toHaveLength(1)
        expect((await reload(c)).status).toBe('pending')
      }
    })

    it('confirm moves the case to searching, round 1, 10 km, and keeps the answers', async () => {
      const c = await awaiting()
      const out = await svc.confirm(c._id, { chestPain: true, nauseaOrLightheaded: false })
      expect(out.changed).toBe(true)
      const saved = await reload(c)
      expect(saved).toMatchObject({ status: 'pending', escalation: { round: 1, radiusKm: 10 } })
      expect(saved.symptoms).toMatchObject({ chestPain: true, nauseaOrLightheaded: false, noResponse: false })
      expect(saved.symptoms.answeredAt).toBeInstanceOf(Date)
      expect(saved.escalation.roundStartedAt).toBeInstanceOf(Date)
      expect(discovery.notify).toHaveBeenCalledWith(expect.objectContaining({ caseId: String(c._id), round: 1, radiusKm: 10 }))
    })

    it('a second confirm after it was sent changes nothing and does not notify again', async () => {
      const c = await awaiting()
      await svc.confirm(c._id, {})
      const again = await svc.confirm(c._id, { chestPain: true })
      expect(again.changed).toBe(false)
      expect(discovery.notify).toHaveBeenCalledTimes(1)
      expect((await reload(c)).symptoms.chestPain).toBeUndefined() // the late answer did not rewrite a sent case
    })

    it('with no response, the deadline sends it and marks "no response" (the patient may be unconscious)', async () => {
      const c = await awaiting()
      expect(await svc.autoSend(c._id)).toBeTruthy()
      const saved = await reload(c)
      expect(saved).toMatchObject({ status: 'pending', escalation: { autoSent: true }, symptoms: { noResponse: true } })
      expect(saved.timeline.at(-1)).toMatchObject({ event: 'sent', data: { how: 'auto' } })
    })

    it('symptoms ticked before the deadline are kept when it auto-sends (and it is not "no response")', async () => {
      const c = await awaiting()
      await svc.recordSymptoms(c._id, { shortnessOfBreath: true })
      await svc.autoSend(c._id)
      const saved = await reload(c)
      expect(saved.symptoms).toMatchObject({ shortnessOfBreath: true, noResponse: false })
      expect(saved.escalation.autoSent).toBe(true)
    })

    it('rejects unknown or non-boolean symptoms', async () => {
      const c = await awaiting()
      await expect(svc.confirm(c._id, { headache: true })).rejects.toMatchObject({ status: 400 })
      await expect(svc.confirm(c._id, { chestPain: 'yes' })).rejects.toMatchObject({ status: 400 })
      expect((await reload(c)).status).toBe('awaiting_confirmation') // a bad request must not send it
    })

    it('the timer sends at the stored deadline, and a server restart resumes it (a version with in-memory timers loses it)', async () => {
      const c = await awaiting({ escalation: { confirmDeadline: new Date(Date.now() + 150), round: 0, radiusKm: 10 } })
      const restarted = new EmergencyService({ io, discovery, logger: silent, patientRecordFor: async () => null, contactsFor: async () => [] })
      expect(await restarted.start()).toBeGreaterThanOrEqual(1) // a fresh process only knows the database
      await wait(500)
      expect((await reload(c)).status).toBe('pending')
      expect(discovery.notify).toHaveBeenCalledTimes(1)
      restarted.stop()
    })

    it('a deadline already past when the server starts is sent straight away', async () => {
      const c = await awaiting({ escalation: { confirmDeadline: new Date(Date.now() - 5000), round: 0, radiusKm: 10 } })
      await svc.start()
      await wait(300)
      expect((await reload(c)).status).toBe('pending')
    })

    it('a timer that fires after a cancel does nothing', async () => {
      const c = await awaiting({ escalation: { confirmDeadline: new Date(Date.now() + 150), round: 0, radiusKm: 10 } })
      await svc.arm(c)
      await svc.cancel(c._id, { reason: 'feeling_better' })
      await wait(400)
      expect((await reload(c)).status).toBe('cancelled')
      expect(discovery.notify).not.toHaveBeenCalled()
    })
  })

  describe('41: manual SOS joins the live case', () => {
    it('with no case it opens one straight in searching (no countdown for a deliberate SOS)', async () => {
      const patient = oid()
      const out = await svc.sos(patient, { location: { lng: 73.85, lat: 18.52 } })
      expect(out).toMatchObject({ created: true, joined: false, case: { status: 'pending', source: 'manual_sos' } })
      expect(out.case.location.point.coordinates).toEqual([73.85, 18.52])
      expect(discovery.notify).toHaveBeenCalledTimes(1)
      expect(io.emits.map((e) => e.event)).toEqual(expect.arrayContaining([EV.CREATED, EV.SENT]))
    })

    it('during the countdown it is "send now" on the SAME case (a naive version opens a second case)', async () => {
      const c = await awaiting()
      const out = await svc.sos(c.patient)
      expect(out).toMatchObject({ created: false, joined: true })
      expect(await EmergencyCase.countDocuments({ patient: c.patient })).toBe(1)
      expect(out.case.id).toBe(String(c._id))
      expect((await reload(c)).status).toBe('pending')
      expect(discovery.notify).toHaveBeenCalledTimes(1)
    })

    it('after it was sent, SOS returns the existing case and does not notify again', async () => {
      const c = await searching()
      const out = await svc.sos(c.patient)
      expect(out).toMatchObject({ created: false, joined: true })
      expect(discovery.notify).not.toHaveBeenCalled()
      expect(await EmergencyCase.countDocuments({ patient: c.patient })).toBe(1)
    })

    it('10 simultaneous SOS presses create one case and notify once', async () => {
      const patient = oid()
      const outs = await Promise.all(Array.from({ length: 10 }, () => svc.sos(patient)))
      expect(outs.filter((o) => o.created)).toHaveLength(1)
      expect(await EmergencyCase.countDocuments({ patient })).toBe(1)
      expect(discovery.notify).toHaveBeenCalledTimes(1)
    })

    it('SOS and the deadline together still send once', async () => {
      for (let i = 0; i < 10; i += 1) {
        discovery.notify.mockClear()
        const c = await awaiting()
        await Promise.all([svc.sos(c.patient), svc.autoSend(c._id)])
        expect(discovery.notify).toHaveBeenCalledTimes(1)
      }
    })

    it('rejects a bad location before creating anything', async () => {
      const patient = oid()
      await expect(svc.sos(patient, { location: { lng: 999, lat: 0 } })).rejects.toMatchObject({ status: 400 })
      expect(await EmergencyCase.countDocuments({ patient })).toBe(0)
    })
  })

  describe('45: escalation 10 -> 20 -> 30 km, then unresolved', () => {
    it('widens in order, notifies at every round, then goes unresolved and alerts the admin exactly once', async () => {
      const c = await searching()
      const r2 = await svc.escalate(c._id, 1)
      expect(r2.escalation).toMatchObject({ round: 2, radiusKm: 20 })
      const r3 = await svc.escalate(c._id, 2)
      expect(r3.escalation).toMatchObject({ round: 3, radiusKm: 30 })
      expect(discovery.notify.mock.calls.map(([a]) => [a.round, a.radiusKm])).toEqual([[2, 20], [3, 30]])
      const done = await svc.escalate(c._id, 3)
      expect(done.status).toBe('unresolved')
      expect(done.escalation.centralAdminAlertedAt).toBeInstanceOf(Date)
      expect(await svc.escalate(c._id, 3)).toBeNull()
      const adminAlerts = io.emits.filter((e) => e.room === ADMIN_ROOM && e.event === EV.UNRESOLVED)
      expect(adminAlerts).toHaveLength(1)
      const patientMsg = io.emits.find((e) => e.event === EV.UNRESOLVED && e.room !== ADMIN_ROOM)
      expect(patientMsg.payload.message).toMatch(/112/)
      expect(ESCALATION.RADII_KM).toEqual([10, 20, 30])
    })

    it('two timers for the same round widen it once (a version without the round check widens twice)', async () => {
      const c = await searching()
      const results = await Promise.all([svc.escalate(c._id, 1), svc.escalate(c._id, 1), svc.escalate(c._id, 1)])
      expect(results.filter(Boolean)).toHaveLength(1)
      expect((await reload(c)).escalation.round).toBe(2)
    })

    it('never widens a case that was accepted, cancelled or already unresolved (a timer that ignores status would)', async () => {
      const accepted = await searching({ status: 'accepted' })
      const cancelled = await searching({ status: 'cancelled', cancellation: { reason: 'other' } })
      expect(await svc.escalate(accepted._id, 1)).toBeNull()
      expect(await svc.escalate(cancelled._id, 1)).toBeNull()
      expect((await reload(accepted)).escalation.radiusKm).toBe(10)
      expect(discovery.notify).not.toHaveBeenCalled()
    })

    it('accept and the round timer together: an accepted case is never widened', async () => {
      for (let i = 0; i < 15; i += 1) {
        const hospital = oid()
        const c = await searching({ hospitalResponses: [{ hospital, round: 1 }] })
        await Promise.all([svc.escalate(c._id, 1), EmergencyCase.acceptIfPending(c._id, hospital, oid())])
        const saved = await reload(c)
        if (saved.status === 'accepted') expect(saved.escalation.round).toBeLessThanOrEqual(2)
        expect(['accepted']).toContain(saved.status) // the accept must never be lost to the timer
      }
    })

    it('the 60 s round timer fires on its own and resumes after a restart', async () => {
      const c = await searching({ escalation: { round: 1, radiusKm: 10, roundStartedAt: new Date(Date.now() - 59_900) } })
      const fast = new EmergencyService({ io, discovery, logger: silent, patientRecordFor: async () => null, contactsFor: async () => [], roundTimeoutMs: 60_000 })
      await fast.start()
      await wait(400)
      expect((await reload(c)).escalation).toMatchObject({ round: 2, radiusKm: 20 })
      fast.stop()
    })

    it('a failing discovery hook does not stop the escalation', async () => {
      discovery.notify.mockRejectedValue(new Error('discovery down'))
      const c = await searching()
      expect((await svc.escalate(c._id, 1)).escalation.round).toBe(2)
    })
  })

  describe('49: cancellation', () => {
    it('cancel before the send means no hospital is ever notified', async () => {
      const c = await awaiting()
      await svc.cancel(c._id, { reason: 'feeling_better' })
      expect(await svc.autoSend(c._id)).toBeNull()
      expect((await svc.confirm(c._id, {})).changed).toBe(false)
      expect(discovery.notify).not.toHaveBeenCalled()
      const saved = await reload(c)
      expect(saved).toMatchObject({ status: 'cancelled', cancellation: { reason: 'feeling_better', afterAcceptance: false } })
      expect(saved.closedAt).toBeInstanceOf(Date)
    })

    it('the deadline and cancel together never leave a cancelled case searching or notified twice', async () => {
      for (let i = 0; i < 20; i += 1) {
        discovery.notify.mockClear()
        const c = await awaiting()
        await Promise.all([svc.autoSend(c._id), svc.cancel(c._id, { reason: 'other' })])
        expect((await reload(c)).status).toBe('cancelled')
        expect(discovery.notify.mock.calls.length).toBeLessThanOrEqual(1)
      }
    })

    it('cancel and accept together: one consistent outcome, and a post-accept cancel tells the hospital', async () => {
      let afterAccept = 0
      let beforeAccept = 0
      for (let i = 0; i < 25; i += 1) {
        io.emits.length = 0
        const hospital = oid()
        const c = await searching({ hospitalResponses: [{ hospital, round: 1 }] })
        const [, accepted] = await Promise.all([svc.cancel(c._id, { reason: 'other' }), EmergencyCase.acceptIfPending(c._id, hospital, oid())])
        const saved = await reload(c)
        expect(saved.status).toBe('cancelled') // cancel always lands
        expect(saved.cancellation.afterAcceptance).toBe(Boolean(accepted)) // and it knows whether a hospital had accepted
        const toHospital = io.emits.filter((e) => e.room === `hospital:${hospital}`)
        if (accepted) {
          afterAccept += 1
          expect(toHospital).toHaveLength(1)
          expect(toHospital[0]).toMatchObject({ event: EV.CANCELLED, payload: { afterAcceptance: true, hospitalId: String(hospital) } })
        } else {
          beforeAccept += 1
          expect(toHospital).toHaveLength(0)
        }
      }
      expect(afterAccept + beforeAccept).toBe(25)
    })

    it('cancelling after acceptance records it, informs the hospital and names the ambulance to release', async () => {
      const hospital = oid()
      const ambulance = oid()
      const c = await searching({ status: 'ambulance_assigned', hospital: hospital, ambulance })
      await svc.cancel(c._id, { reason: 'already_at_hospital', note: 'Family took me' })
      const evt = io.emits.find((e) => e.room === `hospital:${hospital}`)
      expect(evt.payload).toMatchObject({ reason: 'already_at_hospital', afterAcceptance: true, ambulanceId: String(ambulance), simulated: true })
      expect((await reload(c)).cancellation).toMatchObject({ reason: 'already_at_hospital', note: 'Family took me', afterAcceptance: true })
    })

    it('a cancelled case cannot be cancelled again, and a case that reached the hospital cannot be cancelled', async () => {
      const c = await awaiting()
      await svc.cancel(c._id, { reason: 'other' })
      await expect(svc.cancel(c._id, { reason: 'other' })).rejects.toMatchObject({ status: 409 })
      const arrived = await searching({ status: 'arrived' })
      await expect(svc.cancel(arrived._id, { reason: 'other' })).rejects.toMatchObject({ status: 409 })
      expect((await reload(arrived)).status).toBe('arrived')
    })

    it('needs a valid reason, a sane note and a real case', async () => {
      const c = await awaiting()
      await expect(svc.cancel(c._id, { reason: 'bored' })).rejects.toMatchObject({ status: 400 })
      await expect(svc.cancel(c._id, {})).rejects.toMatchObject({ status: 400 })
      await expect(svc.cancel(c._id, { reason: 'other', note: 'x'.repeat(501) })).rejects.toMatchObject({ status: 400 })
      await expect(svc.cancel(oid(), { reason: 'other' })).rejects.toMatchObject({ status: 404 })
      await expect(svc.cancel('not-an-id', { reason: 'other' })).rejects.toMatchObject({ status: 404 })
      expect((await reload(c)).status).toBe('awaiting_confirmation')
    })

    it('an unresolved case can still be cancelled by the patient', async () => {
      const c = await searching({ status: 'unresolved' })
      await svc.cancel(c._id, { reason: 'false_alarm' })
      expect((await reload(c)).status).toBe('cancelled')
    })
  })

  describe('40: Detection.outcome follows the case', () => {
    const detection = (extra = {}) =>
      Detection.create({ patient: oid(), patientCode: 'HT-T', episode: `e-${oid()}`, severity: 3, rules: [{ rule: 'x', level: 3 }], primaryRule: 'x', outcome: 'case_created', at: new Date(), ...extra })

    it('sent, then false_alarm', async () => {
      const det = await detection()
      const c = await awaiting({ detectionRef: det._id })
      await svc.autoSend(c._id)
      expect((await Detection.findById(det._id)).outcome).toBe('sent')
      await svc.cancel(c._id, { reason: 'false_alarm' })
      expect((await Detection.findById(det._id)).outcome).toBe('false_alarm')
    })

    it('cancelled for any other reason', async () => {
      const det = await detection()
      const c = await awaiting({ detectionRef: det._id })
      await svc.cancel(c._id, { reason: 'feeling_better' })
      expect((await Detection.findById(det._id)).outcome).toBe('cancelled')
    })

    it('a late "sent" can never overwrite "cancelled" (a version that just writes the latest value would)', async () => {
      const det = await detection({ outcome: 'cancelled' })
      await svc.setOutcome({ detectionRef: det._id }, 'sent')
      expect((await Detection.findById(det._id)).outcome).toBe('cancelled')
      const det2 = await detection({ outcome: 'false_alarm' })
      await svc.setOutcome({ detectionRef: det2._id }, 'cancelled')
      expect((await Detection.findById(det2._id)).outcome).toBe('false_alarm')
    })
  })

  describe('46: location', () => {
    it('stores a point with its accuracy and source, only while the case is live', async () => {
      const c = await searching()
      const updated = await svc.updateLocation(c._id, { lng: 73.8567, lat: 18.5204, accuracyM: 25, source: 'gps' })
      expect(updated.locationInfo).toMatchObject({ accuracyM: 25, source: 'gps' })
      expect(updated.location.coordinates).toEqual([73.8567, 18.5204])
      expect(io.emits.some((e) => e.event === EV.LOCATION)).toBe(true)
      await svc.updateLocation(c._id, { lng: 73.86, lat: 18.53, source: 'manual', address: 'Near Shaniwar Wada' })
      expect((await reload(c)).locationInfo).toMatchObject({ source: 'manual', address: 'Near Shaniwar Wada' })
      const closed = await searching({ status: 'closed' })
      await expect(svc.updateLocation(closed._id, { lng: 1, lat: 1 })).rejects.toMatchObject({ status: 404 })
    })

    it('rejects swapped, missing, out-of-range or text coordinates', async () => {
      const c = await searching()
      for (const bad of [{ lng: 18.5, lat: 200 }, { lng: '73.8', lat: 18.5 }, { lng: 73.8 }, { lng: NaN, lat: 1 }, { lng: 1, lat: 1, source: 'telepathy' }, { lng: 1, lat: 1, accuracyM: -5 }]) {
        await expect(svc.updateLocation(c._id, bad)).rejects.toMatchObject({ status: 400 })
      }
    })
  })

  describe('47: contact alerts', () => {
    const contacts = [
      { name: 'Meera', relation: 'spouse', phone: '+91 98000 00001', email: 'meera@example.com' },
      { name: 'Lakshmi', relation: 'mother', phone: '+919800000002' },
    ]
    const withContacts = (notifier) => new EmergencyService({ io, discovery, logger: silent, notifier, publicUrl: 'https://demo.test/', patientRecordFor: async () => ({ name: 'Rahul Sharma' }), contactsFor: async () => contacts })

    it('alerts every contact once, with an email, a pre-filled wa.me link and a status link', async () => {
      const notifier = { email: vi.fn().mockResolvedValue({}) }
      svc = withContacts(notifier)
      const c = await awaiting()
      await svc.confirm(c._id, {})
      await svc.confirm(c._id, {}) // a repeat must not alert again
      const saved = await reload(c)
      expect(saved.contactAlerts).toHaveLength(2)
      expect(notifier.email).toHaveBeenCalledTimes(1)
      expect(notifier.email.mock.calls[0][0]).toMatchObject({ to: 'meera@example.com' })
      expect(notifier.email.mock.calls[0][0].text).toMatch(/SIMULATED/)
      const [meera, lakshmi] = saved.contactAlerts
      expect(meera.channels).toEqual(['email', 'whatsapp'])
      expect(lakshmi.channels).toEqual(['whatsapp'])
      expect(meera.whatsappLink).toMatch(/^https:\/\/wa\.me\/919800000001\?text=/)
      expect(decodeURIComponent(meera.whatsappLink.split('text=')[1])).toContain(`https://demo.test/status/${meera.statusLinkToken}`)
      expect(meera.statusLinkToken).toMatch(/^[0-9a-f]{32}$/)
      expect(meera.statusLinkToken).not.toBe(lakshmi.statusLinkToken)
    })

    it('calling the alert twice (a retry, a second process) still alerts once', async () => {
      const notifier = { email: vi.fn().mockResolvedValue({}) }
      svc = withContacts(notifier)
      const c = await awaiting()
      await svc.confirm(c._id, {})
      const live = await reload(c)
      expect(await svc.alertContacts(live)).toBeNull()
      await Promise.all([svc.alertContacts(live), svc.alertContacts(live)])
      expect(notifier.email).toHaveBeenCalledTimes(1)
      expect((await reload(c)).contactAlerts).toHaveLength(2)
    })

    it('the patient view has the wa.me link for each contact; the token appears only inside that link, never as a field', async () => {
      svc = withContacts({})
      const c = await awaiting()
      await svc.confirm(c._id, {})
      const view = svc.toView(await reload(c))
      expect(view.contactAlerts[0].whatsappLink).toMatch(/wa\.me/)
      expect(JSON.stringify(view)).not.toMatch(/statusLinkToken/)
      const withoutLinks = JSON.stringify({ ...view, contactAlerts: view.contactAlerts.map(({ whatsappLink, ...rest }) => rest) })
      expect(withoutLinks).not.toMatch(/[0-9a-f]{32}/)
    })

    it('a failing email channel never blocks the emergency', async () => {
      svc = withContacts({ email: vi.fn().mockRejectedValue(new Error('smtp down')) })
      const c = await awaiting()
      const out = await svc.confirm(c._id, {})
      expect(out.changed).toBe(true)
      expect(discovery.notify).toHaveBeenCalledTimes(1)
      expect((await reload(c)).contactAlerts).toHaveLength(2)
    })

    it('a patient with no contacts is simply not alerted', async () => {
      const c = await awaiting()
      await svc.confirm(c._id, {})
      expect((await reload(c)).contactAlerts).toHaveLength(0)
    })

    it('the family status page shows the case, and "Seen" is recorded once (a duplicate-prone version records twice)', async () => {
      svc = withContacts({})
      const c = await awaiting()
      await svc.confirm(c._id, {})
      await svc.updateLocation(c._id, { lng: 73.85, lat: 18.52, accuracyM: 30 })
      const token = (await reload(c)).contactAlerts[0].statusLinkToken
      const page = await svc.publicStatus(token)
      expect(page).toMatchObject({ patientName: 'Rahul Sharma', contactName: 'Meera', status: 'pending', isLive: true, seen: false, simulated: true })
      expect(page.location).toMatchObject({ lat: 18.52, lng: 73.85 })
      await Promise.all([svc.seenByToken(token), svc.seenByToken(token), svc.seenByToken(token)])
      expect((await reload(c)).acknowledgements.filter((a) => a.recipientType === 'contact')).toHaveLength(1)
      expect((await svc.publicStatus(token)).seen).toBe(true)
      expect(await svc.publicStatus('0'.repeat(32))).toBeNull()
      expect(await svc.seenByToken('nope')).toBeNull()
    })
  })

  describe('48: acknowledgements', () => {
    it('records each recipient once, 10 at a time', async () => {
      const c = await awaiting()
      const who = { recipientType: 'contact', recipientId: '+919800000000', name: 'Contact' }
      const outs = await Promise.all(Array.from({ length: 10 }, () => svc.acknowledge(c._id, who)))
      expect(outs.filter((o) => o.recorded)).toHaveLength(1)
      await svc.acknowledge(c._id, { recipientType: 'hospital_staff', recipientId: 'u1', name: 'Dr A' })
      const saved = await reload(c)
      expect(saved.acknowledgements).toHaveLength(2)
      expect(saved.acknowledgements[0].seenAt).toBeInstanceOf(Date)
      expect(io.emits.filter((e) => e.event === EV.ACK)).toHaveLength(2)
    })

    it('rejects an unknown recipient type or a missing id', async () => {
      const c = await awaiting()
      await expect(svc.acknowledge(c._id, { recipientType: 'stranger', recipientId: 'x' })).rejects.toMatchObject({ status: 400 })
      await expect(svc.acknowledge(c._id, { recipientType: 'patient' })).rejects.toMatchObject({ status: 400 })
    })
  })

  describe('50: incident history', () => {
    it('lists only this patient, newest first, with paging', async () => {
      const patient = oid()
      const make = (status, createdAt, extra = {}) => EmergencyCase.collection.insertOne({ patient, source: 'manual_sos', severity: 'critical', status, createdAt, updatedAt: createdAt, escalation: {}, simulated: true, ...extra })
      await make('closed', new Date('2026-01-01'))
      await make('cancelled', new Date('2026-02-01'), { cancellation: { reason: 'other' } })
      await make('closed', new Date('2026-03-01'))
      await EmergencyCase.create({ patient: oid(), source: 'manual_sos', status: 'closed' }) // someone else's
      const page1 = await svc.history(patient, { page: 1, limit: 2 })
      expect(page1).toMatchObject({ total: 3, pages: 2, simulated: true })
      expect(page1.items.map((i) => new Date(i.createdAt).toISOString().slice(0, 7))).toEqual(['2026-03', '2026-02'])
      const page2 = await svc.history(patient, { page: 2, limit: 2 })
      expect(page2.items).toHaveLength(1)
    })

    it('active() returns the live case only', async () => {
      const c = await awaiting()
      expect((await svc.active(c.patient)).id).toBe(String(c._id))
      await svc.cancel(c._id, { reason: 'other' })
      expect(await svc.active(c.patient)).toBeNull()
    })
  })

  describe('the one-live-case rule holds across the whole flow', () => {
    it('after a cancel a new SOS opens a fresh case', async () => {
      const patient = oid()
      const first = await svc.sos(patient)
      await svc.cancel(first.case.id, { reason: 'false_alarm' })
      const second = await svc.sos(patient)
      expect(second.created).toBe(true)
      expect(second.case.id).not.toBe(first.case.id)
      expect(await EmergencyCase.countDocuments({ patient })).toBe(2)
    })
  })
})
