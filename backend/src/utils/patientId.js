import { nextSequence } from '../models/Counter.js';

/** Feature 10: HT-YYYY-NNNN from an atomic MongoDB counter, one sequence per year. */
export async function generatePatientId(date = new Date()) {
  const year = date.getFullYear();
  const seq = await nextSequence(`patientId:${year}`);
  return `HT-${year}-${String(seq).padStart(4, '0')}`;
}
