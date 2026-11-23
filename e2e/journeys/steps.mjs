import { api, until, openPage, DESKTOP } from '../harness/lib.mjs'

export const RAHUL = 'HT-2026-0001'
export const ANANYA = 'HT-2026-0002'

export function steps(stack) {
  const call = api(stack)
  const id = (code) => stack.ids[code]
  return {
    call,
    scenario: (code, s) => call('POST', `/api/sim/patients/${id(code)}/scenario`, { scenario: s }),
    active: async (code) => (await call('GET', `/api/emergency/active?patient=${code}`)).body.case,
    /** Wait until a case exists (detection needs a few ticks of cardiac readings). */
    async caseFor(code, { status, timeout = 45000 } = {}) {
      return until(async () => {
        const c = await call('GET', `/api/emergency/active?patient=${code}`)
        const k = c.body?.case
        return k && (!status || k.status === status) ? k : null
      }, { timeout, what: `case ${status ?? ''} for ${code}` })
    },
    async caseStatus(caseId) {
      return (await call('GET', `/api/emergency/${caseId}`)).body
    },
    async dbCase(caseId) {
      return (await call('GET', '/__e2e/db-cases')).body.find((c) => c._id === caseId)
    },
  }
}

export async function openPatient(browser, stack, code, viewport = DESKTOP) {
  const page = await openPage(browser, viewport)
  await page.goto(`${stack.url}/patient/${code}`)
  await page.getByRole('button', { name: 'Send emergency SOS' }).waitFor()
  return page
}

/** The "Looking for a hospital" badge inside the live emergency card. */
export const searchingBadge = (page) => page.getByRole('region', { name: 'Emergency status' }).getByText('Looking for a hospital', { exact: true }).first()
