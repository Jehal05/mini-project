import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const handlers = vi.hoisted(() => ({}))
const socket = vi.hoisted(() => ({ on: vi.fn((n, fn) => { handlers[n] = fn }), off: vi.fn() }))
vi.mock('../monitoring/useLiveVitals.js', () => ({ getSocket: () => Promise.resolve(socket) }))
vi.mock('./alarm.js', () => ({ startAlarm: vi.fn(() => vi.fn()) }))
const api = vi.hoisted(() => ({ incoming: vi.fn(), accept: vi.fn(), reject: vi.fn(), track: vi.fn(), ambulances: vi.fn(), caseFor: vi.fn(), trip: vi.fn(), arrival: vi.fn(), nearby: vi.fn(), myActive: vi.fn() }))
vi.mock('./api.js', () => ({ responseApi: api }))
vi.mock('../../components/PortalLayout.jsx', () => ({ default: ({ children, title }) => <main><h1>{title}</h1>{children}</main> }))

import GoldenHour from './GoldenHour.jsx'
import MiniMap from './MiniMap.jsx'
import Takeover from './Takeover.jsx'
import CrewPage from './pages/CrewPage.jsx'
import IncomingPage from './pages/IncomingPage.jsx'
import TrackPage from './pages/TrackPage.jsx'
import HospitalFinderPage from './pages/HospitalFinderPage.jsx'

const Ctx = ({ incoming }) => <Outlet context={{ role: 'hospital_staff', incoming }} />
const stage = (over) => ({ key: 'cathLab', label: 'Alert to cath lab team', targetMs: 30 * 60_000, startedAt: 0, endedAt: null, elapsedMs: 0, overrun: false, state: 'running', ...over })
const item = (over = {}) => ({ id: 'c1', caseNumber: 'EC-2026-0001', patientCode: 'HT-2026-0001', status: 'searching', severity: 3, riskScore: 82, vitals: { hr: 142, sys: 90, dia: 60, spo2: 88, temp: 37 }, distanceKm: 2.4, needsResponse: true, respondBy: new Date(Date.now() + 45_000).toISOString(), goldenHour: [stage()], ...over })

beforeEach(() => { vi.clearAllMocks() })

describe('takeover screen (103)', () => {
  it('fills the screen for a critical case waiting for an answer, and accepting calls the server', async () => {
    api.accept.mockResolvedValue({})
    const onChanged = vi.fn()
    render(<MemoryRouter><Takeover items={[item()]} offsetMs={0} onChanged={onChanged} /></MemoryRouter>)
    expect(screen.getByRole('alertdialog', { name: /critical cardiac emergency/i })).toBeInTheDocument()
    expect(screen.getByText(/risk score 82\/100/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Call 112' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Call 108' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Accept emergency' }))
    expect(api.accept).toHaveBeenCalledWith('c1')
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })
  it('acknowledge hides it; a rejection needs a reason', async () => {
    api.reject.mockResolvedValue({})
    const { rerender } = render(<MemoryRouter><Takeover items={[item()]} offsetMs={0} /></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }))
    await userEvent.selectOptions(screen.getByLabelText('Reason for rejecting'), 'cath_lab_busy')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm rejection' }))
    expect(api.reject).toHaveBeenCalledWith('c1', 'cath_lab_busy')
    rerender(<MemoryRouter><Takeover items={[item({ id: 'c2' })]} offsetMs={0} /></MemoryRouter>)
    await userEvent.click(await screen.findByRole('button', { name: 'Acknowledge' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
  it('stays away for a case that is not critical or already answered', () => {
    render(<MemoryRouter><Takeover items={[item({ severity: 2 }), item({ id: 'c3', needsResponse: false })]} offsetMs={0} /></MemoryRouter>)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})

describe('incoming queue (62)', () => {
  it('lists the cases in the order given with a countdown and the golden-hour clocks', () => {
    const incoming = { items: [item(), item({ id: 'c9', caseNumber: 'EC-2026-0009', severity: 2, needsResponse: false, status: 'accepted' })], offsetMs: 0, loading: false, error: '' }
    render(<MemoryRouter><Routes><Route element={<Ctx incoming={incoming} />}><Route path="/" element={<IncomingPage />} /></Route></Routes></MemoryRouter>)
    const rows = screen.getAllByRole('listitem').filter((li) => li.className.includes('queue-item'))
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('EC-2026-0001')
    expect(rows[0]).toHaveTextContent(/Respond within/)
    expect(rows[0]).toHaveTextContent('Level 3 critical')
    expect(rows[1]).toHaveTextContent('Status: accepted')
    expect(screen.getAllByLabelText('Golden-hour timers')).toHaveLength(2)
  })
  it('says so when nothing is waiting', () => {
    render(<MemoryRouter><Routes><Route element={<Ctx incoming={{ items: [], offsetMs: 0, loading: false, error: '' }} />}><Route path="/" element={<IncomingPage />} /></Route></Routes></MemoryRouter>)
    expect(screen.getByText(/No emergencies for this hospital/)).toBeInTheDocument()
  })
})

describe('golden-hour clocks (105)', () => {
  it('marks a stage that passed its target', () => {
    render(<GoldenHour stages={[stage({ key: 'a', state: 'done', elapsedMs: 31 * 60_000 }), stage({ key: 'b', label: 'Scene', state: 'waiting' })]} />)
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveClass('golden-over')
    expect(items[0]).toHaveTextContent('over target')
    expect(items[1]).not.toHaveClass('golden-over')
  })
})

describe('map', () => {
  it('draws every point with a label', () => {
    render(<MiniMap points={[{ id: 'p', kind: 'patient', lng: 73.85, lat: 18.52, label: 'You' }, { id: 'h', kind: 'hospital', lng: 73.9, lat: 18.5, label: 'Heart' }]} lines={[{ id: 'l', path: [[73.85, 18.52], [73.9, 18.5]] }]} />)
    expect(screen.getByRole('img', { name: /map/i })).toBeInTheDocument()
    expect(screen.getByText('You')).toBeInTheDocument()
    expect(screen.getByText(/positions and routes are simulated/i)).toBeInTheDocument()
  })
})

const tracked = (over = {}) => ({
  id: 'c1', caseNumber: 'EC-2026-0001', status: 'ambulance_assigned', location: { point: { coordinates: [73.85, 18.52] } },
  hospital: { id: 'h1', name: 'Demo Heart Hospital', phone: '+912000000001' }, doctor: null, preparation: { edBayReady: true },
  alternatives: [{ id: 'h1', name: 'Demo Heart Hospital', status: 'accepted', rank: 1, distanceKm: 2.1, location: { coordinates: [73.86, 18.53] } }, { id: 'h2', name: 'Other Hospital', status: 'superseded', rank: 2, distanceKm: 3.5, location: { coordinates: [73.9, 18.5] } }],
  ambulance: { vehicleNumber: 'MH12-A1', type: 'ALS', stage: 'en_route', stageLabel: 'Ambulance on the way', etaSeconds: 240, etaToHospitalSeconds: 600, position: { lng: 73.86, lat: 18.53 }, route: { toPatient: [[73.86, 18.53], [73.85, 18.52]], toHospital: [[73.85, 18.52], [73.86, 18.53]] } },
  timeline: [{ type: 'sent', at: new Date().toISOString(), message: 'Patient pressed SOS' }], ...over,
})

describe('patient tracker (67, 69, 70, 76-78)', () => {
  it('shows the accepting hospital, ETA, stages, preparation and the contacted hospitals, and follows live updates', async () => {
    api.track.mockResolvedValue(tracked())
    render(<MemoryRouter initialEntries={['/patient/emergency/c1']}><Routes><Route path="/patient/emergency/:caseId?" element={<TrackPage />} /></Routes></MemoryRouter>)
    expect(await screen.findByText(/Demo Heart Hospital accepted your emergency/)).toBeInTheDocument()
    expect(screen.getByText(/arriving in 4 min/)).toBeInTheDocument()
    expect(screen.getByRole('listitem', { name: '' , current: 'step' })).toHaveTextContent('Ambulance on the way')
    expect(screen.getByText('Another hospital accepted')).toBeInTheDocument()
    expect(screen.getByText(/ED bay ready/)).toHaveTextContent('✓')
    expect(screen.getByRole('link', { name: 'Call 112' })).toBeInTheDocument()
    await act(async () => handlers['ambulance:position']({ caseId: 'c1', position: { lng: 73.855, lat: 18.525 }, etaSeconds: 60, etaToHospitalSeconds: 420, remainingKm: 0.4, stage: 'en_route' }))
    expect(screen.getByText(/arriving in 1 min/)).toBeInTheDocument()
  })
  it('without a case id it finds the active one, or says there is none', async () => {
    api.myActive.mockResolvedValue({ case: null })
    render(<MemoryRouter initialEntries={['/patient/emergency']}><Routes><Route path="/patient/emergency/:caseId?" element={<TrackPage />} /></Routes></MemoryRouter>)
    expect(await screen.findByText(/no emergency right now/i)).toBeInTheDocument()
  })
})

describe('crew view (107)', () => {
  it('drives the next stage with one big button and offers a navigation link', async () => {
    api.ambulances.mockResolvedValue({ items: [{ _id: 'a1', vehicleNumber: 'MH12-A1', type: 'ALS', position: { coordinates: [73.86, 18.53] }, trip: { caseId: 'c1', stage: 'at_patient', patientPoint: [73.85, 18.52], hospitalPoint: [73.9, 18.5], legFrom: [73.86, 18.53], legTo: [73.85, 18.52] } }] })
    api.caseFor.mockResolvedValue({ case: { location: { address: 'Shivajinagar, Pune' } } })
    api.trip.mockResolvedValue({})
    render(<MemoryRouter><CrewPage /></MemoryRouter>)
    expect(await screen.findByText(/Shivajinagar, Pune/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open navigation' })).toHaveAttribute('href', expect.stringContaining('destination=18.52,73.85'))
    await userEvent.click(screen.getByRole('button', { name: 'Patient on board' }))
    expect(api.trip).toHaveBeenCalledWith('c1', 'patient_on_board')
  })
})

describe('hospital finder (51, 55-57)', () => {
  it('searches near a chosen area with the cardiac filter on, and shows the score breakdown', async () => {
    api.nearby.mockResolvedValue({ items: [{ id: 'h1', name: 'Demo Heart Hospital', address: 'Pune', distanceKm: 1.2, score: 88, breakdown: { distance: 38, capability: 30, load: 20 }, cardiacCapable: true, location: { coordinates: [73.85, 18.52] }, capability: { cathLab: true, cardiologistOnDuty: true, freeCcu: 2, freeIcu: 1, alsFree: 1 } }] })
    render(<MemoryRouter><HospitalFinderPage /></MemoryRouter>)
    expect(await screen.findByText('Demo Heart Hospital')).toBeInTheDocument()
    expect(api.nearby).toHaveBeenCalledWith(expect.objectContaining({ cardiac: '1', radiusKm: 30 }))
    expect(screen.getByText(/distance 38 \+ capability 30 \+ load 20/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('checkbox', { name: /cardiac care only/i }))
    await waitFor(() => expect(api.nearby).toHaveBeenLastCalledWith(expect.objectContaining({ cardiac: '' })))
  })
})
