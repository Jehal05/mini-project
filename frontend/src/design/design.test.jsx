import * as React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Badge, Button, Card, MedicalBackground, Modal, Table, ThemeProvider, VitalTile, useTheme } from './index.js'

describe('Button', () => {
  it('clicks, and is disabled while loading', async () => {
    const onClick = vi.fn()
    const { rerender } = render(<Button onClick={onClick}>Save</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    rerender(<Button onClick={onClick} loading>Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})

describe('Badge', () => {
  it('uses default labels for status tones', () => {
    render(<Badge tone="critical" />)
    expect(screen.getByText('Critical')).toBeInTheDocument()
  })
})

describe('Card', () => {
  it('renders title and status edge', () => {
    const { container } = render(<Card title="Vitals" status="warning">body</Card>)
    expect(screen.getByRole('heading', { name: 'Vitals' })).toBeInTheDocument()
    expect(container.firstChild.className).toContain('border-l-warning')
  })
})

describe('VitalTile', () => {
  it('colours by the shared thresholds and shows the Simulated label', () => {
    const { container, rerender } = render(<VitalTile vital="hr" value={78} />)
    expect(container.firstChild.dataset.status).toBe('normal')
    expect(screen.getByText('Simulated')).toBeInTheDocument()
    rerender(<VitalTile vital="hr" value={134} />)
    expect(container.firstChild.dataset.status).toBe('critical')
    rerender(<VitalTile vital="temp" value={37} />)
    expect(screen.getByText('37.0')).toBeInTheDocument()
  })
})

describe('Modal', () => {
  it('opens with focus inside, closes on Escape and returns focus', async () => {
    function Demo() {
      const [open, setOpen] = React.useState(false)
      return (
        <>
          <button onClick={() => setOpen(true)}>Open</button>
          <Modal open={open} onClose={() => setOpen(false)} title="Hello">
            <button>Inside</button>
          </Modal>
        </>
      )
    }
    render(<Demo />)
    const opener = screen.getByRole('button', { name: 'Open' })
    await userEvent.click(opener)
    expect(screen.getByRole('dialog', { name: 'Hello' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Inside' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('cannot be dismissed when dismissible is false', async () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="Countdown" tone="critical" dismissible={false}>
        <button>Send now</button>
      </Modal>,
    )
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByTestId('modal-backdrop'))
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('Table', () => {
  it('renders rows, mono columns and an empty state', async () => {
    const onRowClick = vi.fn()
    const { rerender } = render(
      <Table
        caption="Patients"
        rows={[{ id: 'HT-2026-0001', name: 'Rahul' }]}
        onRowClick={onRowClick}
        columns={[{ key: 'id', header: 'ID', mono: true }, { key: 'name', header: 'Name' }]}
      />,
    )
    expect(screen.getByText('HT-2026-0001').className).toContain('font-mono')
    await userEvent.click(screen.getByText('Rahul'))
    expect(onRowClick).toHaveBeenCalledWith({ id: 'HT-2026-0001', name: 'Rahul' })
    rerender(<Table rows={[]} columns={[{ key: 'id', header: 'ID' }]} empty="No patients" />)
    expect(screen.getByText('No patients')).toBeInTheDocument()
  })
})

describe('MedicalBackground', () => {
  it('shows the alert vignette only on the hospital portal', () => {
    const { rerender } = render(<MedicalBackground portal="hospital" alert>x</MedicalBackground>)
    expect(screen.getByTestId('alert-vignette')).toBeInTheDocument()
    rerender(<MedicalBackground portal="patient" alert>x</MedicalBackground>)
    expect(screen.queryByTestId('alert-vignette')).not.toBeInTheDocument()
  })
})

describe('ThemeProvider', () => {
  it('toggles data-theme on <html>', async () => {
    function Toggle() {
      const { theme, toggleTheme } = useTheme()
      return <button onClick={toggleTheme}>{theme}</button>
    }
    render(
      <ThemeProvider>
        <Toggle />
      </ThemeProvider>,
    )
    expect(document.documentElement.dataset.theme).toBe('dark')
    await userEvent.click(screen.getByRole('button', { name: 'dark' }))
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})
