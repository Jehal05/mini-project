// Review item 6: the chart must only ever show the selected patient's data.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ThemeProvider } from '../../design/index.js'

const api = vi.hoisted(() => ({ history: vi.fn() }))
vi.mock('./api.js', () => ({ monitoringApi: api }))
const { HistoryChart } = await import('./HistoryChart.jsx')

const point = (min, hr) => ({ at: new Date(Date.UTC(2026, 10, 18, 8, min)).toISOString(), hr, status: 'normal' })
const update = (patientId, min, hr) => ({ patientId, at: point(min, hr).at, vitals: { hr }, status: 'normal' })

const count = () => Number(screen.getByTestId('history-chart').dataset.points)

function view(props) {
  return (
    <ThemeProvider>
      <HistoryChart {...props} />
    </ThemeProvider>
  )
}

beforeEach(() => {
  api.history.mockReset()
})

describe('HistoryChart', () => {
  it("ignores live updates for a different patient", async () => {
    api.history.mockResolvedValue({ points: [point(0, 70), point(1, 71)] })
    const { rerender } = render(view({ patientId: 'rahul', live: null }))
    await waitFor(() => expect(count()).toBe(2))

    rerender(view({ patientId: 'rahul', live: update('ananya', 2, 140) }))
    expect(count()).toBe(2) // another patient's tick is not drawn

    rerender(view({ patientId: 'rahul', live: update('rahul', 2, 72) }))
    await waitFor(() => expect(count()).toBe(3))
  })

  it("clears the old patient's points while the new patient's history loads", async () => {
    let resolveSecond
    api.history
      .mockResolvedValueOnce({ points: [point(0, 70), point(1, 71), point(2, 72)] })
      .mockImplementationOnce(() => new Promise((r) => (resolveSecond = r)))
    const { rerender } = render(view({ patientId: 'rahul', live: null }))
    await waitFor(() => expect(count()).toBe(3))

    rerender(view({ patientId: 'ananya', live: null }))
    await waitFor(() => expect(count()).toBe(0)) // nothing of Rahul's remains
    expect(api.history).toHaveBeenLastCalledWith('ananya', '1h')

    resolveSecond({ points: [point(0, 64)] })
    await waitFor(() => expect(count()).toBe(1))
  })
})
