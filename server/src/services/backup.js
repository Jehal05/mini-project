// Feature 99: database backup, verify, export and restore, written in Node (no mongodump needed).
//
// File format (.htbak), one file per backup:
//   line 1  a JSON manifest (schema version, app version, created at, per-collection counts, SHA-256 of the data)
//   rest    gzip of the data, optionally encrypted with AES-256-GCM
// The data is one line per document: "<collection>\t<Extended JSON>". Extended JSON keeps ObjectIds, dates and geo fields intact.
//
// The service is a factory. The database is passed in as `store`, so every rule here is tested without MongoDB.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { httpError } from '../utils/httpError.js';

export const BACKUP_SCHEMA_VERSION = 1;
export const RESTORE_PHRASE = 'RESTORE';
export const NAME_PATTERN = /^healthtwin-\d{8}-\d{6}(-[a-z0-9]+)*\.htbak$/;
export const EXPORTABLE = ['hospitals', 'beds', 'ambulances', 'doctors']; // never patients, vitals, cases or users
const FORMAT = 'healthtwin-backup';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const pad = (n, w = 2) => String(n).padStart(w, '0');

export function stampName(date, label) {
  const d = date;
  const stamp = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
  return `healthtwin-${stamp}${label ? `-${label}` : ''}.htbak`;
}

// The key is 32 random bytes written as 64 hex characters. `node scripts/backup.js keygen` makes one.
export function parseKey(raw) {
  if (!raw) return null;
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) throw httpError(500, 'BACKUP_ENCRYPTION_KEY must be 64 hex characters (32 bytes). Run "node scripts/backup.js keygen".');
  return Buffer.from(raw, 'hex');
}

// ---- file encoding (pure, exported for tests) ----
export function encodeBackup({ docsByCollection, codec, key, createdAt, appVersion }) {
  const lines = [];
  const counts = {};
  for (const [name, docs] of Object.entries(docsByCollection)) {
    counts[name] = docs.length;
    for (const d of docs) lines.push(`${name}\t${codec.stringify(d)}`);
  }
  const body = Buffer.from(lines.join('\n'), 'utf8');
  const manifest = {
    format: FORMAT, schemaVersion: BACKUP_SCHEMA_VERSION, appVersion, createdAt: createdAt.toISOString(),
    collections: counts, totalDocuments: lines.length, bodySha256: sha256(body), encrypted: Boolean(key),
  };
  let payload = zlib.gzipSync(body);
  if (key) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(`${manifest.createdAt}|${manifest.bodySha256}`));
    payload = Buffer.concat([cipher.update(payload), cipher.final()]);
    manifest.encryption = { alg: 'aes-256-gcm', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
  }
  return Buffer.concat([Buffer.from(`${JSON.stringify(manifest)}\n`, 'utf8'), payload]);
}

export function readManifest(file) {
  const nl = file.indexOf(0x0a);
  if (nl < 1) throw new Error('not a backup file (no manifest)');
  let manifest;
  try { manifest = JSON.parse(file.subarray(0, nl).toString('utf8')); } catch { throw new Error('manifest is not valid JSON'); }
  if (manifest.format !== FORMAT) throw new Error('not a HealthTwin backup file');
  return { manifest, payload: file.subarray(nl + 1) };
}

// Returns { ok, problems, manifest, docsByCollection }. Never throws for a damaged file, it reports it.
export function decodeBackup(file, { codec, key, includeDocs = false }) {
  const problems = [];
  let manifest;
  let payload;
  try { ({ manifest, payload } = readManifest(file)); } catch (e) { return { ok: false, problems: [e.message], manifest: null }; }

  let gz = payload;
  if (manifest.encrypted) {
    if (!key) return { ok: false, problems: ['This backup is encrypted and BACKUP_ENCRYPTION_KEY is not set'], manifest };
    try {
      const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(manifest.encryption.iv, 'base64'));
      d.setAAD(Buffer.from(`${manifest.createdAt}|${manifest.bodySha256}`));
      d.setAuthTag(Buffer.from(manifest.encryption.tag, 'base64'));
      gz = Buffer.concat([d.update(payload), d.final()]);
    } catch {
      return { ok: false, problems: ['Decryption failed: wrong key, or the file was changed'], manifest };
    }
  }

  let body;
  try { body = zlib.gunzipSync(gz); } catch { return { ok: false, problems: ['The data is damaged (cannot decompress)'], manifest }; }
  if (sha256(body) !== manifest.bodySha256) problems.push('Checksum does not match: the file is damaged or was changed');

  const text = body.toString('utf8');
  const lines = text ? text.split('\n') : [];
  const counts = {};
  const docsByCollection = Object.fromEntries(Object.keys(manifest.collections || {}).map((n) => [n, []]));
  for (const line of lines) {
    const tab = line.indexOf('\t');
    const name = line.slice(0, tab);
    counts[name] = (counts[name] || 0) + 1;
    if (includeDocs && problems.length === 0) {
      try { (docsByCollection[name] ||= []).push(codec.parse(line.slice(tab + 1))); } catch { problems.push(`A document in "${name}" cannot be read`); break; }
    }
  }
  for (const [name, n] of Object.entries(manifest.collections || {})) {
    if ((counts[name] || 0) !== n) problems.push(`Collection "${name}" has ${counts[name] || 0} documents, the manifest says ${n}`);
  }
  for (const name of Object.keys(counts)) if (!(name in (manifest.collections || {}))) problems.push(`Unexpected collection "${name}" in the data`);

  return { ok: problems.length === 0, problems, manifest, docsByCollection: includeDocs ? docsByCollection : undefined };
}

// ---- CSV (export) ----
export function toCsv(docs) {
  const cols = [...new Set(docs.flatMap((d) => Object.keys(d)))].filter((c) => c !== '__v');
  const esc = (v) => {
    let s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stops spreadsheet formula injection
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...docs.map((d) => cols.map((c) => esc(d[c])).join(','))].join('\n');
}

// ---- the service ----
export function createBackupService({
  store, codec, dir, keep = 14, encryptionKey = '', nodeEnv = 'development', allowProductionRestore = false,
  appVersion = '0.0.0', audit = async () => {}, now = () => new Date(),
}) {
  const key = parseKey(encryptionKey);
  const isProd = nodeEnv === 'production';

  const pathFor = (name) => {
    if (typeof name !== 'string' || !NAME_PATTERN.test(name)) throw httpError(400, 'Invalid backup name');
    const full = path.resolve(dir, name);
    if (path.dirname(full) !== path.resolve(dir)) throw httpError(400, 'Invalid backup name');
    return full;
  };
  const load = async (name) => {
    try { return await fs.readFile(pathFor(name)); } catch (e) { if (e.code === 'ENOENT') throw httpError(404, 'Backup not found'); throw e; }
  };
  const log = (actor, action, meta) => audit({ actor, action, meta }).catch((e) => console.error('[backup] audit failed:', e.message));

  async function createBackup({ actor, label } = {}) {
    if (isProd && !key) throw httpError(500, 'Refusing to write an unencrypted backup in production. Set BACKUP_ENCRYPTION_KEY.');
    if (label && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(label)) throw httpError(400, 'Invalid label');
    await fs.mkdir(dir, { recursive: true });

    const createdAt = now();
    const docsByCollection = {};
    for (const name of await store.listCollections()) docsByCollection[name] = await store.readCollection(name);
    const file = encodeBackup({ docsByCollection, codec, key, createdAt, appVersion });

    let name = stampName(createdAt, label);
    for (let n = 2; await fs.stat(pathFor(name)).then(() => true, () => false); n += 1) name = stampName(createdAt, `${label ? `${label}-` : ''}${n}`);
    const full = pathFor(name);
    await fs.writeFile(`${full}.tmp`, file, { mode: 0o600 });
    await fs.rename(`${full}.tmp`, full); // a half-written file never has a real name

    const verification = await verifyBackup(name, { actor, quiet: true });
    if (!verification.ok) {
      await fs.rm(full, { force: true });
      await log(actor, 'backup_failed', { name, problems: verification.problems });
      throw httpError(500, `The new backup failed verification and was removed: ${verification.problems.join('; ')}`);
    }

    // Retention only after a verified new backup, and only for unlabelled (scheduled/manual) backups.
    const removed = [];
    if (!label) {
      const regular = (await fs.readdir(dir)).filter((f) => NAME_PATTERN.test(f) && /^healthtwin-\d{8}-\d{6}(-\d+)?\.htbak$/.test(f)).sort();
      for (const old of regular.slice(0, Math.max(0, regular.length - keep))) { await fs.rm(path.join(dir, old), { force: true }); removed.push(old); }
    }

    const manifest = readManifest(file).manifest;
    await log(actor, 'backup_created', { name, documents: manifest.totalDocuments, encrypted: manifest.encrypted, removedByRetention: removed.length });
    return { name, createdAt: manifest.createdAt, encrypted: manifest.encrypted, collections: manifest.collections, totalDocuments: manifest.totalDocuments, sizeBytes: file.length, verified: true, removedByRetention: removed };
  }

  async function listBackups() {
    await fs.mkdir(dir, { recursive: true });
    const out = [];
    for (const f of (await fs.readdir(dir)).filter((x) => NAME_PATTERN.test(x)).sort().reverse()) {
      const buf = await fs.readFile(path.join(dir, f));
      try {
        const { manifest } = readManifest(buf);
        out.push({ name: f, createdAt: manifest.createdAt, encrypted: Boolean(manifest.encrypted), totalDocuments: manifest.totalDocuments, collections: Object.keys(manifest.collections).length, sizeBytes: buf.length, schemaVersion: manifest.schemaVersion });
      } catch { out.push({ name: f, unreadable: true, sizeBytes: buf.length }); }
    }
    return { count: out.length, keep, results: out };
  }

  async function verifyBackup(name, { actor, quiet = false } = {}) {
    const result = decodeBackup(await load(name), { codec, key });
    const out = { name, ok: result.ok, problems: result.problems, schemaVersion: result.manifest?.schemaVersion ?? null, totalDocuments: result.manifest?.totalDocuments ?? null };
    if (!quiet) await log(actor, 'backup_verified', { name, ok: out.ok });
    return out;
  }

  async function restoreBackup(name, { actor, confirm } = {}) {
    const file = await load(name);
    const decoded = decodeBackup(file, { codec, key, includeDocs: true });
    if (!decoded.ok) throw httpError(422, `Restore refused: ${decoded.problems.join('; ')}`);
    if (decoded.manifest.schemaVersion > BACKUP_SCHEMA_VERSION) {
      throw httpError(422, `Restore refused: this backup uses schema version ${decoded.manifest.schemaVersion}, newer than this app (${BACKUP_SCHEMA_VERSION}). Update the app first.`);
    }

    const live = await store.listCollections();
    const inBackup = Object.keys(decoded.manifest.collections);
    const plan = [];
    for (const c of inBackup) plan.push({ collection: c, liveDocuments: live.includes(c) ? await store.countCollection(c) : 0, backupDocuments: decoded.manifest.collections[c] });
    const untouched = live.filter((c) => !inBackup.includes(c));
    const summary = { name, backupCreatedAt: decoded.manifest.createdAt, plan, untouchedCollections: untouched };

    if (confirm !== RESTORE_PHRASE) {
      await log(actor, 'restore_dry_run', { name });
      return { dryRun: true, ...summary, message: `Nothing was changed. To restore, confirm with the phrase ${RESTORE_PHRASE}.` };
    }
    if (isProd && !allowProductionRestore) throw httpError(403, 'Restore is disabled in production. Set ALLOW_PRODUCTION_RESTORE=true to allow it.');

    // 1. Safety copy first. If it fails, nothing is touched.
    let safety;
    try { safety = await createBackup({ actor, label: 'pre-restore' }); } catch (e) {
      await log(actor, 'restore_aborted', { name, reason: 'pre-restore backup failed' });
      throw httpError(500, `Restore aborted before any change: the safety backup failed (${e.message})`);
    }

    // 2. Stage every collection next to the live one. A failure here leaves live data untouched.
    const staged = [];
    let failed = null;
    try {
      for (const c of inBackup) { failed = c; await store.stageCollection(c, decoded.docsByCollection[c]); staged.push(c); }
      failed = null;
    } catch (e) {
      await store.discardStaged(inBackup);
      await log(actor, 'restore_failed', { name, collection: failed, stage: 'staging', error: e.message, safetyBackup: safety.name });
      throw httpError(500, `Restore failed while preparing "${failed}". Live data was not changed. (${e.message})`);
    }

    // 3. Swap each staged collection in, then rebuild indexes (the swap drops the live indexes, including 2dsphere).
    try {
      for (const c of staged) { failed = c; await store.commitStaged(c); }
      failed = 'indexes';
      await store.rebuildIndexes();
    } catch (e) {
      await store.discardStaged(inBackup).catch(() => {});
      await log(actor, 'restore_failed', { name, collection: failed, stage: 'swap', error: e.message, safetyBackup: safety.name });
      throw httpError(500, `Restore stopped at "${failed}": ${e.message}. Some collections may already be restored. The safety backup ${safety.name} has the previous data.`);
    }

    await log(actor, 'restore_completed', { name, collections: inBackup.length, safetyBackup: safety.name });
    return { dryRun: false, ...summary, restored: true, safetyBackup: safety.name };
  }

  async function exportCollection(collection, { format = 'json', actor } = {}) {
    if (!EXPORTABLE.includes(collection)) throw httpError(403, `Only these collections can be exported: ${EXPORTABLE.join(', ')}. Patient, vitals, case and account data are not exportable.`);
    if (!['json', 'csv'].includes(format)) throw httpError(400, 'format must be json or csv');
    const docs = await store.readCollection(collection);
    await log(actor, 'export', { collection, format, documents: docs.length });
    return format === 'csv'
      ? { contentType: 'text/csv; charset=utf-8', filename: `${collection}.csv`, body: toCsv(docs) }
      : { contentType: 'application/json; charset=utf-8', filename: `${collection}.json`, body: JSON.stringify(docs.map(({ __v, ...rest }) => rest), null, 2) };
  }

  return { createBackup, listBackups, verifyBackup, restoreBackup, exportCollection };
}
