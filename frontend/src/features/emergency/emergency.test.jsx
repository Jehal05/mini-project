// Phase 7 screens: each test names the naive version it is meant to catch.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from '../../design/index.js'

const handlers = vi.hoisted(() => ({ map: new Map() }))
const fakeSocket = vi.hoisted(() => ({
  on: (n, fn) => handlers.map.set(n, [...(handlers.map.get(n) ?? []), fn]),
  off: (n, fn) => handlers.map.set(n, (handlers.map.get(n) ?? []).filter((f) => f !== fn)),
}))
vi.mock('../monitoring/useLiveVitals.js', () => ({ getSocket: () => Promise.resolve(fakeSocket), useLiveVitals: () => ({ live: null, connected: true }) }))
const hear = (name, payload) => act(async () => (handlers.map.get(name) ?? []).forEach((fn) => fn(payload)))

const api = vi.hoisted(() => ({
  sos: vi.fn(), active: vi.fn(), mine: vi.fn(), firstAid: vi.fn(), saveSymptoms: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), location: vi.fn(), ack: vi.fn(), publicStatus: vi.fn(), seen: vi.fn(),
}))
vi.mock('./api.js', () => ({ emergencyApi: api }))
const detApi = vi.hoisted(() => ({ status: vi.fn() }))
vi.mock('../detection/api.js', () => ({ detectionApi: detApi }))
const sound = vi.hoisted(() => ({ playAlert: vi.fn(), unlockAudio: vi.fn(), pref: true }))
vi.mock('./alertSound.js', () => ({
  playAlert: sound.playAlert,
  unlockAudio: sound.unlockAudio,
  isUnlocked: () => true,
  soundPref: { get: () => sound.pref, set: (v) => (sound.pref = v) },
}))

const { clockOffset, secondsLeft } = await import('./clock.js')
const { ConfirmationScreen } = await import('./ConfirmationScreen.jsx')
const { CancelDialog } = await import('./CancelDialog.jsx')
const { CaseStatus } = await import('./CaseStatus.jsx')
const { LevelAlert } = await import('./LevelAlert.jsx')
const { LocationShare } = await import('./LocationShare.jsx')
const { FirstAid } = await import('./FirstAid.jsx')
const { SosDialog, currentLocation } = await import('./SosDialog.jsx')
const { EmergencyHistory } = await import('./EmergencyHistory.jsx')
const { EmergencySection } = await import('./index.jsx')
const { useEmergency } = await import('./useEmergency.js')
const { default: FamilyStatus } = await import('../../pages/FamilyStatus.jsx')

const iso = (ms) => new Date(Date.now() + ms).toISOString()
const baseCase = (over = {}) => ({
  id: 'c1', isLive: true, status: 'searching', source: 'auto_detection', severity: 3, symptoms: null, location: null, acknowledgements: [], contactAlerts: [], timeline: [{ type: 'sent', at: iso(0), message: 'Patient confirmed: sent now' }],
  escalation: { round: 1, radiusKm: 10, roundStartedAt: iso(-5000), confirmDeadline: iso(-1000) }, ...over,
})
const awaiting = (ms = 10_000, over = {}) => baseCase({ status: 'awaiting_confirmation', escalation: { round: 0, radiusKm: 10, confirmDeadline: iso(ms) }, ...over })

function setGeolocation(geo) {
  Object.defineProperty(globalThis.navigator, 'geolocation', { value: geo, configurable: true })
}

beforeEach(() => {
  vi.clearAllMocks()
  handlers.map.clear()
  sound.pref = true
  sound.playAlert.mockReturnValue(true)
  setGeolocation(undefined)
  api.active.mockResolvedValue({ case: null, serverNow: iso(0), simulated: true })
  api.mine.mockResolvedValue({ items: [], page: 1, pages: 1, total: 0 })
  api.firstAid.mockResolvedValue({ source: { name: 'MedlinePlus: Heart attack first aid', url: 'https://medlineplus.gov/ency/article/000063.htm', also: 'Mayo Clinic' }, dispatcherFirst: 'Follow the instructions of the 112 or 108 dispatcher first.', steps: [{ id: 'call', title: 'Call 112 or 108 now', text: 'Do not wait.' }], aspirin: { shown: false } })
  api.location.mockResolvedValue({})
  detApi.status.mockResolvedValue({ level: 0, primary: null })
})
afterEach(() => vi.useRealTimers())

describe('the countdown is read from the server (feature 44)', () => {
  it('corrects for a browser clock that is wrong (a version that trusts the local clock shows 15, not 10)', () => {
    const client = 1_000_000
    const server = client + 5_000 // the browser is 5 s behind the server
    const offset = clockOffset(new Date(server).toISOString(), client)
    expect(offset).toBe(5000)
    expect(secondsLeft(new Date(server + 10_000).toISOString(), offset, client)).toBe(10)
    expect(Math.ceil((server + 10_000 - client) / 1000)).toBe(15) // what ignoring the offset would show
  })

  it('never goes below zero and copes with a missing deadline', () => {
    expect(secondsLeft(new Date(Date.now() - 60_000).toISOString())).toBe(0)
    expect(secondsLeft(undefined)).toBe(0)
    expect(clockOffset('nonsense')).toBe(0)
  })
})

describe('ConfirmationScreen (features 43, 44)', () => {
  const setup = (props = {}) => {
    const p = { caseView: awaiting(), offsetMs: 0, onConfirm: vi.fn().mockResolvedValue(), onSymptoms: vi.fn().mockResolvedValue(), onCancelRequest: vi.fn(), ...props }
    return { p, ...render(<ConfirmationScreen {...p} />) }
  }

  it('asks "Are you okay?", lists exactly the four AHA warning signs, and keeps 112 and 108 one tap away', () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Are you okay?' })).toBeInTheDocument()
    const boxes = screen.getAllByRole('checkbox').map((b) => b.closest('label').textContent)
    expect(boxes).toEqual(['Chest pain or discomfort', 'Arm, shoulder, jaw, neck or back pain', 'Shortness of breath', 'Nausea or light-headedness'])
    expect(screen.getByRole('link', { name: 'Call 112' })).toHaveAttribute('href', 'tel:112')
    expect(screen.getByRole('link', { name: 'Call 108 ambulance' })).toHaveAttribute('href', 'tel:108')
  })

  it('shows the time left from the stored deadline, so a reload mid-countdown does not restart at 10', () => {
    setup({ caseView: awaiting(4000) })
    expect(screen.getByRole('timer')).toHaveTextContent('4')
  })

  it('counts down on screen, and at zero only DISPLAYS "Sending help": the browser never sends (the server does)', async () => {
    vi.useFakeTimers()
    const { p } = setup({ caseView: awaiting(3000) })
    expect(screen.getByRole('timer')).toHaveTextContent('3')
    await act(async () => vi.advanceTimersByTime(2000))
    expect(screen.getByRole('timer')).toHaveTextContent('1')
    await act(async () => vi.advanceTimersByTime(20_000))
    expect(screen.getByRole('timer')).toHaveTextContent('0')
    expect(screen.getByText('Sending help…')).toBeInTheDocument()
    expect(p.onConfirm).not.toHaveBeenCalled()
    expect(p.onCancelRequest).not.toHaveBeenCalled()
  })

  it('saves each ticked symptom at once (so it survives an automatic send) and sends all four answers with "Send help now"', async () => {
    const { p } = setup()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Chest pain or discomfort' }))
    expect(p.onSymptoms).toHaveBeenCalledWith({ chestPain: true })
    await userEvent.click(screen.getByRole('checkbox', { name: 'Shortness of breath' }))
    await userEvent.click(screen.getByRole('button', { name: 'Send help now' }))
    expect(p.onConfirm).toHaveBeenCalledWith({ chestPain: true, upperBodyPain: false, shortnessOfBreath: true, nauseaOrLightheaded: false })
  })

  it('"I\'m okay" only asks to cancel: it never cancels or sends by itself (a version that cancels on "I\'m okay" fails)', async () => {
    const { p } = setup()
    await userEvent.click(screen.getByRole('button', { name: /I.m okay/ }))
    expect(p.onCancelRequest).toHaveBeenCalledTimes(1)
    expect(p.onConfirm).not.toHaveBeenCalled()
  })

  it('shows an error and keeps the screen if sending fails', async () => {
    setup({ onConfirm: vi.fn().mockRejectedValue(new Error('Network down')) })
    await userEvent.click(screen.getByRole('button', { name: 'Send help now' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Network down')
    expect(screen.getByRole('button', { name: 'Send help now' })).toBeEnabled()
  })
})

describe('CancelDialog (feature 49)', () => {
  it('cannot be submitted without a reason, and then sends the chosen reason and note', async () => {
    const onCancel = vi.fn().mockResolvedValue()
    render(<CancelDialog open onClose={() => {}} onCancel={onCancel} />)
    const submit = screen.getByRole('button', { name: 'Cancel emergency' })
    expect(submit).toBeDisabled()
    expect(screen.getAllByRole('radio').map((r) => r.closest('label').textContent)).toEqual(['It was a false alarm', 'I am feeling better', 'I am already at a hospital', 'Another reason'])
    await userEvent.click(screen.getByRole('radio', { name: 'It was a false alarm' }))
    await userEvent.type(screen.getByLabelText(/Note/), 'Pressed by mistake')
    await userEvent.click(submit)
    expect(onCancel).toHaveBeenCalledWith('false_alarm', 'Pressed by mistake')
  })

  it('warns that a hospital and ambulance are involved once a hospital has accepted', () => {
    const { rerender } = render(<CancelDialog open onClose={() => {}} onCancel={vi.fn()} />)
    expect(screen.queryByText(/releases the ambulance/)).not.toBeInTheDocument()
    rerender(<CancelDialog open onClose={() => {}} onCancel={vi.fn()} afterAcceptance />)
    expect(screen.getByText(/tells the hospital and releases the ambulance/)).toBeInTheDocument()
  })

  it('shows why it failed and stays open', async () => {
    render(<CancelDialog open onClose={() => {}} onCancel={vi.fn().mockRejectedValue(new Error('The case is already arrived'))} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Another reason' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel emergency' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('already arrived')
  })
})

describe('CaseStatus (features 45, 47, 48)', () => {
  const show = (c, props = {}) => render(<CaseStatus caseView={c} offsetMs={0} onCancelRequest={vi.fn()} {...props} />)

  it('searching: shows the radius, the round and when it widens', () => {
    show(baseCase({ escalation: { round: 1, radiusKm: 10, roundStartedAt: iso(-10_000) } }))
    expect(screen.getByText(/within/)).toHaveTextContent('Looking for a hospital within 10 km (round 1 of 3)')
    expect(screen.getByText(/widens to 20 km in about 5\d s/)).toBeInTheDocument()
  })

  it('round 3 says the central admin is alerted next, not another radius', () => {
    show(baseCase({ escalation: { round: 3, radiusKm: 30, roundStartedAt: iso(-1000) } }))
    expect(screen.getByText(/within/)).toHaveTextContent('30 km (round 3 of 3)')
    expect(screen.getByText(/central admin is alerted/)).toBeInTheDocument()
  })

  it('unresolved: tells the patient to call 112 in an alert, with the call buttons', () => {
    show(baseCase({ status: 'unresolved' }))
    expect(screen.getByRole('alert')).toHaveTextContent('No hospital has accepted yet. Call 112 now.')
    expect(screen.getByRole('link', { name: 'Call 112' })).toBeInTheDocument()
  })

  it('accepted: says so, and offers cancel', async () => {
    const onCancelRequest = vi.fn()
    show(baseCase({ status: 'accepted' }), { onCancelRequest })
    expect(screen.getAllByText('A hospital has accepted').length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel emergency…' }))
    expect(onCancelRequest).toHaveBeenCalled()
  })

  it('lists alerted contacts with their pre-filled WhatsApp link, and who has tapped "Seen"', () => {
    const c = baseCase({
      contactAlerts: [{ name: 'Meera', relation: 'spouse', channels: ['email', 'whatsapp'], whatsappLink: 'https://wa.me/919800000001?text=hi' }, { name: 'Lakshmi', relation: 'mother', channels: ['whatsapp'], whatsappLink: null }],
      acknowledgements: [{ recipientType: 'contact', recipientId: '+919800000001', name: 'Meera', seenAt: iso(0) }],
    })
    show(c)
    const section = screen.getByRole('region', { name: 'Emergency contacts alerted' })
    expect(within(section).getByRole('link', { name: 'Message Meera on WhatsApp' })).toHaveAttribute('href', 'https://wa.me/919800000001?text=hi')
    const items = within(section).getAllByRole('listitem')
    expect(within(items[0]).getByText('Seen')).toBeInTheDocument()
    expect(within(items[1]).getByText('Not seen yet')).toBeInTheDocument()
    expect(within(items[1]).queryByRole('link')).not.toBeInTheDocument()
  })
})

describe('LevelAlert (feature 42)', () => {
  const update = (level, over = {}) => hear('detection:update', { patientId: 'p1', level, primary: { message: 'Heart rate 136 BPM is above 120' }, ...over })
  const mount = async (statusLevel = 0) => {
    detApi.status.mockResolvedValue({ level: statusLevel, primary: statusLevel ? { message: 'Existing reason' } : null })
    render(<LevelAlert patientId="p1" />)
    await waitFor(() => expect(detApi.status).toHaveBeenCalledWith('p1'))
    await act(async () => {})
  }

  it('shows a Level 2 alert and plays the Level 2 sound once when the level rises', async () => {
    await mount(0)
    await update(2)
    expect(screen.getByRole('alert')).toHaveTextContent('Level 2 Urgent')
    expect(screen.getByRole('alert')).toHaveTextContent('Heart rate 136 BPM is above 120')
    expect(sound.playAlert).toHaveBeenCalledTimes(1)
    expect(sound.playAlert).toHaveBeenCalledWith(2)
  })

  it('does not repeat the sound for the same level, and plays again for Level 3 (a version that beeps on every update fails)', async () => {
    await mount(0)
    await update(2)
    await update(2)
    await update(2)
    expect(sound.playAlert).toHaveBeenCalledTimes(1)
    await update(3)
    expect(sound.playAlert).toHaveBeenCalledTimes(2)
    expect(sound.playAlert).toHaveBeenLastCalledWith(3)
    expect(screen.getByRole('alert')).toHaveTextContent('Level 3 Critical')
    await update(2) // easing off is silent
    await update(0)
    expect(sound.playAlert).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not vibrate before the person has touched the page (the browser blocks it and logs a console error)', async () => {
    const vibrate = vi.fn()
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })
    Object.defineProperty(navigator, 'userActivation', { value: { hasBeenActive: false }, configurable: true })
    await mount(0)
    await update(3)
    expect(vibrate).not.toHaveBeenCalled()
    Object.defineProperty(navigator, 'userActivation', { value: { hasBeenActive: true }, configurable: true })
    await update(0)
    await update(3)
    expect(vibrate).toHaveBeenCalledTimes(1)
    delete navigator.vibrate
    delete navigator.userActivation
  })

  it('opening the page while already at Level 2 shows the banner but does not beep', async () => {
    await mount(2)
    expect(screen.getByRole('alert')).toHaveTextContent('Level 2 Urgent')
    expect(sound.playAlert).not.toHaveBeenCalled()
  })

  it('muted: still shows the alert, plays nothing, and the choice is remembered', async () => {
    await mount(0)
    await userEvent.click(screen.getByRole('button', { name: 'Alert sound: On' }))
    expect(sound.pref).toBe(false)
    expect(screen.getByRole('button', { name: 'Alert sound: Off' })).toHaveAttribute('aria-pressed', 'false')
    await update(3)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(sound.playAlert).not.toHaveBeenCalled()
  })

  it('if the browser blocks sound, says to tap the page', async () => {
    sound.playAlert.mockReturnValue(false)
    await mount(0)
    await update(2)
    expect(screen.getByText(/Tap anywhere on the page/)).toBeInTheDocument()
  })

  it('ignores other patients, lets Level 2 be dismissed, and never lets Level 3 be dismissed', async () => {
    await mount(0)
    await hear('detection:update', { patientId: 'someone-else', level: 3 })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await update(2)
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await update(3)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument()
  })
})

describe('LocationShare (feature 46)', () => {
  it('sends GPS position with its accuracy, but not more often than every 10 seconds', async () => {
    let onPos
    setGeolocation({ watchPosition: vi.fn((ok) => ((onPos = ok), 7)), clearWatch: vi.fn() })
    render(<LocationShare caseId="c1" location={null} />)
    const pos = (acc) => ({ coords: { latitude: 18.5204, longitude: 73.8567, accuracy: acc } })
    await act(async () => onPos(pos(24.6)))
    expect(api.location).toHaveBeenCalledWith('c1', { lat: 18.5204, lng: 73.8567, accuracyM: 25, source: 'gps' })
    await act(async () => onPos(pos(10)))
    expect(api.location).toHaveBeenCalledTimes(1)
  })

  it('stops watching when it goes away', () => {
    const clearWatch = vi.fn()
    setGeolocation({ watchPosition: vi.fn(() => 7), clearWatch })
    const { unmount } = render(<LocationShare caseId="c1" location={null} />)
    unmount()
    expect(clearWatch).toHaveBeenCalledWith(7)
  })

  it('falls back to a manual form when GPS is refused, and validates it before sending', async () => {
    setGeolocation({ watchPosition: vi.fn((_ok, fail) => (fail({ code: 1 }), 1)), clearWatch: vi.fn() })
    render(<LocationShare caseId="c1" location={null} />)
    const form = await screen.findByRole('form', { name: 'Enter your location' })
    const lat = within(form).getByLabelText('Latitude')
    const lng = within(form).getByLabelText('Longitude')
    await userEvent.type(lat, '200')
    await userEvent.type(lng, '73.8')
    await userEvent.click(within(form).getByRole('button', { name: 'Share this location' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('latitude')
    expect(api.location).not.toHaveBeenCalled()
    await userEvent.clear(lat)
    await userEvent.type(lat, '18.52')
    await userEvent.type(within(form).getByLabelText(/Landmark/), 'Near Shaniwar Wada')
    await userEvent.click(within(form).getByRole('button', { name: 'Share this location' }))
    await waitFor(() => expect(api.location).toHaveBeenCalledWith('c1', { lat: 18.52, lng: 73.8, source: 'manual', address: 'Near Shaniwar Wada' }))
  })

  it('without any GPS support it starts on the manual form; empty boxes are not "0, 0"', async () => {
    render(<LocationShare caseId="c1" location={null} />)
    await userEvent.click(screen.getByRole('button', { name: 'Share this location' }))
    expect(api.location).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('shows the shared point, accuracy and source', () => {
    render(<LocationShare caseId="c1" location={{ point: { coordinates: [73.8567, 18.5204] }, accuracyM: 30, source: 'gps' }} />)
    expect(screen.getByText(/18\.52040, 73\.85670/)).toBeInTheDocument()
    expect(screen.getByText(/about 30 m accuracy/)).toBeInTheDocument()
    expect(screen.getByText('Shared')).toBeInTheDocument()
  })
})

describe('FirstAid (feature 104)', () => {
  it('always shows 112/108, the dispatcher-first line and the credited source', async () => {
    render(<FirstAid patientId="p1" />)
    expect(await screen.findByText(/dispatcher first/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Call 112' })).toHaveAttribute('href', 'tel:112')
    expect(screen.getByRole('link', { name: 'Call 108 ambulance' })).toHaveAttribute('href', 'tel:108')
    expect(screen.getByRole('link', { name: /MedlinePlus/ })).toHaveAttribute('href', 'https://medlineplus.gov/ency/article/000063.htm')
    expect(api.firstAid).toHaveBeenCalledWith('p1')
  })

  it('shows an aspirin step only if the server sent one (a screen that hard-codes aspirin fails)', async () => {
    const { unmount } = render(<FirstAid patientId="p1" />)
    await screen.findByText(/dispatcher first/)
    expect(screen.queryByText(/aspirin/i)).not.toBeInTheDocument()
    unmount()
    api.firstAid.mockResolvedValue({
      source: { name: 'MedlinePlus', url: 'https://medlineplus.gov/x', also: 'Mayo' }, dispatcherFirst: 'Follow the instructions of the 112 or 108 dispatcher first.',
      steps: [{ id: 'call', title: 'Call 112 or 108 now', text: 'Do not wait.' }, { id: 'aspirin', title: 'Aspirin: ask the dispatcher', text: 'Chew one only if the dispatcher says to.' }],
    })
    render(<FirstAid patientId="p1" />)
    expect(await screen.findByText(/Aspirin: ask the dispatcher/)).toBeInTheDocument()
  })

  it('still offers the calls when the steps cannot load', async () => {
    api.firstAid.mockRejectedValue(new Error('down'))
    render(<FirstAid patientId="p1" />)
    expect(await screen.findByText(/Call 112 or 108 and follow the dispatcher/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Call 112' })).toBeInTheDocument()
  })
})

describe('SosDialog (feature 41)', () => {
  it('sends nothing until "Send SOS", then posts for this patient with the GPS location', async () => {
    setGeolocation({ getCurrentPosition: (ok) => ok({ coords: { latitude: 18.52, longitude: 73.85, accuracy: 20.4 } }) })
    api.sos.mockResolvedValue({ case: baseCase() })
    const onSent = vi.fn()
    const onClose = vi.fn()
    render(<SosDialog open onClose={onClose} patientId="p1" onSent={onSent} />)
    expect(api.sos).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Send SOS' }))
    await waitFor(() => expect(api.sos).toHaveBeenCalledWith('p1', { lat: 18.52, lng: 73.85, accuracyM: 20, source: 'gps' }))
    expect(onSent).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('sends without a location when GPS is unavailable (SOS never waits on location)', async () => {
    api.sos.mockResolvedValue({ case: baseCase() })
    render(<SosDialog open onClose={() => {}} patientId="p1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Send SOS' }))
    await waitFor(() => expect(api.sos).toHaveBeenCalledWith('p1', undefined))
  })

  it('a GPS that never answers does not block the SOS', async () => {
    vi.useFakeTimers()
    setGeolocation({ getCurrentPosition: vi.fn() })
    const p = currentLocation(3000)
    await vi.advanceTimersByTimeAsync(3600)
    await expect(p).resolves.toBeUndefined()
  })

  it('on failure it says so, keeps the dialog open and points to 112/108', async () => {
    api.sos.mockRejectedValue(new Error('Server unreachable'))
    const onClose = vi.fn()
    render(<SosDialog open onClose={onClose} patientId="p1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Send SOS' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Server unreachable')
    expect(screen.getByRole('alert')).toHaveTextContent('Call 112 or 108')
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('EmergencyHistory (feature 50)', () => {
  const item = (id, status, over = {}) => ({ id, status, source: 'auto_detection', createdAt: '2026-11-10T10:00:00Z', timeline: [{ type: 'sent', at: '2026-11-10T10:00:10Z', message: 'Patient confirmed: sent now' }], ...over })

  it('lists incidents with status, cancel reason and timeline', async () => {
    api.mine.mockResolvedValue({ items: [item('a', 'cancelled', { cancellation: { reason: 'false_alarm' } }), item('b', 'closed', { source: 'manual_sos' })], page: 1, pages: 1, total: 2 })
    render(<EmergencyHistory patientId="p1" />)
    expect(await screen.findByText('Detected automatically')).toBeInTheDocument()
    expect(screen.getByText('SOS button')).toBeInTheDocument()
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
    expect(screen.getByText('It was a false alarm')).toBeInTheDocument()
    expect(screen.getAllByText('Patient confirmed: sent now')).toHaveLength(2)
  })

  it('says so when there are none, and pages through longer lists', async () => {
    const { unmount } = render(<EmergencyHistory patientId="p1" />)
    expect(await screen.findByText('No emergency incidents yet.')).toBeInTheDocument()
    unmount()
    api.mine.mockImplementation((_p, { page }) => Promise.resolve({ items: [item(`c${page}`, 'closed')], page, pages: 3, total: 3 }))
    render(<EmergencyHistory patientId="p1" />)
    expect(await screen.findByText('Page 1 of 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Newer' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Older' }))
    expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument()
    expect(api.mine).toHaveBeenLastCalledWith('p1', { page: 2, limit: 5 })
  })
})

describe('useEmergency and EmergencySection', () => {
  function Probe({ id = 'p1' }) {
    const { caseView, loaded } = useEmergency(id)
    return <p data-testid="probe">{loaded ? (caseView ? `${caseView.status}` : 'none') : 'loading'}</p>
  }

  it('restores a live case after a reload, and follows socket events for THIS patient only', async () => {
    api.active.mockResolvedValue({ case: awaiting(), serverNow: iso(0) })
    render(<Probe />)
    expect(await screen.findByText('awaiting_confirmation')).toBeInTheDocument()
    api.active.mockResolvedValue({ case: baseCase(), serverNow: iso(0) })
    const calls = api.active.mock.calls.length
    await hear('emergency:sent', { patientId: 'another-patient' })
    expect(api.active.mock.calls.length).toBe(calls) // someone else's event: no reload
    await hear('emergency:sent', { patientId: 'p1' })
    expect(await screen.findByText('searching')).toBeInTheDocument()
  })

  it('shows nothing when there is no live case', async () => {
    render(<Probe />)
    expect(await screen.findByText('none')).toBeInTheDocument()
  })

  it('full flow: confirmation, "Send help now" moves to the search view', async () => {
    api.active.mockResolvedValue({ case: awaiting(), serverNow: iso(0) })
    api.confirm.mockResolvedValue({ changed: true, case: baseCase() })
    render(<EmergencySection patientId="p1" refreshKey={0} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Send help now' }))
    expect(api.confirm).toHaveBeenCalledWith('c1', { chestPain: false, upperBodyPain: false, shortnessOfBreath: false, nauseaOrLightheaded: false })
    expect(await screen.findByRole('heading', { name: 'Emergency in progress' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Are you okay?' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Your location' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'First aid while you wait' })).toBeInTheDocument()
  })

  it('"I\'m okay" opens the reason dialog; choosing a reason cancels and shows the cancelled card', async () => {
    api.active.mockResolvedValue({ case: awaiting(), serverNow: iso(0) })
    api.cancel.mockResolvedValue({ case: baseCase({ isLive: false, status: 'cancelled', cancellation: { reason: 'feeling_better' } }) })
    render(<EmergencySection patientId="p1" refreshKey={0} />)
    await userEvent.click(await screen.findByRole('button', { name: /I.m okay/ }))
    expect(api.cancel).not.toHaveBeenCalled() // nothing is cancelled until a reason is chosen
    const dialog = await screen.findByRole('alertdialog', { name: 'Cancel this emergency?' })
    await userEvent.click(within(dialog).getByRole('radio', { name: 'I am feeling better' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel emergency' }))
    expect(api.cancel).toHaveBeenCalledWith('c1', 'feeling_better', undefined)
    expect(await screen.findByRole('heading', { name: 'Emergency cancelled' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Are you okay?' })).not.toBeInTheDocument()
  })

  it('after acceptance the cancel dialog warns about the hospital and ambulance', async () => {
    api.active.mockResolvedValue({ case: baseCase({ status: 'ambulance_assigned' }), serverNow: iso(0) })
    render(<EmergencySection patientId="p1" refreshKey={0} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel emergency…' }))
    expect(await screen.findByText(/releases the ambulance/)).toBeInTheDocument()
  })
})

describe('family status page (feature 48)', () => {
  const page = (over = {}) => ({ patientName: 'Rahul Sharma', contactName: 'Meera', status: 'searching', isLive: true, since: iso(-60_000), seen: false, location: { lat: 18.52, lng: 73.85, updatedAt: iso(0) }, ...over })
  const open = (token = 'tok') =>
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={[`/status/${token}`]}>
          <Routes>
            <Route path="/status/:token" element={<FamilyStatus />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
    )

  it('shows the case, and "I have seen this" records Seen once, then is disabled', async () => {
    api.publicStatus.mockResolvedValue(page())
    api.seen.mockResolvedValue({ recorded: true, seen: true })
    open('tok')
    expect(await screen.findByText(/may need urgent help/)).toBeInTheDocument()
    expect(api.publicStatus).toHaveBeenCalledWith('tok')
    expect(screen.getByRole('link', { name: 'open in a map' })).toHaveAttribute('href', expect.stringContaining('mlat=18.52'))
    api.publicStatus.mockResolvedValue(page({ seen: true }))
    await userEvent.click(screen.getByRole('button', { name: 'I have seen this' }))
    expect(api.seen).toHaveBeenCalledWith('tok')
    expect(await screen.findByRole('button', { name: 'You marked this as seen' })).toBeDisabled()
  })

  it('an unknown link says it is not valid, and a closed case says it is no longer open', async () => {
    api.publicStatus.mockRejectedValue(Object.assign(new Error('x'), { status: 404 }))
    const { unmount } = open('bad')
    expect(await screen.findByText('This status link is not valid.')).toBeInTheDocument()
    unmount()
    api.publicStatus.mockResolvedValue(page({ status: 'cancelled', isLive: false, cancellation: { reason: 'false_alarm' } }))
    open('tok')
    expect(await screen.findByText(/no longer open: It was a false alarm/)).toBeInTheDocument()
  })
})
