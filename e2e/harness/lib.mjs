import { chromium } from 'playwright-core'
import { startHarness } from './server.mjs'

export const MOBILE = { width: 390, height: 844 }
export const DESKTOP = { width: 1366, height: 768 }

export async function launch() {
  return chromium.launch({ args: ['--no-sandbox'] })
}

/** A page that records console errors, page errors and failed API calls (quality gate: none allowed). */
export async function openPage(browser, viewport = DESKTOP, { context: ctxOpts = {} } = {}) {
  const context = await browser.newContext({ viewport, ...ctxOpts })
  const page = await context.newPage()
  page.problems = []
  page.on('console', (m) => {
    if (m.type() === 'error') page.problems.push(`console.error: ${m.text()}`)
  })
  page.on('response', (r) => {
    if (r.status() >= 400) page.problems.push(`http ${r.status()} ${r.url()}`)
  })
  page.on('pageerror', (e) => page.problems.push(`pageerror: ${e.message}`))
  return page
}

export async function withStack(opts, fn) {
  const stack = await startHarness(opts)
  const browser = await launch()
  try {
    return await fn({ stack, browser })
  } finally {
    await browser.close()
    await stack.stop()
  }
}

export const api = (stack) => async (method, path, body) => {
  const r = await fetch(stack.url + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const text = await r.text()
  let json; try { json = JSON.parse(text) } catch { json = text }
  return { status: r.status, body: json }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export async function until(fn, { timeout = 15000, every = 150, what = 'condition' } = {}) {
  const t = Date.now()
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() - t > timeout) throw new Error(`Timed out waiting for ${what}`)
    await sleep(every)
  }
}
