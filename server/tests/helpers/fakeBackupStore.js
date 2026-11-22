// In-memory stand-in for services/mongoStore.js. Mimics staging then swapping, and can be told to fail.
export const jsonCodec = {
  stringify: (doc) => JSON.stringify(doc, function replacer(k, v) { return this[k] instanceof Date ? { $date: this[k].toISOString() } : v; }),
  parse: (text) => JSON.parse(text, (k, v) => (v && typeof v === 'object' && '$date' in v ? new Date(v.$date) : v)),
};

export function createFakeStore(initial = {}) {
  const live = new Map(Object.entries(initial).map(([k, v]) => [k, structuredClone(v)]));
  const staged = new Map();
  const calls = { stage: [], commit: [], discard: [], indexes: 0 };
  const fail = { stage: null, commit: null, indexes: false };
  return {
    live, staged, calls, fail,
    async listCollections() { return [...live.keys()].sort(); },
    async readCollection(name) { return structuredClone(live.get(name) || []); },
    async countCollection(name) { return (live.get(name) || []).length; },
    async stageCollection(name, docs) {
      calls.stage.push(name);
      if (fail.stage === name) throw new Error(`disk full while staging ${name}`);
      staged.set(name, structuredClone(docs));
    },
    async commitStaged(name) {
      calls.commit.push(name);
      if (fail.commit === name) throw new Error(`rename failed for ${name}`);
      live.set(name, staged.get(name));
      staged.delete(name);
    },
    async discardStaged(names) { calls.discard.push(...names); for (const n of names) staged.delete(n); },
    async rebuildIndexes() { calls.indexes += 1; if (fail.indexes) throw new Error('index build failed'); },
  };
}

export const sampleData = () => ({
  hospitals: [
    { _id: 'h1', name: 'Demo Heart Institute', location: { type: 'Point', coordinates: [73.9, 18.5] }, createdAt: new Date('2026-11-01T10:00:00Z') },
    { _id: 'h2', name: 'Demo City Hospital', location: { type: 'Point', coordinates: [73.8, 18.5] }, createdAt: new Date('2026-11-02T10:00:00Z') },
  ],
  beds: [{ _id: 'b1', label: 'ICU-1', status: 'free' }],
  ambulances: [{ _id: 'a1', vehicleNumber: '=CMD()', type: 'ALS' }],
  doctors: [{ _id: 'd1', name: 'Dr. Demo' }],
  patients: [{ _id: 'p1', fullName: 'Rahul Sharma (demo)', phone: '0000000000' }],
  emptythings: [],
});
