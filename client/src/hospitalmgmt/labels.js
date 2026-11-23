// Words and tones for the hospital management screens, kept in plain JS so they can be tested.
export const OUTCOMES = {
  accepted: { label: 'Accepted', tone: 'low' },
  rejected: { label: 'Declined', tone: 'neutral' },
  no_answer: { label: 'No answer', tone: 'moderate' },
  elsewhere: { label: 'Taken by another hospital', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  unresolved: { label: 'Unresolved', tone: 'critical' },
  waiting: { label: 'Waiting', tone: 'info' },
};
export const HISTORY_TABS = [['all', 'All'], ['accepted', 'Accepted'], ['rejected', 'Declined'], ['no_answer', 'No answer'], ['elsewhere', 'Taken elsewhere'], ['cancelled', 'Cancelled']];
export const SPECIALTY_LABELS = { cardiologist: 'Cardiologist', emergency: 'Emergency medicine', other: 'Other' };
export const BAY_STATE = { vacant: ['circle', 'Vacant', 'text-low'], occupied: ['octagon-alert', 'Occupied', 'text-critical'], cleaning: ['circle-dashed', 'Cleaning', 'text-muted'] };

/** 95 s → "1 min 35 s"; null → "–". */
export function formatSeconds(s) {
  if (s == null) return '–';
  const m = Math.floor(s / 60); const r = s % 60;
  return m ? `${m} min ${r} s` : `${r} s`;
}
