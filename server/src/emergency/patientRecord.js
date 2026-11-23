// What the SOS code reads from OUR Patient record: the name, the code, the contacts and the first-aid inputs.
//
// FIRST AID / ASPIRIN: shared/firstaid.js only shows the aspirin step when the record says EXPLICITLY that there is no
// aspirin allergy and no blood thinner. Our Patient schema stores allergies and medications as arrays that default to [],
// so "none recorded" cannot be told apart from "never asked". So allergies and medications are passed as unknown
// (undefined) and the aspirin step is never shown, which is the safe direction. A future "medical history reviewed" flag
// on the Patient is what would let this be switched on.
const names = (list) => (Array.isArray(list) ? list.map((x) => x?.name).filter(Boolean) : undefined);

export function emergencyRecord(p) {
  if (!p) return null;
  return {
    _id: p._id,
    name: p.fullName ?? p.name,
    patientCode: p.patientId,
    conditions: names(p.medicalConditions) ?? [],
    allergies: undefined,
    medications: undefined,
    onBloodThinner: (p.medications ?? []).some((m) => m?.isBloodThinner) ? true : undefined,
  };
}

/** Contacts in priority order, honouring the patient's channel choices (email, WhatsApp). */
export function emergencyContacts(p) {
  if (!p) return [];
  const prefs = p.notificationPreferences ?? {};
  return [...(p.emergencyContacts ?? [])]
    .sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9))
    .map((c) => ({
      name: c.name,
      relation: c.relation,
      phone: c.phone,
      email: prefs.email === false ? undefined : c.email,
      whatsapp: prefs.whatsapp !== false,
    }));
}
