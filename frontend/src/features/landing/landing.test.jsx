import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ThemeProvider } from '../../design/index.js'
import LandingPage from './LandingPage.jsx'

globalThis.IntersectionObserver ??= class { observe() {} unobserve() {} disconnect() {} } // jsdom has none; framer-motion's whileInView needs one

describe('landing page', () => {
  it('tells the story and offers all four logins and the QR scan', () => {
    render(<ThemeProvider><MemoryRouter><LandingPage /></MemoryRouter></ThemeProvider>)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/hospital bed/i)
    for (const t of ['Detection', 'Connection', 'Response']) expect(screen.getByRole('heading', { name: t })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Patient login' })).toHaveAttribute('href', '/login')
    expect(screen.getByRole('link', { name: 'Doctor login' })).toHaveAttribute('href', '/login?portal=doctor')
    expect(screen.getByRole('link', { name: 'Hospital staff login' })).toHaveAttribute('href', '/login?portal=staff')
    expect(screen.getByRole('link', { name: 'Admin login' })).toHaveAttribute('href', '/login?portal=admin')
    expect(screen.getByRole('link', { name: 'Scan a QR passport' })).toHaveAttribute('href', '/scan')
    expect(screen.getByRole('img', { name: /heart with its four chambers/i })).toBeInTheDocument()
    expect(screen.getAllByText(/simulated|fictional/i).length).toBeGreaterThan(0)
  })
})
