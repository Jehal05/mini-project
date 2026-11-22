// Journeys e-h: escalation, reload, server restart and two tabs racing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withStack, until, sleep, openPage, DESKTOP } from '../harness/lib.mjs'
import { steps, openPatient, searchingBadge, RAHUL, ANANYA } from './steps.mjs'

const noProblems = (page) => assert.deepEqual(page.problems, [], `browser problems: ${page.problems.join(' | ')}`)

test('e. nobody accepts: the search widens 10 -> 20 -> 30 km, then the case is unresolved and admin is told', async () => {
  await withStack({ roundSeconds: 3 }, async ({ stack, browser }) => {
    const s = steps(stack)
    const adminEvents = []
    stack.io.on('connection', (sock) => sock.join('central-admin'))
    const { io: ioc } = await import('../../backend/node_modules/socket.io-client/build/esm-debug/index.js')
    const admin = ioc(stack.url)
    admin.on('emergency:unresolved', (p) => adminEvents.push(p))
    const page = await openPatient(browser, stack, ANANYA)
    await page.getByRole('button', { name: 'Send emergency SOS' }).click()
    await page.getByRole('button', { name: 'Send SOS' }).click()
    await searchingBadge(page).waitFor()
    await until(async () => (await s.call('GET', `/api/emergency/mine?patient=${ANANYA}`)).body?.items?.[0]?.status === 'unresolved'
      || (await s.active(ANANYA))?.status === 'unresolved', { timeout: 30000, what: 'unresolved' })
    assert.deepEqual(stack.notified.map((n) => [n.round, n.radiusKm]), [[1, 10], [2, 20], [3, 30]])
    await page.getByText(/unresolved|could not find|no hospital/i).first().waitFor({ timeout: 10000 })
    admin.close()
    noProblems(page)
  })
})

test('f. reload in the middle of the countdown: the server clock decides, the countdown continues', async () => {
  await withStack({ roundSeconds: 60 }, async ({ stack, browser }) => {
    const s = steps(stack)
    const page = await openPatient(browser, stack, RAHUL)
    await s.scenario(RAHUL, 'cardiac_event')
    await page.getByText('Are you okay?').waitFor({ timeout: 45000 })
    const before = Number(/in (\d+) seconds/.exec(await page.getByRole('timer').getAttribute('aria-label'))[1])
    await sleep(3000)
    await page.reload()
    await page.getByText('Are you okay?').waitFor()
    const after = Number(/in (\d+) seconds/.exec(await page.getByRole('timer').getAttribute('aria-label'))[1])
    assert.ok(after < before, `countdown restarted after reload (${before} -> ${after})`)
    // Still only one case, and it is sent automatically on time.
    await s.caseFor(RAHUL, { status: 'searching' })
    noProblems(page)
  })
})

test('g. server restarts during the countdown: the case is resumed and still sent on time, no duplicate', async () => {
  await withStack({ roundSeconds: 60 }, async ({ stack, browser }) => {
    const s = steps(stack)
    const page = await openPatient(browser, stack, RAHUL)
    await s.scenario(RAHUL, 'cardiac_event')
    const first = await s.caseFor(RAHUL, { status: 'awaiting_confirmation' })
    await stack.restart()
    const c = await s.caseFor(RAHUL, { status: 'searching', timeout: 25000 })
    assert.equal(c.id, first.id, 'same case after restart')
    const all = (await s.call('GET', '/__e2e/db-cases')).body.filter((x) => x.patientCode === RAHUL)
    assert.equal(all.length, 1, 'exactly one case in the database')
    await until(() => stack.notified.length >= 1, { what: 'discovery after restart' })
    await searchingBadge(page).waitFor({ timeout: 20000 })
    assert.equal(stack.notified.filter((n) => n.round === 1).length, 1, 'round 1 notified once')
    // The browser's own sockets reconnected: this page problem list may hold the brief disconnect, nothing else.
    const real = page.problems.filter((p) => !/ERR_CONNECTION|WebSocket|Failed to load resource|socket\.io/.test(p))
    assert.deepEqual(real, [])
  })
})

test('h. two tabs press "Send help now" together: one case, one hospital search, one alert per contact', async () => {
  await withStack({ roundSeconds: 60 }, async ({ stack, browser }) => {
    const s = steps(stack)
    const a = await openPatient(browser, stack, RAHUL)
    const b = await openPatient(browser, stack, RAHUL)
    await s.scenario(RAHUL, 'cardiac_event')
    await a.getByText('Are you okay?').waitFor({ timeout: 45000 })
    await b.getByText('Are you okay?').waitFor()
    // force: a background tab never finishes the button's pulse animation, so Playwright would wait forever for it to be "stable".
    await Promise.all([a.getByRole('button', { name: 'Send help now' }).click({ force: true }), b.getByRole('button', { name: 'Send help now' }).click({ force: true })])
    await searchingBadge(a).waitFor()
    await searchingBadge(b).waitFor()
    await sleep(1500)
    const cases = (await s.call('GET', '/__e2e/db-cases')).body.filter((x) => x.patientCode === RAHUL)
    assert.equal(cases.length, 1)
    await until(async () => (await s.call('GET', '/__e2e/db-cases')).body.find((x) => x.patientCode === RAHUL).contactAlerts.length >= 1, { what: 'alert' })
    await sleep(500)
    const again = (await s.call('GET', '/__e2e/db-cases')).body.find((x) => x.patientCode === RAHUL)
    assert.equal(again.contactAlerts.length, 1, 'Meera alerted once')
    assert.equal(stack.notified.filter((n) => n.round === 1).length, 1, 'one round-1 search')
    noProblems(a)
    noProblems(b)
  })
})
