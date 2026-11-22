// Failure modes: things that go wrong during a real emergency. Calling 112 must stay one tap away in all of them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withStack, until, sleep, openPage, DESKTOP } from '../harness/lib.mjs'
import { steps, openPatient, searchingBadge, RAHUL, ANANYA } from './steps.mjs'

test('F1. a Level 3 alert arrives while nobody has touched the page: no console errors, banner still shows', async () => {
  await withStack({ roundSeconds: 60 }, async ({ stack, browser }) => {
    const s = steps(stack)
    const page = await openPatient(browser, stack, RAHUL)
    await s.scenario(RAHUL, 'cardiac_event') // no click, no key press on the page
    await page.getByRole('alert', { name: 'Automatic alert' }).getByText('Level 3 Critical').waitFor({ timeout: 45000 })
    await sleep(1500)
    assert.deepEqual(page.problems, [], page.problems.join(' | '))
  })
})

test('F2. the backend goes away during the countdown: the page stays usable, 112 stays visible, and it recovers', async () => {
  await withStack({ roundSeconds: 60 }, async ({ stack, browser }) => {
    const s = steps(stack)
    const page = await openPatient(browser, stack, RAHUL)
    await s.scenario(RAHUL, 'cardiac_event')
    await page.getByText('Are you okay?').waitFor({ timeout: 45000 })
    await stack.down()
    await sleep(2500)
    assert.equal(await page.getByRole('link', { name: /Call 112/ }).first().isVisible(), true, '112 link visible while the server is down')
    await stack.start() // case was already stored: it resumes
    const c = await s.caseFor(RAHUL, { timeout: 25000 })
    assert.ok(c.id)
    await searchingBadge(page).waitFor({ timeout: 30000 })
  })
})

test('F3. "Send help now" fails with a server error: the patient sees an error and can still call 112', async () => {
  await withStack({ roundSeconds: 60 }, async ({ stack, browser }) => {
    const s = steps(stack)
    const page = await openPatient(browser, stack, RAHUL)
    await page.route('**/api/emergency/*/confirm', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Internal error"}' }))
    await s.scenario(RAHUL, 'cardiac_event')
    await page.getByText('Are you okay?').waitFor({ timeout: 45000 })
    await page.getByRole('button', { name: 'Send help now' }).click()
    await page.getByRole('alert').filter({ hasText: /Internal error|could not|try again/i }).first().waitFor({ timeout: 10000 })
    assert.equal(await page.getByRole('link', { name: /Call 112/ }).first().isVisible(), true)
    // The server's own timer still sends help when the countdown ends, even though the button failed.
    await s.caseFor(RAHUL, { status: 'searching', timeout: 25000 })
  })
})

test('F4. a second SOS while one is open does not open a second case', async () => {
  await withStack({ roundSeconds: 60 }, async ({ stack }) => {
    const s = steps(stack)
    const one = await s.call('POST', '/api/emergency/sos', { patient: ANANYA })
    const two = await s.call('POST', '/api/emergency/sos', { patient: ANANYA })
    assert.ok([200, 201, 409].includes(two.status), `status ${two.status}`)
    const all = (await s.call('GET', '/__e2e/db-cases')).body.filter((c) => c.patientCode === ANANYA)
    assert.equal(all.length, 1)
    assert.ok(one.status < 300)
  })
})

test('F5. a family link that is wrong or made up shows "not valid" and leaks nothing', async () => {
  await withStack({}, async ({ stack, browser }) => {
    const page = await openPage(browser, DESKTOP)
    await page.goto(`${stack.url}/status/${'0'.repeat(32)}`)
    await page.getByText('This status link is not valid.').waitFor()
    const body = await page.innerText('body')
    assert.doesNotMatch(body, /Rahul|Ananya|Vikram|HT-2026/)
  })
})

test('F6. hospital accepts and the patient cancels at the same moment: exactly one final state, consistent everywhere', async () => {
  await withStack({ roundSeconds: 60 }, async ({ stack }) => {
    const s = steps(stack)
    const sos = (await s.call('POST', '/api/emergency/sos', { patient: ANANYA })).body
    const caseId = sos.case?.id ?? sos.id
    await until(async () => (await s.caseStatus(caseId)).status === 'searching', { what: 'searching' })
    const [acc, can] = await Promise.all([
      s.call('POST', '/__e2e/hospital-accept', { caseId }),
      s.call('POST', `/api/emergency/${caseId}/cancel`, { reason: 'false_alarm' }),
    ])
    const final = await s.dbCase(caseId)
    assert.ok(['accepted', 'cancelled'].includes(final.status), `final ${final.status}`)
    if (final.status === 'accepted') assert.ok(acc.body.ok)
    const types = final.timeline.map((t) => t.type)
    assert.equal(types.filter((t) => t === 'cancelled').length, final.status === 'cancelled' ? 1 : 0)
    void can
  })
})

test('F7. presenter key is enforced when set: no key means no scenario change', async () => {
  await withStack({ presenterKey: 'e2e-secret' }, async ({ stack }) => {
    const s = steps(stack)
    const denied = await s.scenario(RAHUL, 'cardiac_event')
    assert.ok([401, 403].includes(denied.status), `status ${denied.status}`)
    const ok = await fetch(`${stack.url}/api/sim/patients/${stack.ids[RAHUL]}/scenario`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-presenter-key': 'e2e-secret' }, body: '{"scenario":"stable"}' })
    assert.equal(ok.status, 200)
  })
})

test('F8. the patient has no allergy record: first aid never suggests aspirin (missing means hidden)', async () => {
  await withStack({}, async ({ stack, browser }) => {
    const s = steps(stack)
    const sos = (await s.call('POST', '/api/emergency/sos', { patient: RAHUL })).body
    const page = await openPatient(browser, stack, RAHUL)
    await page.getByText('First aid while you wait').waitFor({ timeout: 20000 })
    assert.doesNotMatch(await page.innerText('body'), /aspirin/i)
    const ana = await openPatient(browser, stack, ANANYA)
    await s.call('POST', '/api/emergency/sos', { patient: ANANYA })
    await ana.getByText(/aspirin/i).first().waitFor({ timeout: 15000 })
    void sos
  })
})
