// Feature 88: which recorded allergies does a prescribed drug match? Names are compared as whole words, and a short
// list of drug families covers the common cross-matches (an allergy to "penicillin" also covers amoxicillin).
const FAMILIES = {
  penicillin: ['penicillin', 'amoxicillin', 'ampicillin', 'piperacillin', 'cloxacillin', 'flucloxacillin', 'augmentin', 'co-amoxiclav'],
  sulfa: ['sulfa', 'sulfonamide', 'sulfamethoxazole', 'cotrimoxazole', 'co-trimoxazole', 'bactrim'],
  aspirin: ['aspirin', 'acetylsalicylic', 'ecosprin', 'disprin'],
  nsaid: ['nsaid', 'ibuprofen', 'diclofenac', 'naproxen', 'ketorolac', 'aspirin'],
  statin: ['statin', 'atorvastatin', 'rosuvastatin', 'simvastatin'],
  heparin: ['heparin', 'enoxaparin'],
  iodine: ['iodine', 'contrast', 'iohexol'],
  morphine: ['morphine', 'opioid', 'codeine'],
};

const words = (text) => String(text).toLowerCase().split(/[^a-z0-9-]+/).filter(Boolean);
const has = (haystack, needle) => haystack.some((w) => w === needle || (needle.length >= 5 && w.startsWith(needle)));

function expand(term) {
  const w = words(term);
  const names = new Set(w);
  for (const [family, members] of Object.entries(FAMILIES)) {
    if (w.some((x) => x === family || members.includes(x))) members.forEach((m) => names.add(m));
  }
  return [...names];
}

/** Returns the allergens (as the patient recorded them) that the drug matches. Empty list = no warning. */
export function matchingAllergies(drug, allergies = []) {
  const drugWords = words(drug);
  return allergies.filter((a) => expand(a.allergen).some((name) => has(drugWords, name))).map((a) => a.allergen);
}
