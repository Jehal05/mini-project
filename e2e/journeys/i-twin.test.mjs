// Journey i: the Digital Twin (features 91, 92, 101) in a real browser.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withStack, until, sleep, openPage, DESKTOP, MOBILE } from '../harness/lib.mjs'
import { steps, RAHUL } from './steps.mjs'

const noProblems = (page) => assert.deepEqual(page.problems, [], `browser problems: ${page.problems.join(' | ')}`)
const twin = (page) => page.getByRole('region', { name: 'Digital Twin' })
const heartBox = (page) => twin(page).locator('figure[data-heart]')
const canvas = (page) => heartBox(page).locator('canvas') // the caption's BPM changes, so compare the picture only

/** Average colour of the middle of the heart, read from a real screenshot decoded inside the page. */
async function heartColour(page) {
  const buf = await canvas(page).screenshot()
  return page.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const g = c.getContext('2d')
    g.drawImage(img, 0, 0)
    const w = Math.floor(img.width / 4)
    const h = Math.floor(img.height / 4)
    const d = g.getImageData(Math.floor(img.width / 2) - w / 2, Math.floor(img.height / 2) - h / 2, w, h).data
    let r = 0, gr = 0, b = 0, n = 0
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 200) { r += d[i]; gr += d[i + 1]; b += d[i + 2]; n++ } }
    return { r: r / n, g: gr / n, b: b / n }
  }, buf.toString('base64'))
}

test('i. Digital Twin: baseline vs now, the heart follows a cardiac event, trends and a11y states', async () => {
  await withStack({ roundSeconds: 60, tickMs: 400 }, async ({ stack, browser }) => {
    const s = steps(stack)
    const page = await openPage(browser, DESKTOP)
    await page.goto(`${stack.url}/patient/${RAHUL}`)
    await twin(page).waitFor()

    // 3D heart in a real browser (WebGL), with text for screen readers.
    const kind = await heartBox(page).getAttribute('data-heart')
    assert.equal(kind, '3d', 'expected the WebGL heart in headless Chromium')
    await heartBox(page).locator('canvas').waitFor()
    const calm = await heartColour(page)
    assert.ok(calm.g > calm.r, `calm heart should be green-ish: ${JSON.stringify(calm)}`)

    // Baseline vs now, from the patient's own baseline (Rahul: 78 BPM).
    const hr = twin(page).getByRole('table', { name: /usual and current/i }).getByRole('row', { name: /^Heart rate/ })
    await until(async () => /78 BPM/.test(await hr.innerText()), { what: 'usual heart rate 78 BPM' })
    await twin(page).getByText('All your readings are in line with your usual.').waitFor({ timeout: 20000 })

    // Trends panel loaded from the real endpoint.
    await twin(page).getByRole('table', { name: /trend of each vital/i }).waitFor()
    assert.equal(await twin(page).getByRole('table', { name: /trend of each vital/i }).getByRole('row').count(), 7)
    await twin(page).getByText(/Resting heart rate/).waitFor()

    // Cardiac event: summary, heart status and heart colour all move.
    await s.scenario(RAHUL, 'cardiac_event')
    await twin(page).getByText(/of your readings differ from your usual/).waitFor({ timeout: 60000 })
    await twin(page).getByText(/Heart rate is \d+% above your usual \(78 BPM\)\./).waitFor({ timeout: 30000 })
    await heartBox(page).getByText(/critical/).first().waitFor({ timeout: 60000 })
    await until(async () => { const c = await heartColour(page); return c.r > c.g * 1.5 }, { timeout: 15000, what: 'heart turns red' })
    const bpm = Number(/Beating at (\d+) BPM/.exec(await heartBox(page).innerText())[1])
    assert.ok(bpm > 100, `heart rate ${bpm}`)
    assert.doesNotMatch(await twin(page).innerText(), /diagnos|heart attack|disease/i)
    noProblems(page)
  })
})

test('i2. reduced motion: the heart neither beats nor spins, but still turns with the arrow keys', async () => {
  await withStack({}, async ({ stack, browser }) => {
    const page = await openPage(browser, DESKTOP, { context: { reducedMotion: 'reduce' } })
    await page.goto(`${stack.url}/patient/${RAHUL}`)
    await heartBox(page).locator('canvas').waitFor()
    const group = twin(page).getByRole('group', { name: /3D heart model/ })
    // The heart changes colour when the status changes (that is a feature), so only compare two pictures
    // taken under the same status.
    const status = async () => /· (\w+) ·/.exec(await heartBox(page).locator('figcaption').innerText())?.[1]
    let a, still
    for (let attempt = 0; attempt < 5 && !still; attempt++) {
      await sleep(400)
      const s1 = await status()
      a = await canvas(page).screenshot()
      await sleep(900)
      const b = await canvas(page).screenshot()
      if ((await status()) === s1) { assert.ok(a.equals(b), 'heart moved although the user asked for reduced motion'); still = true }
    }
    assert.ok(still, 'status kept changing: could not take two pictures under one status')
    await group.focus()
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight')
    await sleep(300)
    const c = await canvas(page).screenshot()
    assert.ok(!a.equals(c), 'arrow keys did not turn the heart')
    noProblems(page)
  })
})

test('i3. with motion allowed the heart is alive (frames change over time)', async () => {
  await withStack({}, async ({ stack, browser }) => {
    const page = await openPage(browser, DESKTOP)
    await page.goto(`${stack.url}/patient/${RAHUL}`)
    await heartBox(page).locator('canvas').waitFor()
    const a = await canvas(page).screenshot()
    await sleep(700)
    const b = await canvas(page).screenshot()
    assert.ok(!a.equals(b))
  })
})

test('i4. no WebGL: the 2D heart is shown with a text description and the page still works', async () => {
  await withStack({}, async ({ stack, browser }) => {
    const page = await openPage(browser, MOBILE)
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return /webgl/.test(type) ? null : orig.call(this, type, ...rest) }
    })
    await page.goto(`${stack.url}/patient/${RAHUL}`)
    await twin(page).waitFor()
    assert.equal(await heartBox(page).getAttribute('data-heart'), '2d')
    await twin(page).getByRole('img', { name: /Heart model.*Simulated/ }).waitFor()
    await twin(page).getByRole('table', { name: /trend of each vital/i }).waitFor()
    noProblems(page)
  })
})
