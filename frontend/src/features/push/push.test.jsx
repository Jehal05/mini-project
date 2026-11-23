import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enablePush, pushStatus } from './push.js'
import PushToggle from './PushToggle.jsx'

const apiMock = vi.hoisted(() => ({ api: vi.fn(), post: vi.fn() }))
vi.mock('../../api/http.js', () => apiMock)

function fakeBrowser({ permission = 'default', request = 'granted', existing = null } = {}) {
  const subscription = { endpoint: 'https://push.example/1', toJSON: () => ({ endpoint: 'https://push.example/1', keys: { p256dh: 'a', auth: 'b' } }), unsubscribe: vi.fn().mockResolvedValue(true) }
  const pushManager = { getSubscription: vi.fn().mockResolvedValue(existing), subscribe: vi.fn().mockResolvedValue(subscription) }
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: vi.fn().mockResolvedValue({ pushManager }) } })
  window.PushManager = class {}
  window.Notification = { permission, requestPermission: vi.fn().mockResolvedValue(request) }
  return { pushManager, subscription }
}

beforeEach(() => { apiMock.api.mockReset(); apiMock.post.mockReset().mockResolvedValue({ ok: true }) })
afterEach(() => { delete navigator.serviceWorker; delete window.PushManager; delete window.Notification })

describe('web push in the browser (47, 61)', () => {
  it('reports unsupported, blocked, on and off', async () => {
    expect(await pushStatus()).toBe('unsupported')
    fakeBrowser({ permission: 'denied' }); expect(await pushStatus()).toBe('denied')
    fakeBrowser({ existing: { endpoint: 'x' } }); expect(await pushStatus()).toBe('on')
    fakeBrowser(); expect(await pushStatus()).toBe('off')
  })
  it('asks permission, subscribes with the server key and saves the subscription', async () => {
    const { pushManager } = fakeBrowser()
    apiMock.api.mockResolvedValue({ enabled: true, publicKey: 'BEl6' })
    const save = vi.fn()
    await enablePush(save)
    expect(pushManager.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }))
    expect(save).toHaveBeenCalledWith({ endpoint: 'https://push.example/1', keys: { p256dh: 'a', auth: 'b' } })
  })
  it('explains when the server has push off or the person says no', async () => {
    fakeBrowser(); apiMock.api.mockResolvedValue({ enabled: false })
    await expect(enablePush(vi.fn())).rejects.toThrow(/not switched on/)
    fakeBrowser({ request: 'denied' }); apiMock.api.mockResolvedValue({ enabled: true, publicKey: 'BEl6' })
    await expect(enablePush(vi.fn())).rejects.toThrow(/not allowed/)
  })
  it('the toggle shows the failure instead of failing silently', async () => {
    fakeBrowser(); apiMock.api.mockResolvedValue({ enabled: false })
    render(<PushToggle save={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: /alerts on this device/i }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/not switched on/)
  })
  it('renders nothing where push is impossible', () => {
    const { container } = render(<PushToggle save={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
