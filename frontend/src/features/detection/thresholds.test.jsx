import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DEFAULT_THRESHOLDS } from '@shared/vitals.js'
import ThresholdEditor, { diffThresholds } from './ThresholdEditor.jsx'

describe('ThresholdEditor', () => {
  beforeEach(() => vi.clearAllMocks())
  it('diffs only the vitals that changed', () => {
    const f = { ...Object.fromEntries(Object.keys(DEFAULT_THRESHOLDS).map((k) => [k, { lo: String(DEFAULT_THRESHOLDS[k].normal[0]), hi: String(DEFAULT_THRESHOLDS[k].normal[1]), ...Object.fromEntries(Object.entries(DEFAULT_THRESHOLDS[k].critical).map(([c, v]) => [c, String(v)])) }])) }
    expect(diffThresholds(f, DEFAULT_THRESHOLDS)).toEqual({})
    f.hr.lo = '50'
    const out = diffThresholds(f, DEFAULT_THRESHOLDS)
    expect(Object.keys(out)).toEqual(['hr'])
    expect(out.hr.normal[0]).toBe(50)
  })
  it('saves the edited value and shows server errors', async () => {
    const onSave = vi.fn().mockResolvedValueOnce().mockRejectedValueOnce(Object.assign(new Error('Invalid thresholds'), { errors: ['hr: bad'] }))
    render(<ThresholdEditor current={DEFAULT_THRESHOLDS} compare={DEFAULT_THRESHOLDS} onSave={onSave} onReset={vi.fn()} />)
    const lo = screen.getByLabelText(/heart rate normal low/i)
    await userEvent.clear(lo); await userEvent.type(lo, '50')
    await userEvent.click(screen.getByRole('button', { name: /save thresholds/i }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][0].hr.normal[0]).toBe(50)
    expect(await screen.findByRole('status')).toHaveTextContent(/saved/i)
    await userEvent.click(screen.getByRole('button', { name: /save thresholds/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('hr: bad')
  })
})
