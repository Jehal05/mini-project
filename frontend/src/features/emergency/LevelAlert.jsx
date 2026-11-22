// Feature 42: an automatic alert, with sound, when detection reaches Level 2 or Level 3. The banner
// is always shown (sound is never the only signal); the sound plays when the level RISES, only after
// the person has tapped the page once (browsers block it before), and can be muted on this device.
import { useEffect, useRef, useState } from 'react'
import { DETECTION_EVENTS } from '@shared/detection.js'
import { Badge, Button, Card } from '../../design/index.js'
import { detectionApi } from '../detection/api.js'
import { getSocket } from '../monitoring/useLiveVitals.js'
import { playAlert, soundPref, unlockAudio } from './alertSound.js'

const COPY = {
  2: { tone: 'warning', badge: 'Level 2 Urgent', head: 'Urgent: your readings need attention.', body: 'Sit down and rest. If you feel unwell, press SOS or call 112.' },
  3: { tone: 'critical', badge: 'Level 3 Critical', head: 'Critical cardiac pattern detected.', body: 'Answer the question below. If you do not answer, help is sent automatically.' },
}

export function LevelAlert({ patientId }) {
  const [state, setState] = useState({ level: 0, message: '' })
  const [dismissed, setDismissed] = useState(0)
  const [soundOn, setSoundOn] = useState(() => soundPref.get())
  const [needsTap, setNeedsTap] = useState(false)
  const prev = useRef(null) // null until the level is known, so loading the page never beeps
  const soundRef = useRef(soundOn)
  soundRef.current = soundOn

  useEffect(() => {
    let alive = true
    let detach = () => {}
    prev.current = null
    // `live` is true for a socket update, false for the first snapshot read from REST. Only a live RISE
    // makes a sound: opening the page at Level 2 shows the banner but never beeps.
    const apply = (p, live) => {
      const level = p.level ?? 0
      const before = prev.current
      prev.current = level
      setState({ level, message: p.primary?.message ?? '' })
      if (live && before !== null && level >= 2 && level > before) {
        setDismissed(0)
        if (soundRef.current) setNeedsTap(!playAlert(level))
        // Browsers refuse to vibrate until the person has touched the page, and log a console error if asked.
        if (level >= 3 && globalThis.navigator?.userActivation?.hasBeenActive) globalThis.navigator.vibrate?.([200, 100, 200])
      }
    }
    detectionApi
      .status(patientId)
      .then((s) => alive && prev.current === null && apply(s, false))
      .catch(() => {})
    getSocket().then((s) => {
      if (!alive) return
      const onUpdate = (p) => p?.patientId === patientId && apply(p, true)
      s.on(DETECTION_EVENTS.UPDATE, onUpdate)
      detach = () => s.off(DETECTION_EVENTS.UPDATE, onUpdate)
    })
    return () => {
      alive = false
      detach()
    }
  }, [patientId])

  useEffect(() => {
    const unlock = () => {
      unlockAudio()
      setNeedsTap(false)
    }
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  function toggleSound() {
    const next = !soundOn
    setSoundOn(next)
    soundPref.set(next)
    if (next) unlockAudio()
  }

  const copy = COPY[state.level]
  const show = copy && dismissed !== state.level

  return (
    <div>
      <div className="flex justify-end">
        <button type="button" onClick={toggleSound} aria-pressed={soundOn} className="text-xs text-fg-muted underline">
          Alert sound: {soundOn ? 'On' : 'Off'}
        </button>
      </div>
      {show && (
        <Card status={copy.tone} className="mt-2" role="alert" aria-label="Automatic alert">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Badge tone={copy.tone}>{copy.badge}</Badge>
              <p className="mt-2 text-lg font-semibold">{copy.head}</p>
              <p className="mt-1 text-sm">{copy.body}</p>
              {state.message && <p className="mt-1 text-xs text-fg-muted">Why: {state.message}</p>}
              {soundOn && needsTap && <p className="mt-1 text-xs text-fg-muted">Tap anywhere on the page to switch the alert sound on.</p>}
            </div>
            {state.level === 2 && (
              <Button variant="secondary" size="sm" onClick={() => setDismissed(state.level)}>
                Dismiss
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
