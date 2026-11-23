import { describe, it, expect } from 'vitest'
import { aspirinAdvice, buildFirstAid, FIRST_AID_SOURCE, DISPATCHER_FIRST } from './firstaid.js'

const clear = { allergies: [], medications: [] }

describe('feature 104: aspirin advice is shown only when the record clearly allows it', () => {
  it('is shown when the record says no aspirin allergy and no blood thinner', () => {
    expect(aspirinAdvice(clear)).toEqual({ shown: true, reason: 'record_clear' })
    expect(aspirinAdvice({ allergies: ['penicillin'], medications: ['metformin'], conditions: ['diabetes'] }).shown).toBe(true)
  })

  it('is hidden with no record at all (a version that defaults to "fine" shows it)', () => {
    expect(aspirinAdvice(undefined)).toMatchObject({ shown: false, reason: 'no_record' })
    expect(aspirinAdvice(null).shown).toBe(false)
  })

  it('is hidden when allergies or medicines are simply not recorded (unknown is not "none")', () => {
    expect(aspirinAdvice({}).reason).toBe('incomplete_record')
    expect(aspirinAdvice({ allergies: [] }).shown).toBe(false)
    expect(aspirinAdvice({ medications: [] }).shown).toBe(false)
    expect(aspirinAdvice({ allergies: undefined, medications: [] }).shown).toBe(false)
  })

  it('is hidden with an aspirin or NSAID allergy, however it is written', () => {
    for (const a of ['Aspirin', 'aspirin allergy', 'Acetylsalicylic acid', 'NSAIDs']) {
      expect(aspirinAdvice({ allergies: [a], medications: [] })).toMatchObject({ shown: false, reason: 'aspirin_allergy' })
    }
    expect(aspirinAdvice({ allergies: [{ name: 'Aspirin' }], medications: [] }).shown).toBe(false)
  })

  it('is hidden on a blood thinner, by flag or by medicine name', () => {
    expect(aspirinAdvice({ allergies: [], onBloodThinner: true })).toMatchObject({ shown: false, reason: 'blood_thinner' })
    for (const m of ['Warfarin 5 mg', 'apixaban', 'Eliquis', 'clopidogrel', 'a blood thinner', 'Rivaroxaban']) {
      expect(aspirinAdvice({ allergies: [], medications: [m] })).toMatchObject({ shown: false, reason: 'blood_thinner' })
    }
    expect(aspirinAdvice({ allergies: [], medications: [{ name: 'Heparin' }] }).shown).toBe(false)
  })

  it('onBloodThinner: false is enough to know the answer, but a listed thinner still wins', () => {
    expect(aspirinAdvice({ allergies: [], onBloodThinner: false }).shown).toBe(true)
    expect(aspirinAdvice({ allergies: [], onBloodThinner: false, medications: ['warfarin'] }).shown).toBe(false)
  })

  it('is hidden with a bleeding disorder or ulcer in the conditions', () => {
    expect(aspirinAdvice({ ...clear, conditions: ['Haemophilia'] }).reason).toBe('bleeding_risk')
    expect(aspirinAdvice({ ...clear, conditions: ['stomach ulcer'] }).shown).toBe(false)
  })
})

describe('first-aid content', () => {
  it('always starts with calling 112 or 108, credits an official source, and defers to the dispatcher', () => {
    for (const record of [undefined, clear, { allergies: ['aspirin'], medications: [] }]) {
      const aid = buildFirstAid(record)
      expect(aid.steps[0].id).toBe('call')
      expect(aid.steps[0].title).toMatch(/112/)
      expect(aid.source).toBe(FIRST_AID_SOURCE)
      expect(aid.source.url).toMatch(/^https:\/\/medlineplus\.gov\//)
      expect(aid.dispatcherFirst).toBe(DISPATCHER_FIRST)
      expect(aid.simulated).toBe(true)
    }
  })

  it('has the aspirin step only when allowed, always after "call", and it says to ask the dispatcher', () => {
    const withAspirin = buildFirstAid(clear)
    const ids = withAspirin.steps.map((s) => s.id)
    expect(ids).toContain('aspirin')
    expect(ids.indexOf('aspirin')).toBeGreaterThan(ids.indexOf('call'))
    expect(withAspirin.steps.find((s) => s.id === 'aspirin').text).toMatch(/dispatcher/i)
    expect(buildFirstAid(undefined).steps.map((s) => s.id)).not.toContain('aspirin')
    expect(buildFirstAid({ allergies: [], medications: ['warfarin'] }).steps.map((s) => s.id)).not.toContain('aspirin')
  })
})
