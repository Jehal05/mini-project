// The whole Rahul story in a real browser against the integrated server: log in, collapse, send help,
// hospital staff accept, the ambulance drives, the crew confirm arrival. No fakes, no presenter key.
import test from 'node:test'
import assert from 'node:assert/strict'
import { startIntegrated } from '../harness/integrated.mjs'
import { launch, openPage, until, MOBILE, DESKTOP } from '../harness/lib.mjs'

async function signIn(page, url, portal, email, password) {
  await page.goto(`${url}/login${portal === 'Patient' ? '' : `?portal=${{ 'Hospital staff': 'staff', Admin: 'admin' }[portal]}`}`)
  page.problems.length = 0 // the first visit probes for a session and rightly gets a 401: not a problem
  await page.getByLabel('Email or phone').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: /^Sign in as/ }).click()
  await page.waitForURL(/\/(patient|hospital|admin)/)
  await page.waitForLoadState('networkidle')
  page.problems.length = 0 // the session probe before sign-in rightly answers 401
}

test('Rahul: collapse -> help sent -> hospital accepts -> ambulance -> arrival', { timeout: 200000 }, async () => {
  const stack = await startIntegrated()
  const browser = await launch()
  const pages = []
  try {
    const rahul = await openPage(browser, MOBILE); pages.push(rahul)
    const staff = await openPage(browser, DESKTOP); pages.push(staff)

    await signIn(rahul, stack.url, 'Patient', 'rahul.sharma@example.com', stack.password)
    await rahul.goto(`${stack.url}/patient/monitor`)
    await rahul.getByText('Emergency detection').first().waitFor()

    await signIn(staff, stack.url, 'Hospital staff', 'staff@healthtwin.example', stack.password)

    // The presenter (central admin) switches Rahul to a cardiac event, through the real admin login.
    const admin = await stack.login('admin', 'admin@healthtwin.example')
    const me = (await stack.call('GET', '/api/sim/patients', null, admin.accessToken)).body
    const list = me.patients ?? me.items ?? me
    const rahulRow = list.find((p) => p.patientCode === 'HT-2026-0001') ?? list[0]
    assert.equal((await stack.call('POST', `/api/sim/patients/${rahulRow.id ?? rahulRow._id ?? rahulRow.patientCode}/scenario`, { scenario: 'cardiac_event' }, admin.accessToken)).status, 200)

    await rahul.getByRole('button', { name: 'Send help now' }).click({ timeout: 90000 })
    await staff.getByRole('alertdialog').waitFor({ timeout: 30000 })
    await staff.getByRole('link', { name: /open|view|case/i }).first().click().catch(() => {})
    await staff.getByRole('button', { name: 'Accept emergency' }).click({ timeout: 30000 })

    await rahul.getByText(/accepted|on the way|ambulance/i).first().waitFor({ timeout: 30000 })

    await staff.goto(`${stack.url}/hospital/crew`)
    // The simulator drives the legs it can (it reaches the patient by itself); the crew press the buttons that are theirs.
    const crewButtons = ['We are at the patient', 'Patient on board', 'Leaving for the hospital', 'We are at the hospital']
    const arrival = staff.getByRole('button', { name: 'Confirm arrival' })
    await until(async () => {
      if (await arrival.isVisible()) return true
      for (const name of crewButtons) {
        const b = staff.getByRole('button', { name })
        if (await b.isVisible() && await b.isEnabled()) { await b.click(); break }
      }
      return false
    }, { timeout: 120000, every: 400, what: 'the crew to reach the hospital' })
    await staff.getByRole('button', { name: 'Confirm arrival' }).click()
    await until(async () => (await stack.mongoose.connection.db.collection('emergencycases').findOne({}))?.status === 'arrived', { what: 'case arrived', timeout: 20000 })

    for (const p of pages) assert.deepEqual(p.problems, [], p.problems.join('\n'))
  } catch (e) {
    for (const p of pages) console.error(p.url(), '\n', (await p.locator('body').innerText().catch(() => '')).slice(0, 700), '\n', p.problems)
    throw e
  } finally {
    await browser.close(); await stack.stop()
  }
})
