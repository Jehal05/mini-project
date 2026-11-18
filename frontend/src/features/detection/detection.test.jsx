// Features 37, 38, 40 in the browser: gauge, panel, history table and the live-event hook.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RISK_LEVELS, DETECTION_EVENTS } from '@shared/detection.js'
import { ThemeProvider } from '../../design/index.js'

const socket = vi.hoisted(() => {
  const handlers = {}
  return {
    handlers,
    on: vi.fn((e, fn) => {
      ;(handlers[e] ||= new Set()).add(fn)
    }),
    off: vi.fn((e, fn) => handlers[e]?.delete(fn)),
    fire: (e, payload) => handlers[e]?.forEach((fn) => fn(payload)),
  }
})
vi.mock('../monitoring/useLiveVitals.js', () => ({ getSocket: () => Promise.resolve(socket) }))

const api = vi.hoisted(() => ({ status: vi.fn(), detections: vi.fn(), statuses: vi.fn() }))
vi.mock('./api.js', () => ({ detectionApi: api }))

const { RiskGauge } = await import('./RiskGauge.jsx')
const { DetectionPanel } = await import('./DetectionPanel.jsx')
const { DetectionHistory } = await import('./DetectionHistory.jsx')
const { useDetection } = await import('./useDetection.js')
const { LEVEL_TONE, RISK_TONE } = await import('./severity.js')

const wrap = ({ children }) => <ThemeProvider>{children}</ThemeProvider>
const rule = (level, message, id = `r${level}`) => ({ rule: id, level, message })
const status = (level, over = {}) => ({
  patientId: 'p1',
  level,
  rules: level ? [rule(level, 'Heart rate 135 BPM is above 120')] : [],
  risk: { score: 25, level: 'low', label: 'Low', breakdown: [{ factor: 'Age 45', points: 5 }] },
  case: null,
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  for (const k of Object.keys(socket.handlers)) delete socket.handlers[k]
})

describe('RiskGauge (feature 37)', () => {
  const needleAngle = () => {
    const n = screen.getByTestId('needle')
    const x2 = Number(n.getAttribute('x2'))
    const y2 = Number(n.getAttribute('y2'))
    return (Math.atan2(100 - y2, x2 - 100) * 180) / Math.PI // 180 = left, 0 = right
  }

  it('is an accessible meter that says the level in words', () => {
    render(<RiskGauge score={72} level="high" />)
    const meter = screen.getByRole('meter', { name: 'Cardiac risk' })
    expect(meter).toHaveAttribute('aria-valuenow', '72')
    expect(meter).toHaveAttribute('aria-valuemin', '0')
    expect(meter).toHaveAttribute('aria-valuemax', '100')
    expect(meter).toHaveAttribute('aria-valuetext', '72 out of 100, High risk')
    expect(screen.getByText('High risk')).toBeInTheDocument()
  })

  it('points the needle from far left (0) to far right (100)', () => {
    const { rerender } = render(<RiskGauge score={0} level="low" />)
    expect(needleAngle()).toBeCloseTo(180, 0)
    rerender(<RiskGauge score={50} level="moderate" />)
    expect(needleAngle()).toBeCloseTo(90, 0)
    rerender(<RiskGauge score={100} level="high" />)
    expect(needleAngle()).toBeCloseTo(0, 0)
  })

  it('highlights only the current band, and the bands match the shared thresholds', () => {
    const { container } = render(<RiskGauge score={40} level="moderate" />)
    const active = [...container.querySelectorAll('[data-band]')].filter((p) => p.dataset.active === 'true')
    expect(active.map((p) => p.dataset.band)).toEqual(['moderate'])
    expect(container.querySelectorAll('[data-band]')).toHaveLength(3)
    expect(RISK_LEVELS.moderate.min).toBe(35)
  })

  it('clamps out-of-range scores instead of drawing off the dial', () => {
    render(<RiskGauge score={250} level="high" />)
    expect(needleAngle()).toBeCloseTo(0, 0)
  })

  it('uses status tokens only (no raw colours)', () => {
    const { container } = render(<RiskGauge score={10} level="low" />)
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}|rgb\(|bg-black|text-white/)
  })
})

describe('DetectionPanel (features 34, 37, 38)', () => {
  const headline = () => screen.getByTestId('detection-headline')

  it('level 0: all clear, no reasons list', () => {
    render(<DetectionPanel status={status(0)} />, { wrapper: wrap })
    expect(headline()).toHaveTextContent('No abnormal pattern')
    expect(screen.getByLabelText('Detection level: No abnormal pattern')).toHaveTextContent('Clear')
    expect(screen.queryByRole('list', { name: 'Why this level' })).not.toBeInTheDocument()
  })

  it.each([
    [1, 'Level 1 Watch', /Watch:/],
    [2, 'Level 2 Urgent', /Urgent:/],
    [3, 'Level 3 Critical cardiac', /Critical cardiac pattern/],
  ])('level %i shows its label and plain-language headline', (level, label, re) => {
    render(<DetectionPanel status={status(level)} />, { wrapper: wrap })
    expect(screen.getByLabelText(`Detection level: ${label}`)).toHaveTextContent(label)
    expect(headline()).toHaveTextContent(re)
  })

  it('lists every reason, the first as the main one', () => {
    const rules = [rule(3, 'Very fast heart rate with low oxygen', 'a'), rule(2, 'Heart rate 135 BPM is above 120', 'b')]
    render(<DetectionPanel status={status(3, { rules })} />, { wrapper: wrap })
    const items = within(screen.getByRole('list', { name: 'Why this level' })).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Main reason:')
    expect(items[1]).not.toHaveTextContent('Main reason:')
  })

  it('shows the top three reasons and keeps the rest behind "more reasons"', () => {
    const rules = ['a', 'b', 'c', 'd', 'e'].map((id, i) => rule(i === 0 ? 3 : 2, `Reason ${id}`, id))
    render(<DetectionPanel status={status(3, { rules })} />, { wrapper: wrap })
    expect(within(screen.getByRole('list', { name: 'Why this level' })).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText('2 more reasons')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'More reasons', hidden: true })).getAllByRole('listitem', { hidden: true })).toHaveLength(2)
  })

  it('shows the open case only at Level 3', () => {
    const { rerender } = render(<DetectionPanel status={status(3, { case: { id: 'abcdef123456' } })} />, { wrapper: wrap })
    expect(screen.getByTestId('case-notice')).toHaveTextContent('123456')
    rerender(<DetectionPanel status={status(2, { case: { id: 'abcdef123456' } })} />)
    expect(screen.queryByTestId('case-notice')).not.toBeInTheDocument()
  })

  it('uses the case from the live event when the status has none yet', () => {
    render(<DetectionPanel status={status(3)} caseInfo={{ caseId: 'zzzzzz654321' }} />, { wrapper: wrap })
    expect(screen.getByTestId('case-notice')).toHaveTextContent('654321')
  })

  it('explains the risk score and carries the simulated notice', () => {
    render(<DetectionPanel status={status(0)} />, { wrapper: wrap })
    expect(screen.getByText('How the risk score is built')).toBeInTheDocument()
    expect(screen.getByText('Age 45')).toBeInTheDocument()
    expect(screen.getAllByText(/Not a medical device/).length).toBeGreaterThan(0)
  })

  it('shows loading and error states instead of a blank card', () => {
    const { rerender } = render(<DetectionPanel status={null} />, { wrapper: wrap })
    expect(screen.getByRole('status')).toHaveTextContent('Loading detection')
    rerender(<DetectionPanel status={null} error={new Error('x')} />)
    expect(screen.getByText(/not available right now/)).toBeInTheDocument()
  })

  it('red is only used for Level 3', () => {
    expect(LEVEL_TONE).toEqual({ 0: 'normal', 1: 'info', 2: 'warning', 3: 'critical' })
    expect(RISK_TONE.high).toBe('critical')
  })
})

describe('useDetection (live events)', () => {
  it('loads the status, then follows detection:update for this patient only', async () => {
    api.status.mockResolvedValue(status(0))
    const { result } = renderHook(() => useDetection('p1'))
    await waitFor(() => expect(result.current.status?.level).toBe(0))
    await waitFor(() => expect(socket.on).toHaveBeenCalledWith(DETECTION_EVENTS.UPDATE, expect.any(Function)))

    act(() => socket.fire(DETECTION_EVENTS.UPDATE, status(2)))
    expect(result.current.status.level).toBe(2)
    act(() => socket.fire(DETECTION_EVENTS.UPDATE, { ...status(3), patientId: 'someone-else' }))
    expect(result.current.status.level).toBe(2) // ignored
  })

  it('keeps the case announced by emergency:created', async () => {
    api.status.mockResolvedValue(status(0))
    const { result } = renderHook(() => useDetection('p1'))
    await waitFor(() => expect(socket.on).toHaveBeenCalledWith(DETECTION_EVENTS.CASE_CREATED, expect.any(Function)))
    act(() => socket.fire(DETECTION_EVENTS.CASE_CREATED, { patientId: 'p1', caseId: 'c9' }))
    expect(result.current.caseInfo.caseId).toBe('c9')
    act(() => socket.fire(DETECTION_EVENTS.CASE_CREATED, { patientId: 'other', caseId: 'c1' }))
    expect(result.current.caseInfo.caseId).toBe('c9')
  })

  it('reloads the status when detection clears', async () => {
    api.status.mockResolvedValueOnce(status(2)).mockResolvedValueOnce(status(0))
    const { result } = renderHook(() => useDetection('p1'))
    await waitFor(() => expect(result.current.status?.level).toBe(2))
    await waitFor(() => expect(socket.on).toHaveBeenCalledWith(DETECTION_EVENTS.CLEARED, expect.any(Function)))
    act(() => socket.fire(DETECTION_EVENTS.CLEARED, { patientId: 'p1' }))
    await waitFor(() => expect(result.current.status.level).toBe(0))
  })

  it('removes its listeners on unmount and resets when the patient changes', async () => {
    api.status.mockResolvedValue(status(1))
    const { result, rerender, unmount } = renderHook(({ id }) => useDetection(id), { initialProps: { id: 'p1' } })
    await waitFor(() => expect(result.current.status?.level).toBe(1))
    api.status.mockResolvedValue({ ...status(0), patientId: 'p2' })
    rerender({ id: 'p2' })
    await waitFor(() => expect(result.current.status?.patientId).toBe('p2'))
    unmount()
    await waitFor(() => expect(socket.off).toHaveBeenCalledWith(DETECTION_EVENTS.UPDATE, expect.any(Function)))
    expect(socket.handlers[DETECTION_EVENTS.UPDATE].size).toBe(0)
  })

  it('reports an error when the status cannot be loaded', async () => {
    api.status.mockRejectedValue(new Error('down'))
    const { result } = renderHook(() => useDetection('p1'))
    await waitFor(() => expect(result.current.error).toBeTruthy())
  })

  it('does nothing without a patient', () => {
    renderHook(() => useDetection(undefined))
    expect(api.status).not.toHaveBeenCalled()
  })
})

describe('DetectionHistory (feature 40)', () => {
  const row = (n, over = {}) => ({
    id: `d${n}`,
    at: `2026-11-18T08:0${n}:00.000Z`,
    severity: 3,
    primaryRule: 'multi:tachycardia-hypoxia',
    rules: [{ message: `Rule message ${n}` }],
    snapshot: { hr: 130 + n, spo2: 85 },
    outcome: 'case_created',
    ...over,
  })
  const page = (items, extra = {}) => ({ items, page: 1, limit: 6, total: items.length, pages: 1, ...extra })

  it('lists detections with level, reason, readings and outcome', async () => {
    api.detections.mockResolvedValue(page([row(1), row(2, { severity: 1, outcome: 'resolved' })]))
    render(<DetectionHistory patientId="p1" />, { wrapper: wrap })
    const table = await screen.findByRole('table', { name: 'Detection history' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Critical')
    expect(rows[0]).toHaveTextContent('Rule message 1')
    expect(rows[0]).toHaveTextContent('HR 131 · SpO2 85')
    expect(rows[0]).toHaveTextContent('Emergency case opened')
    expect(rows[1]).toHaveTextContent('Watch')
    expect(rows[1]).toHaveTextContent('Back to normal')
  })

  it('says so when there are no detections', async () => {
    api.detections.mockResolvedValue(page([]))
    render(<DetectionHistory patientId="p1" />, { wrapper: wrap })
    expect(await screen.findByText('No detections yet.')).toBeInTheDocument()
  })

  it('pages through results and hides the pager when there is one page', async () => {
    api.detections.mockImplementation((_id, { page: p }) => Promise.resolve(page([row(p)], { page: p, pages: 3, total: 3 })))
    render(<DetectionHistory patientId="p1" />, { wrapper: wrap })
    expect(await screen.findByText('Page 1 of 3 · 3 detections')).toBeInTheDocument()
    const newer = screen.getByRole('button', { name: 'Newer' })
    const older = screen.getByRole('button', { name: 'Older' })
    expect(newer).toBeDisabled()
    await userEvent.click(older)
    expect(await screen.findByText('Page 2 of 3 · 3 detections')).toBeInTheDocument()
    expect(api.detections).toHaveBeenLastCalledWith('p1', expect.objectContaining({ page: 2 }))
    await userEvent.click(screen.getByRole('button', { name: 'Older' }))
    expect(await screen.findByText(/Page 3 of 3/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Older' })).toBeDisabled()
  })

  it('filters by level and returns to page 1', async () => {
    api.detections.mockImplementation((_id, { page: p }) => Promise.resolve(page([row(1)], { page: p, pages: 2, total: 2 })))
    render(<DetectionHistory patientId="p1" />, { wrapper: wrap })
    await userEvent.click(await screen.findByRole('button', { name: 'Older' }))
    await screen.findByText(/Page 2 of 2/)
    await userEvent.selectOptions(screen.getByLabelText('Filter by level'), '3')
    await waitFor(() => expect(api.detections).toHaveBeenLastCalledWith('p1', expect.objectContaining({ page: 1, severity: '3' })))
  })

  it('shows an error message when the history cannot be loaded', async () => {
    api.detections.mockRejectedValue(new Error('down'))
    render(<DetectionHistory patientId="p1" />, { wrapper: wrap })
    expect(await screen.findByText(/not available right now/)).toBeInTheDocument()
  })
})
