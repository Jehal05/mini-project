// Security spot-check of the interim guards on the Daksh track. Ownership checks need Jehal's auth
// (TODO(Jehal)); what is checked here is what this branch promises today.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withStack } from '../harness/lib.mjs'
import { steps, RAHUL, ANANYA } from './steps.mjs'

async function openCase(s, code, location) {
  const r = await s.call('POST', '/api/emergency/sos', { patient: code, ...(location && { location }) })
  assert.ok(r.status < 300, `sos ${r.status} ${JSON.stringify(r.body)}`)
  return r.body.case ?? r.body
}

test('S1. the family page shows what a relative needs and nothing else', async () => {
  await withStack({}, async ({ stack }) => {
    const s = steps(stack)
    const c = await openCase(s, RAHUL)
    await s.call('PUT', `/api/emergency/${c.id}/symptoms`, { symptoms: { chestPain: true } })
    await s.call('POST', `/api/emergency/${c.id}/confirm`, { symptoms: { chestPain: true } })
    const full = (await s.call('GET', `/api/emergency/${c.id}`)).body
    const token = decodeURIComponent(full.contactAlerts[0].whatsappLink).match(/\/status\/([0-9a-f]{32})/)[1]
    const pub = (await s.call('GET', `/api/emergency/status/${token}`)).body
    const text = JSON.stringify(pub)
    for (const secret of [stack.ids[RAHUL], 'dateOfBirth', 'bloodGroup', 'allergies', 'medications', 'emergencyContacts', 'meera.demo@example.com', '+919800000001', 'symptoms', token]) {
      assert.ok(!text.includes(secret), `family response leaks ${secret}`)
    }
    assert.ok(pub.patientName && pub.status)
  })
})

test('S2. the case view never exposes a status-link token as a field (only inside the wa.me message)', async () => {
  await withStack({}, async ({ stack }) => {
    const s = steps(stack)
    const c = await openCase(s, RAHUL)
    await s.call('POST', `/api/emergency/${c.id}/confirm`, { symptoms: {} })
    const view = (await s.call('GET', `/api/emergency/${c.id}`)).body
    assert.ok(!JSON.stringify(view).includes('statusLinkToken'))
    for (const a of view.contactAlerts) assert.deepEqual(Object.keys(a).sort(), ['channels', 'name', 'relation', 'sentAt', 'whatsappLink'].sort())
  })
})

test('S3. tokens are 128-bit random and wrong ones are 404', async () => {
  await withStack({}, async ({ stack }) => {
    const s = steps(stack)
    const tokens = new Set()
    for (const code of [RAHUL, ANANYA]) {
      const c = await openCase(s, code)
      await s.call('POST', `/api/emergency/${c.id}/confirm`, { symptoms: {} })
      const v = (await s.call('GET', `/api/emergency/${c.id}`)).body
      for (const a of v.contactAlerts) tokens.add(decodeURIComponent(a.whatsappLink).match(/\/status\/([0-9a-f]+)/)[1])
    }
    assert.equal(tokens.size, 2)
    for (const t of tokens) assert.equal(t.length, 32)
    for (const bad of ['0'.repeat(32), 'abc', "' OR 1=1", '../etc/passwd']) {
      const r = await s.call('GET', `/api/emergency/status/${encodeURIComponent(bad)}`)
      assert.equal(r.status, 404, `${bad} -> ${r.status}`)
    }
  })
})

test('S4. query and body operators are rejected, not run as database queries (NoSQL injection)', async () => {
  await withStack({}, async ({ stack }) => {
    const s = steps(stack)
    const c = await openCase(s, RAHUL)
    const inj = await fetch(`${stack.url}/api/emergency/active?patient[$ne]=x`)
    assert.ok([400, 404].includes(inj.status), `active with operator -> ${inj.status}`)
    const cancel = await s.call('POST', `/api/emergency/${c.id}/cancel`, { reason: { $ne: 'x' } })
    assert.equal(cancel.status, 400)
    const tok = await fetch(`${stack.url}/api/emergency/status/%7B%22$ne%22:1%7D`)
    assert.equal(tok.status, 404)
    const still = await s.active(RAHUL)
    assert.ok(still, 'case is untouched')
  })
})

test('S5. bad ids, ranges and sizes are 4xx with a plain message, never a 500 or a stack trace', async () => {
  await withStack({}, async ({ stack }) => {
    const s = steps(stack)
    const c = await openCase(s, RAHUL)
    const cases = [
      ['GET', '/api/emergency/not-an-id'],
      ['POST', '/api/emergency/not-an-id/cancel', { reason: 'false_alarm' }],
      ['PUT', `/api/emergency/${c.id}/location`, { lat: 999, lng: 0 }],
      ['PUT', `/api/emergency/${c.id}/location`, { lat: 'x', lng: 'y' }],
      ['POST', `/api/emergency/${c.id}/cancel`, { reason: 'because', note: 'x'.repeat(5000) }],
      ['POST', '/api/emergency/sos', { patient: 'no-such-patient' }],
    ]
    for (const [m, p, b] of cases) {
      const r = await s.call(m, p, b)
      assert.ok(r.status >= 400 && r.status < 500, `${m} ${p} -> ${r.status}`)
      assert.ok(!/\\n\s+at \S+ \(|node_modules|\.js:\d+:\d+/.test(JSON.stringify(r.body)), `stack trace in ${m} ${p}`)
    }
  })
})

test('S6. a cancelled case cannot be revived or re-sent by replaying requests', async () => {
  await withStack({}, async ({ stack }) => {
    const s = steps(stack)
    const c = await openCase(s, RAHUL)
    const before = stack.notified.length // a manual SOS goes straight to the search
    await s.call('POST', `/api/emergency/${c.id}/cancel`, { reason: 'false_alarm' })
    const again = await s.call('POST', `/api/emergency/${c.id}/confirm`, { symptoms: {} })
    const final = await s.dbCase(c.id)
    assert.equal(final.status, 'cancelled', `confirm after cancel -> ${again.status}, status ${final.status}`)
    assert.equal(stack.notified.length, before, 'no new hospital search after the cancel')
  })
})

test('S7. the built frontend ships no secrets and talks only to its own origin', async () => {
  const fs = await import('node:fs')
  const path = await import('node:path')
  const dist = path.resolve(import.meta.dirname, '../dist/assets')
  const all = fs.readdirSync(dist).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(dist, f), 'utf8')).join('\n')
  assert.ok(!/PRESENTER_KEY\s*[:=]\s*['"][^'"]+['"]/.test(all), 'a presenter key is baked into the bundle')
  assert.ok(!/mongodb(\+srv)?:\/\//.test(all), 'a database URL is in the bundle')
  assert.ok(!/localhost:4000/.test(all), 'the bundle points at a hard-coded dev server (build used the default VITE_API_URL)')
})
