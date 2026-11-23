import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import LeafletMap from './LeafletMap.jsx'
import LocationPicker from './LocationPicker.jsx'

vi.mock('./api.js', () => ({ responseApi: { geocode: vi.fn().mockResolvedValue({ items: [{ label: 'Kothrud, Pune', lng: 73.8077, lat: 18.5074 }], source: 'osm' }) } }))

const points = [
  { id: 'me', kind: 'patient', lng: 73.85, lat: 18.52, label: 'You' },
  { id: 'h1', kind: 'accepted', lng: 73.86, lat: 18.53, label: '1' },
  { id: 'amb', kind: 'ambulance', lng: 73.855, lat: 18.525, label: 'MH12AB1234' },
]

describe('real map (55, 76)', () => {
  it('draws the patient, hospitals and a tilted ambulance marker, the route and the accuracy circle', () => {
    const { container } = render(<LeafletMap points={points} lines={[{ id: 'l', path: [[73.85, 18.52], [73.86, 18.53]] }]} circles={[{ lng: 73.85, lat: 18.52, radiusM: 40 }]} label="Test map" />)
    expect(screen.getByRole('img', { name: 'Test map' })).toBeInTheDocument()
    expect(container.querySelectorAll('.leaflet-marker-icon')).toHaveLength(3)
    expect(container.querySelector('.ht-map-ambulance svg')).not.toBeNull()
    expect(container.querySelectorAll('path.leaflet-interactive').length).toBe(2) // the route and the accuracy circle
    expect(container.textContent).toMatch(/OpenStreetMap/)
  })
})

describe('choosing a location without GPS (52)', () => {
  it('searches an address and uses the chosen place', async () => {
    const onChange = vi.fn()
    render(<LocationPicker value={{ lng: 73.85, lat: 18.52, label: 'x' }} onChange={onChange} />)
    await userEvent.type(screen.getByLabelText('Search an address or area'), 'Kothrud')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Use this place' }))
    expect(onChange).toHaveBeenCalledWith({ lng: 73.8077, lat: 18.5074, label: 'Kothrud, Pune' })
  })
  it('asks for a longer search', async () => {
    render(<LocationPicker value={null} onChange={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('Search an address or area'), 'ab')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/at least 3/))
  })
})
