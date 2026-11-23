// Feature 49: cancel with a reason. "I'm okay" never cancels by itself: a real cardiac patient can
// feel fine and still need help, so a reason has to be chosen on purpose.
import { useState } from 'react'
import { CANCEL_REASONS } from '@shared/emergency.js'
import { Button, Modal } from '../../design/index.js'
import { CANCEL_LABEL } from './status.js'

export function CancelDialog({ open, onClose, onCancel, afterAcceptance = false }) {
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      await onCancel(reason, note.trim() || undefined)
      setReason('')
      setNote('')
    } catch (e) {
      setError(e.message || 'Could not cancel. Try again, or call 112.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      tone="critical"
      title="Cancel this emergency?"
      description={
        afterAcceptance
          ? 'A hospital has already accepted. Cancelling tells the hospital and releases the ambulance.'
          : 'Choose why. If you are unsure, keep it open: help is better early than late.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Keep it open
          </Button>
          <Button variant="danger" disabled={!reason} loading={busy} onClick={submit}>
            Cancel emergency
          </Button>
        </>
      }
    >
      <fieldset>
        <legend className="sr-only">Reason for cancelling</legend>
        <div className="space-y-2">
          {CANCEL_REASONS.map((r) => (
            <label key={r} className="flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm">
              <input type="radio" name="cancel-reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="h-4 w-4 accent-primary" />
              {CANCEL_LABEL[r]}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="mt-3 block text-xs text-fg-muted">
        Note (optional)
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={2}
          className="mt-1 w-full rounded-xl border border-line bg-surface-strong px-3 py-2 text-sm text-fg"
        />
      </label>
      {error && (
        <p role="alert" className="mt-3 text-sm text-critical">
          {error}
        </p>
      )}
    </Modal>
  )
}
