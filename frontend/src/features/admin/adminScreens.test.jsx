import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { DEFAULT_THRESHOLDS } from '@shared/vitals.js'

vi.mock('../detection/api.js', () => ({ detectionApi: { config: vi.fn(), saveConfig: vi.fn() } }))
vi.mock('./OpsApi.js', () => ({ adminOps: { map: vi.fn() } }))
vi.mock('../response/hooks.js', () => ({ useSocketEvents: vi.fn() }))
vi.mock('../response/MapView.jsx', () => ({ default: ({ points, label }) => <div role="img" aria-label={label}>{points.map((p) => p.id).join(',')}</div> }))
import { detectionApi } from '../detection/api.js'
import { adminOps } from './OpsApi.js'
import DetectionSettingsPage from './DetectionSettingsPage.jsx'
import CommandMapPage from './CommandMapPage.jsx'

describe('admin screens', () => {
  beforeEach(() => vi.clearAllMocks())
  it('shows the thresholds, baselines, weights and the change log', async () => {
    const baselineLimits = Object.fromEntries(Object.keys(DEFAULT_THRESHOLDS).map((k) => [k, { pct: 20 }]))
    detectionApi.config.mockResolvedValue({ effective: { thresholds: DEFAULT_THRESHOLDS, baselineLimits, riskWeights: { hr: 10, levelBonus: { 1: 5, 2: 10, 3: 20 } } }, defaults: { baselineLimits, riskWeights: { hr: 10, levelBonus: { 1: 5, 2: 10, 3: 20 } } }, changes: [{ summary: 'Changed hr', scope: 'global', at: new Date().toISOString(), actorRole: 'central_admin' }] })
    render(<DetectionSettingsPage />)
    expect(await screen.findByRole('form', { name: /detection thresholds/i })).toBeInTheDocument()
    expect(screen.getByRole('form', { name: /risk score weights/i })).toBeInTheDocument()
    expect(screen.getByText('Changed hr')).toBeInTheDocument()
  })
  it('plots hospitals, patients and ambulances on the command map', async () => {
    adminOps.map.mockResolvedValue({ hospitals: [{ id: '1', lat: 18.5, lng: 73.8 }], ambulances: [{ id: '2', vehicleNumber: 'MH1', status: 'available', lat: 18.6, lng: 73.9 }], cases: [{ id: '3', patientCode: 'HT-1', lat: 18.7, lng: 73.7 }] })
    render(<CommandMapPage />)
    await waitFor(() => expect(screen.getByRole('img')).toHaveTextContent('h-1,c-3,a-2'))
    expect(screen.getByRole('status')).toHaveTextContent('1 hospitals · 1 ambulances')
  })
})
