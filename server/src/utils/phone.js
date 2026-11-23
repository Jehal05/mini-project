/** Normalises Indian-style phone input to +<digits>. Returns null when it does not look like a phone number. */
export function normalizePhone(input) {
  if (typeof input !== 'string') return null;
  let digits = input.replace(/[\s().-]/g, '');
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;
  if (/^\d{10}$/.test(digits)) digits = `+91${digits}`; // bare 10-digit number -> India
  else if (/^91\d{10}$/.test(digits)) digits = `+${digits}`;
  return /^\+\d{10,15}$/.test(digits) ? digits : null;
}
