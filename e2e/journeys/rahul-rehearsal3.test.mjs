// Rehearsal run 2 in a real browser: the first hospital rejects, the case escalates to another hospital that accepts.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startIntegrated } from '../harness/integrated.mjs'
import { launch, openPage, until, MOBILE, DESKTOP } from '../harness/lib.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const bcrypt = createRequire(path.join(root, 'backend/package.json'))('bcryptjs')

async function signIn(page, url, portal, email, password) {
  await page.goto(`${url}/login${portal === 'Patient' ? '' : '?portal=staff'}`)
  await page.getByLabel('Email or phone').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: /^Sign in as/ }).click()
  await page.waitForURL(/\/(patient|hospital)/)
  await page.waitForLoadState('networkidle')
  page.problems.length = 0
}

test('Rehearsal 3: nobody answers, the search widens, then a hospital accepts', { timeout: 200000 }, async () => {
  const stack = await startIntegrated({ roundTimeoutMs: 6000 })
  const browser = await launch()
  const pages = []
  try {
    const rahul = await openPage(browser, MOBILE); pages.push(rahul)
    const staff = await openPage(browser, DESKTOP); pages.push(staff)
    const db = stack.mongoose.connection.db

    await signIn(rahul, stack.url, 'Patient', 'rahul.sharma@example.com', stack.password)
    await rahul.goto(`${stack.url}/patient/monitor`)
    await rahul.getByText('Emergency detection').first().waitFor()
    await signIn(staff, stack.url, 'Hospital staff', 'staff@healthtwin.example', stack.password)

    const admin = await stack.login('admin', 'admin@healthtwin.example')
    const body = (await stack.call('GET', '/api/sim/patients', null, admin.accessToken)).body
    const list = body.patients ?? body.items ?? body
    const row = list.find((p) => p.patientCode === 'HT-2026-0001') ?? list[0]
    assert.equal((await stack.call('POST', `/api/sim/patients/${row.id ?? row._id ?? row.patientCode}/scenario`, { scenario: 'cardiac_event' }, admin.accessToken)).status, 200)

    await rahul.getByRole('button', { name: 'Send help now' }).click({ timeout: 90000 })
    await rahul.goto(`${stack.url}/patient/emergency`)
    await rahul.waitForLoadState('networkidle')

    // Nobody answers: after one round the search widens to 20 km and the timeline says so.
    await until(async () => (await db.collection('emergencycases').findOne({}))?.escalation?.round >= 2, { what: 'the search to widen', timeout: 40000 })
    const c = await db.collection('emergencycases').findOne({})
    assert.ok(c.timeline.some((e) => e.type === 'escalated' && /20 km/.test(e.text ?? e.message ?? JSON.stringify(e))), 'escalation recorded in the timeline')
    await rahul.getByRole('region', { name: 'Hospitals contacted' }).waitFor()

    // The hospital then answers in time for round 2.
    await staff.getByRole('alertdialog').waitFor({ timeout: 30000 })
    await staff.getByRole('button', { name: 'Accept emergency' }).click()
    await until(async () => (await db.collection('emergencycases').findOne({}))?.status !== 'searching', { what: 'a hospital to accept', timeout: 20000 })
    await rahul.getByText(/accepted|on the way|ambulance/i).first().waitFor({ timeout: 30000 })
    for (const p of pages) assert.deepEqual(p.problems, [], p.problems.join('\n'))
  } catch (e) {
    for (const p of pages) console.error(p.url(), '\n', (await p.locator('body').innerText().catch(() => '')).slice(0, 700), '\n', p.problems)
    throw e
  } finally {
    await browser.close(); await stack.stop()
  }
})
