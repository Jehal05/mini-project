import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../../auth/AuthContext.jsx'
import { ThemeProvider } from '../../design/index.js'
import PortalLayout from '../../components/PortalLayout.jsx'

vi.mock('../monitoring/api.js', () => ({ monitoringApi: { getPatient: vi.fn().mockResolvedValue({ id: 'p1' }) }, API_URL: '', makeRequest: () => vi.fn() }))
vi.mock('../../components/IdleWarning.jsx', () => ({ default: () => null }))

const as = (role, patient) => ({ status: 'authenticated', user: { role, name: 'Test User', patient }, logout: vi.fn(), notice: null })
const view = (auth) => render(<ThemeProvider><AuthContext.Provider value={auth}><MemoryRouter><PortalLayout title="Anything">x</PortalLayout></MemoryRouter></AuthContext.Provider></ThemeProvider>)

describe('SOS on every patient screen (41)', () => {
  it('shows the SOS button on any patient page and opens the confirmation', async () => {
    view(as('patient', { patientId: 'HT-2026-0001' }))
    await userEvent.click(screen.getByRole('button', { name: 'Send emergency SOS' }))
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
  })
  it('is not shown to hospital or admin users', () => {
    view(as('hospital_staff'))
    expect(screen.queryByRole('button', { name: 'Send emergency SOS' })).toBeNull()
  })
})
