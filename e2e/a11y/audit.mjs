// Quality gates in a real browser: for every screen/state, on mobile (390) and desktop (1366):
// axe (WCAG 2 A/AA), a screenshot, the simulated label, and no console errors. Plus one keyboard-only SOS run.
// Writes results/quality.json and screenshots to SHOTS (default /home/claude/shots/p12).
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { withStack, openPage, MOBILE, DESKTOP, until, sleep } from '../harness/lib.mjs'
import { steps, RAHUL, ANANYA } from '../journeys/steps.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = process.env.SHOTS ?? '/home/claude/shots/p12'
const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js')
fs.mkdirSync(SHOTS, { recursive: true })

const SIM = /simulated/i
async function check(page, state, vp, out) {
  await page.addScriptTag({ path: axePath })
  const res = await page.evaluate(() => globalThis.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }))
  const text = await page.innerText('body')
  const file = `${state}-${vp}.png`
  await page.screenshot({ path: path.join(SHOTS, file), fullPage: true })
  out.push({
    state, viewport: vp, screenshot: file,
    simulatedLabel: SIM.test(text),
    axeViolations: res.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help, sample: v.nodes[0]?.target?.join(' ') })),
    horizontalScroll: await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1),
  })
}

async function runViewport(vpName, viewport, out, keyboard) {
  await withStack({ roundSeconds: 7 }, async ({ stack, browser }) => {
    const s = steps(stack)
    const page = await openPage(browser, viewport)
    const snap = (state) => check(page, state, vpName, out)
    await page.goto(`${stack.url}/patient/${RAHUL}`)
    await page.getByRole('button', { name: 'Send emergency SOS' }).waitFor()
    await sleep(1200)
    await snap('01-dashboard-idle')

    await page.getByRole('button', { name: 'Send emergency SOS' }).click()
    await page.getByRole('button', { name: 'Send SOS' }).waitFor()
    await snap('02-sos-dialog')
    await page.getByRole('button', { name: 'Not now' }).click()

    await s.scenario(RAHUL, 'cardiac_event')
    await page.getByRole('alert', { name: 'Automatic alert' }).waitFor({ timeout: 45000 })
    await snap('03-level-alert')
    await page.getByText('Are you okay?').waitFor({ timeout: 45000 })
    await snap('04-are-you-okay-countdown')
    await page.getByRole('button', { name: 'Send help now' }).click()
    await page.getByRole('region', { name: 'Emergency status' }).getByText('Looking for a hospital', { exact: true }).first().waitFor()
    await snap('05-searching')
    await page.getByRole('button', { name: 'Cancel emergency…' }).click()
    await page.getByText('Cancel this emergency?').waitFor()
    await snap('06-cancel-dialog')
    await page.getByRole('button', { name: 'Keep it open' }).click()
    const c = await s.caseFor(RAHUL)
    const view = await s.caseStatus(c.id)
    await s.call('POST', '/__e2e/hospital-accept', { caseId: c.id })
    await page.getByText(/accepted/i).first().waitFor({ timeout: 15000 })
    await snap('07-hospital-accepted')
    const token = decodeURIComponent(view.contactAlerts[0].whatsappLink).match(/\/status\/([0-9a-f]{32})/)[1]
    const fam = await openPage(browser, viewport)
    await fam.goto(`${stack.url}/status/${token}`)
    await fam.getByRole('heading', { name: 'Emergency status' }).waitFor()
    await check(fam, '08-family-status', vpName, out)
    await fam.goto(`${stack.url}/status/${'1'.repeat(32)}`)
    await fam.getByText('This status link is not valid.').waitFor()
    await check(fam, '09-family-invalid-link', vpName, out)
    await s.call('POST', `/api/emergency/${c.id}/cancel`, { reason: 'false_alarm' })
    await page.getByText(/Reason: It was a false alarm/).waitFor({ timeout: 15000 })
    await snap('10-cancelled')

    const pres = await openPage(browser, viewport)
    await pres.goto(`${stack.url}/presenter`)
    await pres.getByText(/Presenter|scenario/i).first().waitFor()
    await sleep(800)
    await check(pres, '11-presenter-panel', vpName, out)

    // Unresolved: nobody accepts for three short rounds.
    const ana = await openPage(browser, viewport)
    await ana.goto(`${stack.url}/patient/${ANANYA}`)
    await s.call('POST', '/api/emergency/sos', { patient: ANANYA })
    await until(async () => (await s.active(ANANYA))?.status === 'unresolved', { timeout: 40000, what: 'unresolved' })
    await sleep(1500)
    await check(ana, '12-unresolved', vpName, out)
    for (const p of [page, fam, pres, ana]) keyboard.problems.push(...p.problems.map((x) => `${vpName}: ${x}`))
  })
}

async function keyboardRun() {
  // Keyboard only: reach SOS, open it, send it, with Tab and Enter. No mouse.
  let result
  await withStack({ roundSeconds: 60 }, async ({ stack, browser }) => {
    const s = steps(stack)
    const page = await openPage(browser, MOBILE)
    await page.goto(`${stack.url}/patient/${ANANYA}`)
    await page.getByRole('button', { name: 'Send emergency SOS' }).waitFor()
    const tabTo = async (name, max = 80) => {
      for (let i = 1; i <= max; i++) {
        await page.keyboard.press('Tab')
        const label = await page.evaluate(() => { const e = document.activeElement; return (e.getAttribute('aria-label') || e.innerText || '').trim() })
        if (label.startsWith(name)) return i
      }
      throw new Error(`Could not reach "${name}" with Tab in ${max} presses`)
    }
    const t1 = await tabTo('Send emergency SOS')
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: 'Send SOS' }).waitFor()
    const focusInDialog = await until(() => page.evaluate(() => Boolean(document.activeElement.closest('[role="dialog"], [role="alertdialog"]'))), { timeout: 2000, what: 'focus inside the dialog' }).catch(() => false)
    const t2 = await tabTo('Send SOS', 10)
    await page.keyboard.press('Enter')
    await s.caseFor(ANANYA, { status: 'searching' })
    await page.getByRole('region', { name: 'Emergency status' }).getByText('Looking for a hospital', { exact: true }).first().waitFor()
    result = { tabsToSosButton: t1, focusMovedIntoDialog: focusInDialog, tabsToSendInsideDialog: t2, caseOpened: true, problems: page.problems }
  })
  return result
}

const out = []
const problems = { problems: [] }
await runViewport('mobile-390', MOBILE, out, problems)
await runViewport('desktop-1366', DESKTOP, out, problems)
const keyboard = await keyboardRun()
const summary = {
  states: out.length,
  statesMissingSimulatedLabel: out.filter((r) => !r.simulatedLabel).map((r) => `${r.state}@${r.viewport}`),
  horizontalScroll: out.filter((r) => r.horizontalScroll).map((r) => `${r.state}@${r.viewport}`),
  axeTotal: out.reduce((n, r) => n + r.axeViolations.length, 0),
  axeSeriousOrCritical: out.flatMap((r) => r.axeViolations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${r.state}@${r.viewport}: ${v.id}`)),
  consoleAndPageErrors: problems.problems,
}
fs.writeFileSync(path.join(here, '../results/quality.json'), JSON.stringify({ summary, keyboard, out }, null, 2))
console.log(JSON.stringify({ summary, keyboard }, null, 2))
console.log(out.filter((r) => r.axeViolations.length).map((r) => `${r.state}@${r.viewport}: ` + r.axeViolations.map((v) => `${v.id}(${v.impact}) ${v.sample}`).join('; ')).join('\n'))
