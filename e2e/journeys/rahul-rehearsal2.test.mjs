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

test('Rehearsal 2: first hospital rejects, the next accepts', { timeout: 200000 }, async () => {
  const stack = await startIntegrated()
  const browser = await launch()
  const pages = []
  try {
    const rahul = await openPage(browser, MOBILE); pages.push(rahul)
    const staffA = await openPage(browser, DESKTOP); pages.push(staffA)
    const staffB = await openPage(browser, DESKTOP); pages.push(staffB)
    const db = stack.mongoose.connection.db

    await signIn(rahul, stack.url, 'Patient', 'rahul.sharma@example.com', stack.password)
    await rahul.goto(`${stack.url}/patient/monitor`)
    await rahul.getByText('Emergency detection').first().waitFor()
    await signIn(staffA, stack.url, 'Hospital staff', 'staff@healthtwin.example', stack.password)

    const admin = await stack.login('admin', 'admin@healthtwin.example')
    const body = (await stack.call('GET', '/api/sim/patients', null, admin.accessToken)).body
    const list = body.patients ?? body.items ?? body
    const row = list.find((p) => p.patientCode === 'HT-2026-0001') ?? list[0]
    assert.equal((await stack.call('POST', `/api/sim/patients/${row.id ?? row._id ?? row.patientCode}/scenario`, { scenario: 'cardiac_event' }, admin.accessToken)).status, 200)

    await rahul.getByRole('button', { name: 'Send help now' }).click({ timeout: 90000 })

    await rahul.goto(`${stack.url}/patient/emergency`)
    await rahul.waitForLoadState('networkidle')

    // Hospital A turns the case down.
    await staffA.getByRole('alertdialog').waitFor({ timeout: 30000 })
    await staffA.getByRole('button', { name: 'Reject', exact: true }).click()
    await staffA.getByLabel('Reason for rejecting').selectOption('no_beds')
    await staffA.getByRole('button', { name: 'Confirm rejection' }).click()

    // The patient is told, and another hospital is now asked.
    await rahul.getByText(/could not take (you|your case)/i).first().waitFor({ timeout: 30000 })
    let next
    await until(async () => {
      const c = await db.collection('emergencycases').findOne({})
      next = c?.hospitalResponses?.find((r) => r.status === 'notified')
      return Boolean(next) && c.hospitalResponses.some((r) => r.status === 'rejected' && r.rejectReason === 'no_beds')
    }, { what: 'a second hospital to be asked', timeout: 30000 })

    // Staff of that second hospital sign in and accept.
    const User = stack.mongoose.model('User')
    const passwordHash = await bcrypt.hash(stack.password, 4)
    await User.create({ name: 'Second hospital staff (demo)', email: 'staff.b@healthtwin.example', role: 'hospital_staff', passwordHash, hospitalId: next.hospital })
    await signIn(staffB, stack.url, 'Hospital staff', 'staff.b@healthtwin.example', stack.password)
    await staffB.getByRole('alertdialog').waitFor({ timeout: 30000 })
    await staffB.getByRole('button', { name: 'Accept emergency' }).click()

    await until(async () => String((await db.collection('emergencycases').findOne({}))?.acceptedHospital) === String(next.hospital), { what: 'the second hospital to be recorded as accepting', timeout: 20000 })
    await rahul.getByText(/accepted|on the way|ambulance/i).first().waitFor({ timeout: 30000 })
    for (const p of pages) assert.deepEqual(p.problems, [], p.problems.join('\n'))
  } catch (e) {
    for (const p of pages) console.error(p.url(), '\n', (await p.locator('body').innerText().catch(() => '')).slice(0, 700), '\n', p.problems)
    throw e
  } finally {
    await browser.close(); await stack.stop()
  }
})
