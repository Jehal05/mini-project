// MongoDB side of the backup service (feature 99). Uses the native driver through mongoose, so no extra package is needed.
// Restore stages each collection under a temporary name, checks the count, and only then swaps it in.
import mongoose from 'mongoose';

export const TMP_SUFFIX = '__restore_tmp';
const CHUNK = 500;
const db = () => {
  if (mongoose.connection.readyState !== 1) throw new Error('The database is not connected');
  return mongoose.connection.db;
};

// Extended JSON keeps ObjectId, Date and numeric types exactly (relaxed: false).
export function createCodec() {
  const { EJSON } = mongoose.mongo.BSON;
  return {
    stringify: (doc) => EJSON.stringify(doc, { relaxed: false }),
    parse: (text) => EJSON.parse(text, { relaxed: false }),
  };
}

export const mongoStore = {
  async listCollections() {
    const all = await db().listCollections({}, { nameOnly: true }).toArray();
    return all.map((c) => c.name).filter((n) => !n.startsWith('system.') && !n.endsWith(TMP_SUFFIX)).sort();
  },
  readCollection: (name) => db().collection(name).find({}).toArray(),
  countCollection: (name) => db().collection(name).countDocuments({}),

  async stageCollection(name, docs) {
    const tmp = `${name}${TMP_SUFFIX}`;
    await db().collection(tmp).drop().catch(() => {}); // leftover from an earlier failed run
    await db().createCollection(tmp);
    for (let i = 0; i < docs.length; i += CHUNK) await db().collection(tmp).insertMany(docs.slice(i, i + CHUNK));
    const n = await db().collection(tmp).countDocuments({});
    if (n !== docs.length) throw new Error(`staged ${n} of ${docs.length} documents`);
  },

  async commitStaged(name) {
    await db().collection(`${name}${TMP_SUFFIX}`).rename(name, { dropTarget: true });
  },

  async discardStaged(names) {
    for (const name of names) await db().collection(`${name}${TMP_SUFFIX}`).drop().catch(() => {});
  },

  // Renaming over a collection drops its indexes, so rebuild every index the models declare (including 2dsphere).
  async rebuildIndexes() {
    for (const modelName of mongoose.modelNames()) await mongoose.model(modelName).createIndexes();
  },
};
