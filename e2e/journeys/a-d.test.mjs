// Journeys a-d. Each test boots its own empty database, server and browser context.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withStack, until, sleep } from '../harness/lib.mjs'
import { steps, openPatient, searchingBadge, RAHUL, ANANYA } from './steps.mjs'

const noProblems = (page) => assert.deepEqual(page.problems, [], `browser problems: ${page.problems.join(' | ')}`)

test('a. cardiac event: detected, patient confirms, hospital search starts, hospital accepts, family sees it', async () => {
  await withStack({ roundSeconds: 60 }, async ({ stack, browser }) => {
    const s = steps(stack)
    const page = await openPatient(browser, stack, RAHUL)
    await s.scenario(RAHUL, 'cardiac_event')

    // The alert and the "Are you okay?" screen appear by themselves.
    await page.getByRole('alert', { name: 'Automatic alert' }).waitFor({ timeout: 45000 })
    await page.getByText('Are you okay?').waitFor()
    await page.getByRole('button', { name: 'Send help now' }).click()
    await searchingBadge(page).waitFor()

    const c = await s.caseFor(RAHUL, { status: 'searching' })
    assert.equal(c.escalation.round, 1)
    await until(() => stack.notified.length >= 1, { what: 'hospital discovery to be called' })
    assert.equal(stack.notified[0].round, 1)
    assert.equal(stack.notified[0].radiusKm, 10)

    // FAKE hospital accepts; the patient's page follows without a reload.
    await s.call('POST', '/__e2e/hospital-accept', { caseId: c.id })
    await page.getByText(/accepted/i).first().waitFor({ timeout: 15000 })

    // Family: open the link from the WhatsApp message and tap "I have seen this".
    const view = await s.caseStatus(c.id)
    const link = decodeURIComponent(view.contactAlerts[0].whatsappLink)
    const token = link.match(/\/status\/([0-9a-f]{32})/)[1]
    const fam = await browser.newPage()
    await fam.goto(`${stack.url}/status/${token}`)
    await fam.getByRole('heading', { name: 'Emergency status' }).waitFor()
    await fam.getByRole('button', { name: 'I have seen this' }).click()
    await fam.getByText('You marked this as seen').waitFor()
    await page.getByText('Seen', { exact: true }).waitFor({ timeout: 15000 })
    noProblems(page)
  })
})

test('b. manual SOS: patient taps SOS and the search starts at once, with a location', async () => {
  await withStack({ roundSeconds: 60 }, async ({ stack, browser }) => {
    const s = steps(stack)
    const page = await openPatient(browser, stack, ANANYA)
    await page.getByRole('button', { name: 'Send emergency SOS' }).click()
    await page.getByRole('button', { name: 'Send SOS' }).click()
    await searchingBadge(page).waitFor()
    const c = await s.caseFor(ANANYA, { status: 'searching' })
    assert.equal(c.source, 'manual_sos')
    await until(() => stack.notified.length === 1, { what: 'one discovery call' })

    // No GPS in this browser: the manual fallback works and is stored.
    await page.getByLabel('Latitude').fill('18.5204')
    await page.getByLabel('Longitude').fill('73.8567')
    await page.getByRole('button', { name: 'Share this location' }).click()
    await until(async () => (await s.caseStatus(c.id)).location?.point?.coordinates?.[1] === 18.5204, { what: 'location stored' })
    noProblems(page)
  })
})

test("c. \"I'm okay\" inside the countdown: needs a reason, cancels, nobody is notified", async () => {
  await withStack({ roundSeconds: 60 }, async ({ stack, browser }) => {
    const s = steps(stack)
    const page = await openPatient(browser, stack, RAHUL)
    await s.scenario(RAHUL, 'cardiac_event')
    await page.getByRole('button', { name: /I.m okay: cancel/ }).click()
    const cancel = page.getByRole('button', { name: 'Cancel emergency' })
    assert.equal(await cancel.isDisabled(), true, 'cannot cancel without choosing a reason')
    await page.getByLabel('It was a false alarm').check()
    await cancel.click()
    await page.getByText(/Reason: It was a false alarm/).waitFor()
    const open = await s.active(RAHUL)
    assert.equal(open, null)
    assert.equal(stack.notified.length, 0, 'no hospital was contacted')
    const det = (await s.call('GET', `/api/detection/patients/${RAHUL}/detections`)).body
    const list = Array.isArray(det) ? det : det.items ?? det.detections
    assert.ok(['cancelled', 'false_alarm'].includes(list[0].outcome), `detection outcome ${list[0].outcome}`)
    noProblems(page)
  })
})

test('d. nobody answers: help is sent automatically after the countdown and contacts are alerted', async () => {
  await withStack({ roundSeconds: 60 }, async ({ stack, browser }) => {
    const s = steps(stack)
    const page = await openPatient(browser, stack, RAHUL)
    await s.scenario(RAHUL, 'cardiac_event')
    const created = await s.caseFor(RAHUL)
    const t0 = Date.now()
    const c = await s.caseFor(RAHUL, { status: 'searching' })
    const waited = Date.now() - t0
    assert.ok(waited >= 5000 && waited < 20000, `auto-send came after ${waited} ms, expected about 10 s from the case`)
    const alerted = await until(async () => { const v = await s.caseStatus(c.id); return v.contactAlerts.length ? v : null }, { what: 'contact alert' })
    assert.equal(alerted.contactAlerts.length, 1)
    assert.equal(alerted.contactAlerts[0].name, 'Meera Sharma')
    assert.ok(created.id === c.id)
    await searchingBadge(page).waitFor()
    assert.equal(stack.notified.length >= 1, true)
    noProblems(page)
  })
})
