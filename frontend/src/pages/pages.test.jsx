// Patient dashboard and presenter panel with the API and socket mocked.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from '../design/index.js'

const liveState = { live: null, connected: true }
const fakeSocket = vi.hoisted(() => ({ on: vi.fn(), off: vi.fn(), emit: vi.fn(), connected: false }))
vi.mock('../features/monitoring/useLiveVitals.js', () => ({ useLiveVitals: () => liveState, getSocket: () => Promise.resolve(fakeSocket) }))

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
vi.mock('../features/monitoring/api.js', () => ({ monitoringApi: api, presenterKey: keyStore, API_URL: 'http://test', makeRequest: () => vi.fn() }))

const detApi = vi.hoisted(() => ({ statuses: vi.fn(), status: vi.fn(), detections: vi.fn() }))
vi.mock('../features/detection/api.js', () => ({ detectionApi: detApi }))

const emApi = vi.hoisted(() => ({
  sos: vi.fn(),
  active: vi.fn(),
  mine: vi.fn(),
  firstAid: vi.fn(),
  saveSymptoms: vi.fn(),
  confirm: vi.fn(),
  cancel: vi.fn(),
  location: vi.fn(),
  ack: vi.fn(),
  publicStatus: vi.fn(),
  seen: vi.fn(),
}))
vi.mock('../features/emergency/api.js', () => ({ emergencyApi: emApi }))

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
const detectionStatus = (level, extra = {}) => ({
  patientId: 'id1',
  patientCode: 'HT-2026-0001',
  level,
  severity: level ? { level, label: `Level ${level}` } : null,
  primary: level ? { rule: 'multi:tachycardia-hypoxia', level, message: 'Very fast heart rate with low oxygen: Heart rate 136 BPM is above 120' } : null,
  rules: level ? [{ rule: 'multi:tachycardia-hypoxia', level, message: 'Very fast heart rate with low oxygen: Heart rate 136 BPM is above 120' }] : [],
  risk: level === 3 ? { score: 82, level: 'high', label: 'High', breakdown: [{ factor: 'Age 45', points: 5.3 }] } : { score: 25, level: 'low', label: 'Low', breakdown: [{ factor: 'Previous cardiac condition', points: 20 }] },
  case: null,
  simulated: true,
  ...extra,
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
  detApi.status.mockResolvedValue(detectionStatus(0))
  detApi.statuses.mockResolvedValue([detectionStatus(0)])
  detApi.detections.mockResolvedValue({ items: [], page: 1, pages: 1, total: 0, limit: 6 })
  emApi.active.mockResolvedValue({ case: null, serverNow: new Date().toISOString(), numbers: [], simulated: true })
  emApi.mine.mockResolvedValue({ items: [], page: 1, pages: 1, total: 0, limit: 5, simulated: true })
  emApi.firstAid.mockResolvedValue({ source: { name: 'Source', url: 'https://example.org', also: 'Other' }, dispatcherFirst: 'Follow the dispatcher.', steps: [], aspirin: { shown: false }, numbers: [] })
  emApi.sos.mockResolvedValue({ created: true, joined: false, case: { id: 'c1', isLive: true, status: 'searching' } })
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

  it('has a skip link that moves focus straight to the SOS button (keyboard users otherwise tab 16+ times)', async () => {
    renderAt('/patient/HT-2026-0001', <PatientDashboard />)
    await screen.findByRole('heading', { name: 'Rahul Sharma' })
    const skip = screen.getByRole('link', { name: 'Skip to the SOS button' })
    expect(document.body.querySelector('a, button')).toBe(skip) // first thing a keyboard user reaches
    await userEvent.click(skip)
    expect(screen.getByRole('button', { name: 'Send emergency SOS' })).toHaveFocus()
  })

  it('SOS opens a confirmation dialog with working call links; "Send SOS" posts it for this patient (feature 41)', async () => {
    renderAt('/patient/HT-2026-0001', <PatientDashboard />)
    await userEvent.click(await screen.findByRole('button', { name: 'Send emergency SOS' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Send an emergency request?' })
    expect(within(dialog).getByRole('link', { name: 'Call 112' })).toHaveAttribute('href', 'tel:112')
    expect(within(dialog).getByRole('link', { name: 'Call 108 ambulance' })).toHaveAttribute('href', 'tel:108')
    expect(emApi.sos).not.toHaveBeenCalled() // opening the dialog sends nothing: a pocket press is harmless
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send SOS' }))
    await waitFor(() => expect(emApi.sos).toHaveBeenCalledWith('id1', undefined))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    await waitFor(() => expect(emApi.active.mock.calls.length).toBeGreaterThan(1)) // the live flow reloads at once
  })

  it('shows the open emergency (confirmation screen) above the vitals, and the incident history', async () => {
    emApi.active.mockResolvedValue({
      case: {
        id: 'c1', isLive: true, status: 'awaiting_confirmation', source: 'auto_detection', severity: 3, symptoms: null, location: null, acknowledgements: [], contactAlerts: [], timeline: [],
        escalation: { confirmDeadline: new Date(Date.now() + 8000).toISOString(), round: 0, radiusKm: 10 },
      },
      serverNow: new Date().toISOString(),
      simulated: true,
    })
    renderAt('/patient/HT-2026-0001', <PatientDashboard />)
    expect(await screen.findByRole('heading', { name: 'Are you okay?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send help now' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Emergency incidents' })).toBeInTheDocument()
  })

  it('shows the detection panel (lazy) and the risk gauge (features 37, 38)', async () => {
    renderAt('/patient/HT-2026-0001', <PatientDashboard />)
    await screen.findByRole('heading', { name: 'Rahul Sharma' })
    expect(await screen.findByRole('heading', { name: 'Emergency detection' })).toBeInTheDocument()
    expect(detApi.status).toHaveBeenCalledWith('id1')
    expect(await screen.findByTestId('detection-headline')).toHaveTextContent('No abnormal pattern')
    expect(screen.getByRole('meter', { name: 'Cardiac risk' })).toHaveAttribute('aria-valuenow', '25')
    expect(await screen.findByRole('heading', { name: 'Detection history' })).toBeInTheDocument()
  })

  it('shows a Level 3 detection with its reasons and the open case', async () => {
    detApi.status.mockResolvedValue(detectionStatus(3, { case: { id: 'abc123456789' } }))
    renderAt('/patient/HT-2026-0001', <PatientDashboard />)
    expect(await screen.findByText(/Main reason:/)).toBeInTheDocument()
    expect(screen.getAllByText(/Heart rate 136 BPM is above 120/).length).toBeGreaterThan(0)
    expect(screen.getByTestId('case-notice')).toHaveTextContent('456789')
    expect(screen.getByRole('meter', { name: 'Cardiac risk' })).toHaveAttribute('aria-valuetext', '82 out of 100, High risk')
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

describe('Presenter detection summary (Phase 6)', () => {
  it('shows each patient\'s detection level, reason and risk', async () => {
    detApi.statuses.mockResolvedValue([detectionStatus(3, { case: { id: 'c1' } })])
    renderAt('/presenter', <PresenterPanel />)
    const box = await screen.findByLabelText('Detection for Rahul Sharma')
    expect(within(box).getByText('Level 3 Critical cardiac')).toBeInTheDocument()
    expect(within(box).getByText(/Very fast heart rate with low oxygen/)).toBeInTheDocument()
    expect(within(box).getByText('Emergency case open.')).toBeInTheDocument()
    expect(within(box).getByRole('meter')).toHaveAttribute('aria-valuenow', '82')
  })

  it('still works when detection is unavailable', async () => {
    detApi.statuses.mockRejectedValue(new Error('down'))
    renderAt('/presenter', <PresenterPanel />)
    const group = await screen.findByRole('group', { name: 'Scenario for Rahul Sharma' })
    expect(within(group).getByRole('button', { name: 'Stable' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Detection for Rahul Sharma')).not.toBeInTheDocument()
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

describe('App routes (review 10: lazy-loaded pages)', () => {
  it('loads the presenter page on demand and redirects / to Rahul', async () => {
    const { default: App } = await import('../App.jsx')
    const { unmount } = render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/presenter']}>
          <App />
        </MemoryRouter>
      </ThemeProvider>,
    )
    expect(await screen.findByRole('heading', { name: 'Presenter control panel' })).toBeInTheDocument()
    unmount()

    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      </ThemeProvider>,
    )
    expect(await screen.findByRole('heading', { name: 'Rahul Sharma' })).toBeInTheDocument()
    expect(api.getPatient).toHaveBeenCalledWith('HT-2026-0001')
  })
})
