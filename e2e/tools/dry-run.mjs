// Runs the presenter script end to end in a real browser, three times, and records how long each beat takes.
// The 10 s "Are you okay?" countdown and the detection time are real; nothing is sped up except the
// simulation tick (2 s, same as the demo).   npm run dry-run
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startHarness } from '../harness/server.mjs'
import { launch, openPage, DESKTOP } from '../harness/lib.mjs'
import { RAHUL } from '../journeys/steps.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const RUNS = Number(process.env.RUNS ?? 3)

async function once() {
  const marks = []
  const t0 = Date.now()
  const mark = (name) => marks.push({ step: name, atSeconds: +((Date.now() - t0) / 1000).toFixed(1) })
  const stack = await startHarness({ roundSeconds: 25, tickMs: 2000 })
  const resetSeconds = +((Date.now() - t0) / 1000).toFixed(1)
  const browser = await launch()
  const t1 = Date.now()
  const mark2 = (name) => marks.push({ step: name, atSeconds: +((Date.now() - t1) / 1000).toFixed(1) })
  try {
    const patient = await openPage(browser, DESKTOP)
    const presenter = await openPage(browser, DESKTOP)
    const hospital = await openPage(browser, DESKTOP)
    await patient.goto(`${stack.url}/patient/${RAHUL}`)
    await patient.getByRole('button', { name: 'Send emergency SOS' }).waitFor()
    mark2('1 patient dashboard open')
    await presenter.goto(`${stack.url}/presenter`)
    const group = presenter.getByRole('group', { name: 'Scenario for Rahul Sharma' })
    await group.getByRole('button', { name: 'Cardiac event' }).click()
    mark2('2 presenter switches Rahul to "Cardiac event"')
    await patient.getByRole('alert', { name: 'Automatic alert' }).waitFor({ timeout: 60000 })
    mark2('3 Level 2 alert on the patient screen')
    await patient.getByText('Are you okay?').waitFor({ timeout: 60000 })
    mark2('4 Level 3: "Are you okay?" + 10 s countdown')
    await patient.getByRole('button', { name: 'Send help now' }).click()
    await patient.getByRole('region', { name: 'Emergency status' }).getByText('Looking for a hospital', { exact: true }).first().waitFor()
    mark2('5 patient taps "Send help now": searching 10 km')
    await hospital.goto(`${stack.url}/__e2e/hospital`)
    await hospital.getByRole('button', { name: 'Accept this emergency' }).click()
    await patient.getByText(/accepted/i).first().waitFor({ timeout: 15000 })
    mark2('6 FAKE hospital accepts: patient screen follows')
    const view = (await (await fetch(`${stack.url}/api/emergency/active?patient=${RAHUL}`)).json()).case
    const full = await (await fetch(`${stack.url}/api/emergency/${view.id}`)).json()
    const token = decodeURIComponent(full.contactAlerts[0].whatsappLink).match(/\/status\/([0-9a-f]{32})/)[1]
    const family = await openPage(browser, DESKTOP)
    await family.goto(`${stack.url}/status/${token}`)
    await family.getByRole('button', { name: 'I have seen this' }).click()
    await patient.getByText('Seen', { exact: true }).waitFor({ timeout: 15000 })
    mark2('7 family opens the link and taps "I have seen this": patient sees Seen')
    const problems = [patient, presenter, hospital, family].flatMap((p) => p.problems).filter((x) => !/Failed to load resource/.test(x))
    return { resetAndSeedSeconds: resetSeconds, totalSeconds: marks.at(-1).atSeconds, marks, problems }
  } finally {
    await browser.close()
    await stack.stop()
  }
}

const runs = []
for (let i = 1; i <= RUNS; i++) {
  const r = await once()
  runs.push(r)
  console.log(`dry run ${i}: reset+seed ${r.resetAndSeedSeconds} s, script ${r.totalSeconds} s, problems: ${r.problems.length}`)
}
fs.writeFileSync(path.join(here, '../results/dry-run.json'), JSON.stringify({ runs }, null, 2))
