// Feature 104: first-aid text for a suspected heart attack, and the rule for when aspirin advice may be shown.
//
// SOURCE: the wording below follows MedlinePlus "Heart attack first aid" (U.S. National Library of
// Medicine, medlineplus.gov/ency/article/000063.htm) and the Mayo Clinic first-aid page, which agree:
// call the emergency number first, sit and rest, and take aspirin only if a doctor or the emergency
// operator says to. It is a short summary for a demo, not medical advice, and it still needs a
// clinician on the team to review it before any real use. Everything is simulated.

export const FIRST_AID_SOURCE = Object.freeze({
  name: 'MedlinePlus (U.S. National Library of Medicine): Heart attack first aid',
  url: 'https://medlineplus.gov/ency/article/000063.htm',
  also: 'Mayo Clinic: Heart attack first aid',
})

export const DISPATCHER_FIRST = 'Follow the instructions of the 112 or 108 dispatcher first. If they tell you something different, do what they say.'

const BASE_STEPS = Object.freeze([
  { id: 'call', title: 'Call 112 or 108 now', text: 'Do not wait for the symptoms to pass. Tell them where you are and that you think you are having a heart attack.' },
  { id: 'rest', title: 'Sit down and rest', text: 'Sit or lie down, keep calm and loosen tight clothing while you wait.' },
  { id: 'drive', title: 'Do not drive yourself', text: 'Wait for the ambulance or ask someone else to take you.' },
  { id: 'unresponsive', title: 'If someone is unresponsive and not breathing normally', text: 'Call 112 or 108, then start CPR: push hard and fast in the centre of the chest. If two people are there, one calls while the other does CPR. Use an AED if one is nearby.' },
])

const ASPIRIN_STEP = Object.freeze({
  id: 'aspirin',
  title: 'Aspirin: ask the dispatcher',
  text: 'Aspirin can reduce heart damage. Chew one only if the 112 or 108 dispatcher or your doctor says to. Do not delay the call to take it.',
})

const ALLERGY = /aspirin|acetylsalicylic|salicylate|nsaid/i
const THINNER = /blood.?thinner|anticoag|antiplatelet|warfarin|coumadin|acenocoumarol|apixaban|eliquis|rivaroxaban|xarelto|dabigatran|edoxaban|heparin|enoxaparin|clopidogrel|ticagrelor|prasugrel/i
const BLEEDING = /bleeding|haemophilia|hemophilia|ulcer/i
const names = (list) => list.map((x) => (typeof x === 'string' ? x : (x?.name ?? x?.drug ?? x?.type ?? '')))

/**
 * Aspirin advice is shown ONLY when the record says, explicitly, that there is no aspirin allergy and
 * no blood thinner. A missing or incomplete record means "not shown", never "assume it is fine".
 * Reads the likely field names (allergies; medications|currentMedications; onBloodThinner; conditions).
 */
export function aspirinAdvice(record) {
  if (!record) return { shown: false, reason: 'no_record' }
  const meds = record.medications ?? record.currentMedications
  const knowsAllergies = Array.isArray(record.allergies)
  const knowsThinner = Array.isArray(meds) || typeof record.onBloodThinner === 'boolean'
  if (!knowsAllergies || !knowsThinner) return { shown: false, reason: 'incomplete_record' }
  if (names(record.allergies).some((a) => ALLERGY.test(a))) return { shown: false, reason: 'aspirin_allergy' }
  if (record.onBloodThinner === true || names(Array.isArray(meds) ? meds : []).some((m) => THINNER.test(m))) return { shown: false, reason: 'blood_thinner' }
  if (names(Array.isArray(record.conditions) ? record.conditions : []).some((c) => BLEEDING.test(c))) return { shown: false, reason: 'bleeding_risk' }
  return { shown: true, reason: 'record_clear' }
}

/** The steps to show for this patient record. */
export function buildFirstAid(record) {
  const aspirin = aspirinAdvice(record)
  const steps = aspirin.shown ? [BASE_STEPS[0], BASE_STEPS[1], ASPIRIN_STEP, ...BASE_STEPS.slice(2)] : [...BASE_STEPS]
  return { source: FIRST_AID_SOURCE, dispatcherFirst: DISPATCHER_FIRST, steps, aspirin, simulated: true }
}
