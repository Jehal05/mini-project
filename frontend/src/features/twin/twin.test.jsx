// The Digital Twin card, the trends panel and the heart's 2D fallback.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { ThemeProvider } from '../../design/index.js'

const api = vi.hoisted(() => ({ trends: vi.fn() }))
vi.mock('../monitoring/api.js', () => ({ monitoringApi: api, API_URL: 'http://test', makeRequest: () => vi.fn() }))
const det = vi.hoisted(() => ({ status: { level: 0 } }))
vi.mock('../detection/useDetection.js', () => ({ useDetection: () => ({ status: det.status }) }))
vi.mock('../monitoring/useTokens.js', () => ({
  useTokens: () => ({ normal: '#00ff00', warning: '#ffaa00', critical: '#ff0000' }),
  useMotionAllowed: () => true,
}))

const { TwinCard } = await import('./TwinCard.jsx')
const { HeartView } = await import('./HeartView.jsx')

const baseline = { hr: 78, sys: 124, dia: 75, spo2: 98, temp: 36.8, rr: 15 }
const steadyLive = { vitals: { hr: 79, sys: 125, dia: 76, spo2: 98, temp: 36.8, rr: 15 }, status: 'normal' }
const cardiacLive = { vitals: { hr: 138, sys: 172, dia: 104, spo2: 86, temp: 36.9, rr: 28 }, status: 'critical' }
const ok = (direction, change) => ({ state: 'ok', direction, change })
const trends = (over = {}) => ({
  simulated: true,
  last24h: { hr: ok('rising', 12), sys: ok('steady', 0), dia: ok('steady', 0), spo2: ok('steady', 0), temp: ok('steady', 0), rr: ok('steady', 0) },
  last7d: { hr: ok('steady', 1), sys: ok('steady', 0), dia: ok('steady', 0), spo2: ok('steady', 0), temp: ok('steady', 0), rr: ok('steady', 0) },
  restingHr: { state: 'ok', direction: 'steady', perDay: 0, days: Array.from({ length: 7 }, (_, i) => ({ start: `d${i}`, value: 66 })) },
  drift: { hr: { state: 'none' }, sys: { state: 'none' }, dia: { state: 'none' }, spo2: { state: 'none' }, temp: { state: 'none' }, rr: { state: 'none' } },
  ...over,
})

const show = (props) => render(<ThemeProvider><TwinCard patientId="p1" baseline={baseline} {...props} /></ThemeProvider>)

beforeEach(() => {
  vi.clearAllMocks()
  api.trends.mockResolvedValue(trends())
  det.status = { level: 0 }
  HTMLCanvasElement.prototype.getContext = () => null // no WebGL in the test browser: the 2D heart is used
})

describe('Digital Twin card (feature 91)', () => {
  it('shows usual vs now for all six vitals, in words, and the simulated label', async () => {
    show({ live: cardiacLive })
    const table = screen.getByRole('table', { name: /usual and current reading/i })
    expect(within(table).getAllByRole('row')).toHaveLength(7) // header + 6
    expect(within(table).getByRole('row', { name: /Heart rate/ })).toHaveTextContent('78 BPM')
    expect(within(table).getByRole('row', { name: /Heart rate/ })).toHaveTextContent('138 BPM')
    expect(screen.getByText('Heart rate is 77% above your usual (78 BPM).')).toBeInTheDocument()
    expect(screen.getAllByText(/Simulated/i).length).toBeGreaterThan(0)
    await screen.findByText('Trends')
  })
  it('says what detection sees', async () => {
    det.status = { level: 3, primary: { message: 'Heart rate 138 BPM is above 120' } }
    show({ live: cardiacLive })
    expect(screen.getByText('Detection sees a Level 3 pattern: Heart rate 138 BPM is above 120')).toBeInTheDocument()
    await screen.findByText('Trends')
  })
  it('steady readings read as in line, with no alarming words', async () => {
    show({ live: steadyLive })
    expect(screen.getByText('All your readings are in line with your usual.')).toBeInTheDocument()
    await screen.findByText('Trends')
  })
  it('no live data and no baseline show "not enough data", not zeros (a version printing 0 fails)', async () => {
    show({ live: null, baseline: undefined })
    const rows = within(screen.getByRole('table', { name: /usual and current reading/i })).getAllByRole('row').slice(1)
    for (const r of rows) {
      expect(r).toHaveTextContent('--')
      expect(r).toHaveTextContent('not enough data yet')
      expect(r).not.toHaveTextContent(/\b0 (BPM|mmHg|%|°C|\/min)/)
    }
    expect(screen.getByText('Waiting for live readings.')).toBeInTheDocument()
    await screen.findByText('Trends')
  })
  it('its scrollable table can be reached with the keyboard', async () => {
    show({ live: steadyLive })
    expect(screen.getByRole('region', { name: 'Usual and current readings' })).toHaveAttribute('tabindex', '0')
    await screen.findByText('Trends')
  })
})

describe('trends panel (feature 92)', () => {
  it('shows each vital for 24 hours and 7 days', async () => {
    show({ live: steadyLive })
    const table = await screen.findByRole('table', { name: /trend of each vital/i })
    expect(within(table).getByRole('row', { name: /Heart rate/ })).toHaveTextContent('rising, about +12 BPM over the day')
    expect(within(table).getByRole('row', { name: /Heart rate/ })).toHaveTextContent('steady')
  })
  it('missing history reads "not enough data yet", never steady', async () => {
    const none = { state: 'not_enough_data' }
    api.trends.mockResolvedValue(trends({ last24h: { hr: none, sys: none, dia: none, spo2: none, temp: none, rr: none }, last7d: { hr: none, sys: none, dia: none, spo2: none, temp: none, rr: none }, restingHr: { state: 'not_enough_data', days: [] } }))
    show({ live: steadyLive })
    const table = await screen.findByRole('table', { name: /trend of each vital/i })
    expect(table).not.toHaveTextContent('steady')
    expect(table).toHaveTextContent('not enough data yet')
    expect(screen.getByText(/Resting heart rate: not enough data yet/)).toBeInTheDocument()
  })
  it('flags drift, and says nothing has drifted otherwise', async () => {
    show({ live: steadyLive })
    expect(await screen.findByText('No vital has drifted away from your usual over the last few days.')).toBeInTheDocument()
    api.trends.mockResolvedValue(trends({ drift: { ...trends().drift, hr: { state: 'drifting', direction: 'up' } } }))
    show({ live: steadyLive })
    expect(await screen.findByText('Heart rate has drifted up from your usual over several days.')).toBeInTheDocument()
  })
  it('a failed request leaves a plain message and the rest of the card working', async () => {
    api.trends.mockRejectedValue(new Error('x'))
    show({ live: steadyLive })
    expect(await screen.findByText('Trends are not available right now.')).toBeInTheDocument()
    expect(screen.getByText('All your readings are in line with your usual.')).toBeInTheDocument()
  })
})

describe('heart without WebGL (feature 101 fallback)', () => {
  it('draws a 2D heart with a text description, the live rate, and the status colour', () => {
    const { container, rerender } = render(<HeartView bpm={138} status="critical" />)
    expect(container.querySelector('[data-heart="2d"]')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /beating at 138 beats per minute, shown in critical colour/ })).toBeInTheDocument()
    expect(container.querySelector('path')).toHaveAttribute('fill', '#ff0000')
    rerender(<HeartView bpm={70} status="normal" />)
    expect(container.querySelector('path')).toHaveAttribute('fill', '#00ff00')
  })
  it('beat speed follows the heart rate (a fixed animation speed fails)', () => {
    const { container, rerender } = render(<HeartView bpm={120} status="normal" />)
    expect(container.querySelector('path').style.animation).toContain('0.5s')
    rerender(<HeartView bpm={60} status="normal" />)
    expect(container.querySelector('path').style.animation).toContain('1s')
  })
  it('no heart rate: it does not beat and says so', () => {
    const { container } = render(<HeartView bpm={null} status="normal" />)
    expect(container.querySelector('path').style.animation).toBe('none')
    expect(screen.getByText(/Waiting for a heart rate/)).toBeInTheDocument()
  })
})
