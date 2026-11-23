import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../monitoring/useLiveVitals.js', () => ({ getSocket: () => Promise.resolve({ on() {}, off() {} }) }))
const ops = vi.hoisted(() => ({ queue: vi.fn(), analytics: vi.fn(), backup: vi.fn(), checkBackup: vi.fn(), restore: vi.fn() }))
vi.mock('./OpsApi.js', () => ({ adminOps: ops }))
vi.mock('recharts', () => {
  const Pass = ({ children }) => <div>{children}</div>
  return { ResponsiveContainer: Pass, BarChart: Pass, Bar: () => null, CartesianGrid: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null }
})

import AnalyticsPage from './AnalyticsPage.jsx'
import BackupPage from './BackupPage.jsx'
import EmergenciesPage from './EmergenciesPage.jsx'

beforeEach(() => vi.clearAllMocks())
const stage = { key: 'cathLab', label: 'Alert to cath lab team', targetMs: 1800000, startedAt: 0, elapsedMs: 0, state: 'waiting', overrun: false }

describe('live emergencies (95)', () => {
  it('lists the queue in the order the server gives', async () => {
    ops.queue.mockResolvedValue({ serverNow: new Date().toISOString(), items: [
      { id: 'a1', caseNumber: 'EC-2026-0002', patientCode: 'HT-2026-0002', status: 'searching', severity: 3, riskScore: 80, waitingMs: 120000, hospitalsTold: 3, hospital: null, goldenHour: [stage] },
      { id: 'b2', caseNumber: 'EC-2026-0001', patientCode: 'HT-2026-0001', status: 'accepted', severity: 2, riskScore: 90, waitingMs: 600000, hospitalsTold: 3, hospital: 'Demo Heart Hospital', goldenHour: [stage] },
    ] })
    render(<EmergenciesPage />)
    const rows = (await screen.findAllByRole('listitem')).filter((li) => li.className.includes('queue-item'))
    expect(rows[0]).toHaveTextContent('EC-2026-0002')
    expect(rows[0]).toHaveTextContent('3 hospital(s) told, none accepted')
    expect(rows[1]).toHaveTextContent('Accepted by Demo Heart Hospital')
  })
})

describe('analytics (96)', () => {
  it('shows totals, stage medians against targets and the acceptance table', async () => {
    ops.analytics.mockResolvedValue({ total: 5, falseAlarm: { count: 1, ratePercent: 20 }, perDay: [{ date: '2026-11-22', count: 2 }, { date: '2026-11-23', count: 3 }],
      stages: { alertToAccept: { samples: 4, medianMs: 90000, targetMs: null, overTarget: null }, sceneTime: { samples: 3, medianMs: 780000, targetMs: 600000, overTarget: 2 } },
      acceptance: [{ hospital: 'Demo Heart Hospital', notified: 4, accepted: 3, rejected: 1, rate: 75 }] })
    render(<AnalyticsPage />)
    expect(await screen.findByText('20%')).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /Ambulance scene time/ })).toHaveTextContent('13.0 min')
    expect(screen.getByRole('row', { name: /Ambulance scene time/ })).toHaveTextContent('2 of 3')
    expect(screen.getByRole('row', { name: /Demo Heart Hospital/ })).toHaveTextContent('75%')
    await userEvent.selectOptions(screen.getByLabelText('Period'), '30')
    await waitFor(() => expect(ops.analytics).toHaveBeenLastCalledWith(30))
  })
})

describe('backup and restore (99)', () => {
  const upload = (obj) => userEvent.upload(screen.getByLabelText('Backup file'), new File([JSON.stringify(obj)], 'b.json', { type: 'application/json' }))
  it('refuses a file that fails its checks and shows why', async () => {
    ops.checkBackup.mockResolvedValue({ ok: false, problems: ['hospitals[0]: name is required'] })
    render(<MemoryRouter><BackupPage /></MemoryRouter>)
    await upload({ format: 'healthtwin-backup' })
    expect(await screen.findByRole('alert')).toHaveTextContent('hospitals[0]: name is required')
    expect(screen.queryByRole('button', { name: 'Restore data' })).not.toBeInTheDocument()
  })
  it('restores only after the word RESTORE is typed', async () => {
    ops.checkBackup.mockResolvedValue({ ok: true, problems: [] })
    ops.restore.mockResolvedValue({ restored: { hospitals: 5 } })
    render(<MemoryRouter><BackupPage /></MemoryRouter>)
    await upload({ format: 'healthtwin-backup', version: 1, data: {} })
    const button = await screen.findByRole('button', { name: 'Restore data' })
    expect(button).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Type RESTORE to confirm'), 'RESTORE')
    await userEvent.click(button)
    expect(ops.restore).toHaveBeenCalledWith({ format: 'healthtwin-backup', version: 1, data: {} }, 'RESTORE')
    expect(await screen.findByText(/Restored: hospitals 5/)).toBeInTheDocument()
  })
})
