import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createBackupService, encodeBackup, decodeBackup, readManifest, parseKey, toCsv, stampName, NAME_PATTERN, BACKUP_SCHEMA_VERSION,
} from '../src/services/backup.js';
import { createFakeStore, jsonCodec, sampleData } from './helpers/fakeBackupStore.js';

const KEY = 'a'.repeat(64);
const OTHER_KEY = 'b'.repeat(64);
let dir;
let store;
let audits;
let clock;

const make = (over = {}) =>
  createBackupService({
    store, codec: jsonCodec, dir, keep: 3, appVersion: '9.9.9',
    audit: async (e) => { audits.push(e); }, now: () => new Date(clock), ...over,
  });
const tick = () => { clock += 1000; };

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ht-backup-'));
  store = createFakeStore(sampleData());
  audits = [];
  clock = Date.parse('2026-11-23T10:00:00Z');
});
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

describe('file format', () => {
  it('round trips documents, dates and empty collections', () => {
    const data = sampleData();
    const file = encodeBackup({ docsByCollection: data, codec: jsonCodec, key: null, createdAt: new Date(clock), appVersion: '1' });
    const out = decodeBackup(file, { codec: jsonCodec, key: null, includeDocs: true });
    expect(out.ok).toBe(true);
    expect(out.docsByCollection).toEqual(data);
    expect(out.docsByCollection.hospitals[0].createdAt).toBeInstanceOf(Date);
    expect(readManifest(file).manifest).toMatchObject({ schemaVersion: BACKUP_SCHEMA_VERSION, appVersion: '1', encrypted: false, totalDocuments: 6 });
  });
  it('accepts only a 32 byte key written as 64 hex characters', () => {
    expect(parseKey('')).toBeNull();
    expect(parseKey(KEY)).toHaveLength(32);
    expect(() => parseKey('short')).toThrow(/64 hex/);
  });
  it('names are timestamped and match the allowed pattern', () => {
    expect(stampName(new Date('2026-11-23T10:00:01Z'))).toBe('healthtwin-20261123-100001.htbak');
    expect(NAME_PATTERN.test(stampName(new Date(), 'pre-restore'))).toBe(true);
  });
  it('csv escapes quotes and blocks spreadsheet formulas', () => {
    const csv = toCsv([{ a: '=SUM(1)', b: 'say "hi"', c: { x: 1 }, __v: 0 }]);
    expect(csv.split('\n')[0]).toBe('a,b,c');
    expect(csv).toContain("'=SUM(1)");
    expect(csv).toContain('"say ""hi"""');
    expect(csv).not.toContain('__v');
  });
});

describe('backup, list, verify', () => {
  it('writes a verified backup, lists it, and verifies it again', async () => {
    const svc = make();
    const b = await svc.createBackup({ actor: 'admin1' });
    expect(b).toMatchObject({ verified: true, encrypted: false, totalDocuments: 6, collections: { hospitals: 2, emptythings: 0 } });
    expect(NAME_PATTERN.test(b.name)).toBe(true);
    const list = await svc.listBackups();
    expect(list.results).toHaveLength(1);
    expect(list.results[0]).toMatchObject({ name: b.name, totalDocuments: 6, encrypted: false });
    expect(await svc.verifyBackup(b.name)).toMatchObject({ ok: true, problems: [] });
    expect(audits.map((a) => a.action)).toEqual(['backup_created', 'backup_verified']);
    expect(audits[0].actor).toBe('admin1');
  });

  it('detects a changed file (checksum) and a truncated one', async () => {
    const svc = make();
    const { name } = await svc.createBackup();
    const full = path.join(dir, name);
    const buf = await fs.readFile(full);
    const bad = Buffer.from(buf);
    bad[bad.length - 12] ^= 0xff;
    await fs.writeFile(full, bad);
    expect((await svc.verifyBackup(name)).ok).toBe(false);
    await fs.writeFile(full, buf.subarray(0, buf.length - 30));
    expect((await svc.verifyBackup(name)).ok).toBe(false);
    await fs.writeFile(full, 'garbage');
    expect((await svc.verifyBackup(name)).problems[0]).toMatch(/not a backup|manifest/);
  });

  it('encrypts when a key is set, and detects tampering, a wrong key and a missing key', async () => {
    const svc = make({ encryptionKey: KEY });
    const { name, encrypted } = await svc.createBackup();
    expect(encrypted).toBe(true);
    const raw = await fs.readFile(path.join(dir, name));
    expect(raw.includes('Rahul')).toBe(false);
    expect((await svc.verifyBackup(name)).ok).toBe(true);
    expect((await make({ encryptionKey: OTHER_KEY }).verifyBackup(name)).problems[0]).toMatch(/Decryption failed/);
    expect((await make().verifyBackup(name)).problems[0]).toMatch(/not set/);
    const bad = Buffer.from(raw);
    bad[bad.length - 5] ^= 1;
    await fs.writeFile(path.join(dir, name), bad);
    expect((await svc.verifyBackup(name)).ok).toBe(false);
  });

  it('refuses to write an unencrypted backup in production', async () => {
    await expect(make({ nodeEnv: 'production' }).createBackup()).rejects.toMatchObject({ status: 500, message: expect.stringMatching(/unencrypted/) });
    await expect(make({ nodeEnv: 'production', encryptionKey: KEY }).createBackup()).resolves.toMatchObject({ encrypted: true });
  });

  it('keeps the newest N regular backups and never deletes labelled ones', async () => {
    const svc = make();
    const names = [];
    for (let i = 0; i < 5; i += 1) { tick(); names.push((await svc.createBackup()).name); }
    tick();
    const safety = (await svc.createBackup({ label: 'pre-restore' })).name;
    const left = (await svc.listBackups()).results.map((b) => b.name);
    expect(left).toContain(safety);
    expect(left.filter((n) => n !== safety).sort()).toEqual(names.slice(-3));
  });

  it('never has two backups with the same name', async () => {
    const svc = make();
    const a = await svc.createBackup();
    const b = await svc.createBackup(); // same second
    expect(a.name).not.toBe(b.name);
  });

  it('rejects path traversal and unknown names', async () => {
    const svc = make();
    for (const bad of ['../secret', '../../etc/passwd', 'x.htbak', 'healthtwin-20261123-100000.htbak/../../x', '/etc/passwd', 'healthtwin-20261123-100000.htbak\0']) {
      await expect(svc.verifyBackup(bad)).rejects.toMatchObject({ status: 400 });
      await expect(svc.restoreBackup(bad)).rejects.toMatchObject({ status: 400 });
    }
    await expect(svc.verifyBackup('healthtwin-20200101-000000.htbak')).rejects.toMatchObject({ status: 404 });
  });
});

describe('restore', () => {
  async function backupThenChange(svc) {
    const { name } = await svc.createBackup();
    store.live.set('hospitals', [{ _id: 'h9', name: 'Changed later' }]);
    store.live.set('newer', [{ _id: 'n1' }]);
    tick();
    return name;
  }

  it('is a dry run by default and changes nothing', async () => {
    const svc = make();
    const name = await backupThenChange(svc);
    const before = structuredClone([...store.live]);
    for (const confirm of [undefined, '', 'restore', 'YES']) {
      const r = await svc.restoreBackup(name, { confirm });
      expect(r.dryRun).toBe(true);
      expect(r.plan.find((p) => p.collection === 'hospitals')).toMatchObject({ liveDocuments: 1, backupDocuments: 2 });
      expect(r.untouchedCollections).toEqual(['newer']);
    }
    expect([...store.live]).toEqual(before);
    expect(store.calls.stage).toEqual([]);
    expect((await svc.listBackups()).count).toBe(1); // no safety backup for a dry run
  });

  it('with the phrase: takes a safety backup, restores, rebuilds indexes, audits', async () => {
    const svc = make();
    const name = await backupThenChange(svc);
    const r = await svc.restoreBackup(name, { actor: 'admin1', confirm: 'RESTORE' });
    expect(r).toMatchObject({ dryRun: false, restored: true });
    expect(r.safetyBackup).toMatch(/pre-restore/);
    expect(store.live.get('hospitals')).toEqual(sampleData().hospitals);
    expect(store.live.get('hospitals')[0].createdAt).toBeInstanceOf(Date);
    expect(store.live.get('newer')).toEqual([{ _id: 'n1' }]); // not in the backup: untouched
    expect(store.calls.indexes).toBe(1);
    expect(store.staged.size).toBe(0);
    const safety = (await svc.listBackups()).results.find((b) => b.name === r.safetyBackup);
    expect(safety.collections).toBe(7); // the state just before restore: the six original collections plus the one added later
    expect(safety.totalDocuments).toBe(6); // hospitals had been cut to 1 document, plus 1 in "newer"
    expect(audits.map((a) => a.action)).toContain('restore_completed');
  });

  it('a failure while staging leaves live data untouched and names the collection', async () => {
    const svc = make();
    const name = await backupThenChange(svc);
    const before = structuredClone([...store.live]);
    store.fail.stage = 'beds';
    await expect(svc.restoreBackup(name, { confirm: 'RESTORE' })).rejects.toMatchObject({ status: 500, message: expect.stringMatching(/"beds".*Live data was not changed/) });
    expect([...store.live]).toEqual(before);
    expect(store.calls.commit).toEqual([]);
    expect(store.staged.size).toBe(0);
    expect(audits.find((a) => a.action === 'restore_failed').meta).toMatchObject({ collection: 'beds', stage: 'staging' });
  });

  it('a failure while swapping reports the collection and the safety backup', async () => {
    const svc = make();
    const name = await backupThenChange(svc);
    store.fail.commit = 'doctors';
    const err = await svc.restoreBackup(name, { confirm: 'RESTORE' }).catch((e) => e);
    expect(err.status).toBe(500);
    expect(err.message).toMatch(/"doctors"/);
    expect(err.message).toMatch(/pre-restore/);
  });

  it('refuses a damaged backup, a newer schema, and production without the allow flag', async () => {
    const svc = make();
    const { name } = await svc.createBackup();
    const full = path.join(dir, name);
    const good = await fs.readFile(full);

    const bad = Buffer.from(good); bad[bad.length - 12] ^= 0xff;
    await fs.writeFile(full, bad);
    await expect(svc.restoreBackup(name, { confirm: 'RESTORE' })).rejects.toMatchObject({ status: 422 });

    const nl = good.indexOf(0x0a);
    const manifest = JSON.parse(good.subarray(0, nl).toString());
    await fs.writeFile(full, Buffer.concat([Buffer.from(`${JSON.stringify({ ...manifest, schemaVersion: 99 })}\n`), good.subarray(nl + 1)]));
    await expect(svc.restoreBackup(name, { confirm: 'RESTORE' })).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/newer than this app/) });

    await fs.writeFile(full, good);
    const prod = make({ nodeEnv: 'production', encryptionKey: KEY });
    const { name: pn } = await prod.createBackup();
    await expect(prod.restoreBackup(pn, { confirm: 'RESTORE' })).rejects.toMatchObject({ status: 403 });
    expect((await prod.restoreBackup(pn, {})).dryRun).toBe(true); // a dry run is allowed
    const allowed = make({ nodeEnv: 'production', encryptionKey: KEY, allowProductionRestore: true });
    expect((await allowed.restoreBackup(pn, { confirm: 'RESTORE' })).restored).toBe(true);
  });

  it('aborts before any change if the safety backup cannot be written', async () => {
    const { name } = await make().createBackup();
    store.live.set('hospitals', [{ _id: 'h9' }]);
    // Production without a key cannot write the safety backup, so the restore must stop before touching anything.
    const prod = make({ nodeEnv: 'production', allowProductionRestore: true });
    await expect(prod.restoreBackup(name, { confirm: 'RESTORE' })).rejects.toMatchObject({ status: 500, message: expect.stringMatching(/aborted before any change/) });
    expect(store.live.get('hospitals')).toEqual([{ _id: 'h9' }]);
    expect(store.calls.stage).toEqual([]);
  });
});

describe('export', () => {
  it('exports only reference collections, as json or csv, and audits it', async () => {
    const svc = make();
    const j = await svc.exportCollection('hospitals', { actor: 'a1' });
    expect(JSON.parse(j.body)).toHaveLength(2);
    const c = await svc.exportCollection('ambulances', { format: 'csv' });
    expect(c.contentType).toMatch(/csv/);
    expect(c.body).toContain("'=CMD()");
    for (const banned of ['patients', 'vitalreadings', 'emergencycases', 'users', 'auditlogs']) {
      await expect(svc.exportCollection(banned)).rejects.toMatchObject({ status: 403 });
    }
    await expect(svc.exportCollection('hospitals', { format: 'xml' })).rejects.toMatchObject({ status: 400 });
    expect(audits.filter((a) => a.action === 'export')).toHaveLength(2);
  });
});
