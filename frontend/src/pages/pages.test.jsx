// Patient dashboard and presenter panel with the API and socket mocked.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from '../design/index.js'

const liveState = { live: null, connected: true }
vi.mock('../features/monitoring/useLiveVitals.js', () => ({ useLiveVitals: () => liveState }))

const api = vi.hoisted(() => ({
  listPatients: vi.fn(),
  getPatient: vi.fn(),
  history: vi.fn(),
  timeline: vi.fn(),
  scenarios: vi.fn(),
  setScenario: vi.fn(),
}))
const keyStore = vi.hoisted(() => ({ value: '', get: vi.fn(), set: vi.fn() }))
keyStore.get.mockImplementation(() => keyStore.value)
keyStore.set.mockImplementation((v) => (keyStore.value = v))
vi.mock('../features/monitoring/api.js', () => ({ monitoringApi: api, presenterKey: keyStore, API_URL: 'http://test' }))

const { default: PatientDashboard } = await import('./PatientDashboard.jsx')
const { default: PresenterPanel } = await import('./PresenterPanel.jsx')

const snapshot = (vitals, status, scenario = 'stable') => ({
  patientId: 'id1',
  at: '2026-11-18T08:00:00.000Z',
  vitals,
  statuses: Object.fromEntries(Object.keys(vitals).map((k) => [k, status === 'critical' && (k === 'hr' || k === 'spo2') ? 'critical' : 'normal'])),
  status,
  scenario,
  simulated: true,
})
const STABLE = snapshot({ hr: 78, sys: 124, dia: 76, spo2: 98, temp: 36.8, rr: 15 }, 'normal')
const CARDIAC = snapshot({ hr: 136, sys: 170, dia: 103, spo2: 86, temp: 37, rr: 27 }, 'critical', 'cardiac_event')
const RAHUL = {
  id: 'id1',
  patientCode: 'HT-2026-0001',
  name: 'Rahul Sharma',
  bloodGroup: 'B+',
  city: 'Pune',
  dateOfBirth: '1981-03-12T00:00:00.000Z',
  cardiacConditions: [{ type: 'heart attack', year: 2022 }],
  live: STABLE,
}

function renderAt(path, element) {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/patient/:code" element={element} />
          <Route path="/presenter" element={element} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  liveState.live = null
  api.getPatient.mockResolvedValue(RAHUL)
  api.listPatients.mockResolvedValue([RAHUL])
  api.history.mockResolvedValue({ points: [{ at: STABLE.at, ...STABLE.vitals, status: 'normal' }] })
  api.timeline.mockResolvedValue({
    from: '2026-11-17T08:00:00.000Z',
    to: '2026-11-18T08:00:00.000Z',
    readings: [{ at: '2026-11-17T08:00:00.000Z', status: 'normal' }],
    events: [{ id: 'e1', at: '2026-11-18T07:59:00.000Z', type: 'scenario_change', message: 'Scenario changed: Stable → Cardiac event', severity: 'critical' }],
  })
  api.scenarios.mockResolvedValue([
    { key: 'stable', label: 'Stable', description: '' },
    { key: 'cardiac_event', label: 'Cardiac event', description: '' },
  ])
  api.setScenario.mockResolvedValue({ ...CARDIAC })
})

describe('Patient dashboard', () => {
  it('shows the patient, six simulated vital tiles and the notice', async () => {
    renderAt('/patient/HT-2026-0001', <PatientDashboard />)
    expect(await screen.findByRole('heading', { name: 'Rahul Sharma' })).toBeInTheDocument()
    expect(api.getPatient).toHaveBeenCalledWith('HT-2026-0001')
    const vitals = screen.getByRole('region', { name: 'Live vitals' })
    expect(within(vitals).getAllByText('Simulated')).toHaveLength(6)
    expect(within(vitals).getByText('78')).toBeInTheDocument()
    expect(screen.getAllByText('Simulated data for demonstration. Not a medical device.').length).toBeGreaterThan(0)
    expect(screen.getByText('B+')).toBeInTheDocument()
  })

  it('updates tiles and the overall status from live vitals (feature 29)', async () => {
    const { rerender } = renderAt('/patient/HT-2026-0001', <PatientDashboard />)
    await screen.findByRole('heading', { name: 'Rahul Sharma' })
    liveState.live = CARDIAC
    rerender(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/patient/HT-2026-0001']}>
          <Routes>
            <Route path="/patient/:code" element={<PatientDashboard />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
    )
    await waitFor(() => expect(screen.getByText('One or more vitals in the critical range')).toBeInTheDocument())
    const hrTile = within(screen.getByRole('region', { name: 'Live vitals' })).getByText('136').closest('[data-status]')
    expect(hrTile.dataset.status).toBe('critical')
  })

  it('loads history and the timeline with events (features 28, 30)', async () => {
    renderAt('/patient/HT-2026-0001', <PatientDashboard />)
    await screen.findByRole('heading', { name: 'Rahul Sharma' })
    await waitFor(() => expect(api.history).toHaveBeenCalledWith('id1', '1h'))
    expect(await screen.findByText('Scenario changed: Stable → Cardiac event')).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: '7 days' })[0])
    await waitFor(() => expect(api.history).toHaveBeenCalledWith('id1', '7d'))
  })

  it('SOS placeholder opens a dialog with working call links', async () => {
    renderAt('/patient/HT-2026-0001', <PatientDashboard />)
    await userEvent.click(await screen.findByRole('button', { name: 'Send emergency SOS' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Emergency help' })
    expect(within(dialog).getByRole('link', { name: 'Call 112' })).toHaveAttribute('href', 'tel:112')
    expect(within(dialog).getByRole('link', { name: 'Call 108 ambulance' })).toHaveAttribute('href', 'tel:108')
  })

  it('explains when the backend is not reachable', async () => {
    api.getPatient.mockRejectedValue(Object.assign(new Error('x'), { status: undefined }))
    renderAt('/patient/HT-2026-0001', <PatientDashboard />)
    expect(await screen.findByText(/Cannot reach the HealthTwin backend/)).toBeInTheDocument()
  })
})

describe('Presenter panel (feature 26)', () => {
  it('switches Rahul into the cardiac scenario', async () => {
    renderAt('/presenter', <PresenterPanel />)
    const group = await screen.findByRole('group', { name: 'Scenario for Rahul Sharma' })
    const stable = await within(group).findByRole('button', { name: 'Stable' })
    expect(stable).toHaveAttribute('aria-pressed', 'true')
    await act(async () => {
      await userEvent.click(within(group).getByRole('button', { name: 'Cardiac event' }))
    })
    expect(api.setScenario).toHaveBeenCalledWith('id1', 'cardiac_event')
    await waitFor(() => expect(within(group).getByRole('button', { name: 'Cardiac event' })).toHaveAttribute('aria-pressed', 'true'))
  })
})

describe('Presenter key (review 3)', () => {
  it('asks for the key when the server requires it, then retries the switch', async () => {
    api.setScenario
      .mockRejectedValueOnce(Object.assign(new Error('Presenter key required'), { status: 401, code: 'PRESENTER_KEY_REQUIRED' }))
      .mockResolvedValueOnce({ ...CARDIAC })
    renderAt('/presenter', <PresenterPanel />)
    const group = await screen.findByRole('group', { name: 'Scenario for Rahul Sharma' })
    await userEvent.click(within(group).getByRole('button', { name: 'Cardiac event' }))

    const input = await screen.findByLabelText('Presenter key')
    await userEvent.type(input, 'demo-key')
    await userEvent.click(screen.getByRole('button', { name: 'Unlock and switch' }))

    expect(keyStore.set).toHaveBeenLastCalledWith('demo-key')
    await waitFor(() => expect(api.setScenario).toHaveBeenCalledTimes(2))
    expect(api.setScenario).toHaveBeenLastCalledWith('id1', 'cardiac_event')
    expect(screen.queryByLabelText('Presenter key')).not.toBeInTheDocument()
  })
})
