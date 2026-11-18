import { describe, it, expect, vi, beforeEach } from 'vitest'
import { monitoringApi, presenterKey, PRESENTER_KEY_HEADER } from './api.js'

describe('monitoring API client', () => {
  beforeEach(() => {
    sessionStorage.clear()
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ scenario: 'fever' }) })
  })

  it('sends the presenter key header only when a key is stored (review 3)', async () => {
    await monitoringApi.setScenario('id1', 'fever')
    expect(fetch.mock.calls[0][1].headers[PRESENTER_KEY_HEADER]).toBeUndefined()

    presenterKey.set('demo-key')
    await monitoringApi.setScenario('id1', 'fever')
    const [url, init] = fetch.mock.calls[1]
    expect(url).toMatch(/\/api\/sim\/patients\/id1\/scenario$/)
    expect(init.method).toBe('POST')
    expect(init.headers[PRESENTER_KEY_HEADER]).toBe('demo-key')
    expect(init.headers['Content-Type']).toBe('application/json')
  })

  it('passes the server error code through', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: 'Presenter key required', code: 'PRESENTER_KEY_REQUIRED' }) })
    await expect(monitoringApi.setScenario('id1', 'fever')).rejects.toMatchObject({ status: 401, code: 'PRESENTER_KEY_REQUIRED' })
  })
})
