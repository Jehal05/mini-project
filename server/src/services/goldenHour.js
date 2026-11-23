// Golden-hour timer (feature 105). Pure: given a case document, returns elapsed time and overdue per stage.
const ms = (v) => (v == null ? null : new Date(v).getTime());
const iso = (n) => (n == null ? null : new Date(n).toISOString());
const round1 = (n) => Math.round(n * 10) / 10;

export const GOLDEN_HOUR_STAGES = [
  {
    key: 'cathLabAlert',
    label: 'Alert to cath lab team',
    targetMin: 30,
    start: (c) => c.alertedAt,
    end: (c) => (c.preparation?.cathLabTeamAlerted?.done ? c.preparation.cathLabTeamAlerted.at : null),
  },
  {
    key: 'ambulanceScene',
    label: 'Ambulance scene time',
    targetMin: 10,
    start: (c) => c.ambulanceAtPatientAt,
    end: (c) => c.patientOnBoardAt,
  },
  {
    key: 'contactToTreatment',
    label: 'First medical contact to treatment',
    targetMin: 90,
    start: (c) => c.firstMedicalContactAt,
    end: (c) => c.treatmentStartedAt,
  },
];

// status: not_started | running | done | stopped (case closed before the stage finished)
export function computeGoldenHour(c, now = Date.now()) {
  return GOLDEN_HOUR_STAGES.map((s) => {
    const base = { key: s.key, label: s.label, targetMin: s.targetMin };
    const start = ms(s.start(c));
    if (start == null) {
      return { ...base, status: 'not_started', startedAt: null, endedAt: null, elapsedMin: 0, overdue: false };
    }
    const end = ms(s.end(c));
    const closed = ms(c.closedAt);
    const finish = end ?? closed ?? now;
    const elapsedMin = round1(Math.max(0, finish - start) / 60000);
    const status = end != null ? 'done' : closed != null ? 'stopped' : 'running';
    return {
      ...base,
      status,
      startedAt: iso(start),
      endedAt: iso(end ?? closed),
      elapsedMin,
      overdue: elapsedMin > s.targetMin,
    };
  });
}
