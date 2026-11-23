import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

const handlers = vi.hoisted(() => ({}))
const fakeSocket = vi.hoisted(() => ({
  on: vi.fn((name, fn) => { handlers[name] = fn }),
  off: vi.fn(),
}))
const get = vi.hoisted(() => vi.fn())
vi.mock('../monitoring/useLiveVitals.js', () => ({ getSocket: () => Promise.resolve(fakeSocket) }))
vi.mock('../monitoring/api.js', () => ({ API_URL: '', makeRequest: () => get }))

import UnresolvedAlerts from './UnresolvedAlerts.jsx'

describe('unresolved emergency alert (admin)', () => {
  it('shows nothing when every case has a hospital', async () => {
    get.mockResolvedValue({ items: [] })
    const { container } = render(<UnresolvedAlerts />)
    await act(async () => {})
    expect(container).toBeEmptyDOMElement()
  })

  it('lists cases from the server and adds a new one the moment the event arrives', async () => {
    get.mockResolvedValue({ items: [{ id: 'c1', caseNumber: 'EC-2026-0001', patientCode: 'HT-2026-0001' }] })
    render(<UnresolvedAlerts />)
    expect(await screen.findByRole('alert')).toHaveTextContent('1 emergency case has no hospital')
    await act(async () => handlers['emergency:unresolved']({ caseId: 'c2', patientCode: 'HT-2026-0002' }))
    expect(screen.getByRole('alert')).toHaveTextContent('2 emergency cases have no hospital')
    await act(async () => handlers['emergency:unresolved']({ caseId: 'c2', patientCode: 'HT-2026-0002' })) // repeat: not doubled
    expect(screen.getByRole('alert')).toHaveTextContent('2 emergency cases')
  })
})
