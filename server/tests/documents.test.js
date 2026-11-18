import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { config } from '../src/config/env.js';
import { Counter, Document } from '../src/models/index.js';
import { JPEG, PDF, PNG, patientSession } from './helpers.js';

const up = (s, buf, name = 'scan.pdf', type = 'ecg') =>
  s.agent.post('/api/patients/me/documents').set(s.auth).field('type', type).attach('file', buf, name);
const files = async (area) => fs.readdir(path.join(config.uploads.dir, area)).catch(() => []);

describe('documents', () => {
  it('uploads a PDF, JPG and PNG, listing them tagged by type', async () => {
    const s = await patientSession();
    expect((await up(s, PDF, 'ecg.pdf', 'ecg')).status).toBe(201);
    expect((await up(s, JPEG, 'x.jpg', 'imaging')).status).toBe(201);
    expect((await up(s, PNG, 'y.png', 'lab_report')).status).toBe(201);
    const list = await s.agent.get('/api/patients/me/documents').set(s.auth);
    expect(list.body.documents.map((d) => d.type).sort()).toEqual(['ecg', 'imaging', 'lab_report']);
    expect(JSON.stringify(list.body)).not.toMatch(/storedName/);
  });

  it('stores under a random name, outside any public folder', async () => {
    const s = await patientSession();
    const res = await up(s, PDF, '../../etc/passwd.pdf');
    const doc = await Document.findById(res.body.document._id);
    expect(doc.storedName).toMatch(/^[a-f0-9]{48}\.pdf$/);
    expect(doc.originalName).not.toContain('/');
    expect(await files('documents')).toEqual([doc.storedName]);
  });

  it('decides the type from the bytes, not the name or content type', async () => {
    const s = await patientSession();
    const fake = Buffer.from('<script>alert(1)</script>');
    const res = await s.agent.post('/api/patients/me/documents').set(s.auth).field('type', 'ecg').attach('file', fake, { filename: 'a.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
    expect((await up(s, Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100)]), 'a.png')).status).toBe(400);
    expect((await up(s, PNG, 'actually-a-png.pdf')).status).toBe(201); // real type wins over the name
    expect((await Document.findOne()).mimeType).toBe('image/png');
    expect(await files('documents')).toHaveLength(1);
  });

  it('rejects files over 5 MB, missing files and unknown document types', async () => {
    const s = await patientSession();
    const big = Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]);
    expect((await up(s, big)).status).toBe(413);
    expect((await s.agent.post('/api/patients/me/documents').set(s.auth).field('type', 'ecg')).status).toBe(400);
    expect((await up(s, PDF, 'a.pdf', 'weird')).status).toBe(400);
    expect(await files('documents')).toHaveLength(0);
  });

  it('caps the count at 50, even for parallel uploads', async () => {
    const s = await patientSession();
    await Counter.create({ _id: `documents:${s.patient._id}`, seq: 48 });
    const results = await Promise.all(Array.from({ length: 6 }, () => up(s, PDF)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    expect(results.filter((r) => r.status === 409).every((r) => r.body.error.code === 'DOCUMENT_LIMIT')).toBe(true);
    expect(await Document.countDocuments()).toBe(2);
    expect(await files('documents')).toHaveLength(2);
  });

  it('serves a file only to its owner, with safe headers', async () => {
    const a = await patientSession();
    const b = await patientSession();
    const id = (await up(a, PDF)).body.document._id;
    const own = await a.agent.get(`/api/patients/me/documents/${id}/file`).set(a.auth);
    expect(own.status).toBe(200);
    expect(own.headers['content-type']).toMatch(/application\/pdf/);
    expect(own.headers['x-content-type-options']).toBe('nosniff');
    expect(own.headers['cache-control']).toMatch(/no-store/);
    expect((await b.agent.get(`/api/patients/me/documents/${id}/file`).set(b.auth)).status).toBe(404);
    expect((await b.agent.delete(`/api/patients/me/documents/${id}`).set(b.auth)).status).toBe(404);
    expect((await a.agent.get(`/api/patients/me/documents/${id}/file`)).status).toBe(401);
  });

  it('is not reachable as a static file', async () => {
    const s = await patientSession();
    const doc = await Document.findById((await up(s, PDF)).body.document._id);
    for (const url of [`/uploads/documents/${doc.storedName}`, `/documents/${doc.storedName}`, `/api/uploads/${doc.storedName}`]) {
      expect((await s.agent.get(url)).status).toBe(404);
    }
  });

  it('deletes the file from disk and frees the slot', async () => {
    const s = await patientSession();
    const id = (await up(s, PDF)).body.document._id;
    expect(await files('documents')).toHaveLength(1);
    expect((await s.agent.delete(`/api/patients/me/documents/${id}`).set(s.auth)).status).toBe(200);
    expect(await files('documents')).toHaveLength(0);
    expect(await Document.countDocuments()).toBe(0);
    expect((await Counter.findById(`documents:${s.patient._id}`)).seq).toBe(0);
  });
});

describe('profile photo', () => {
  const put = (s, buf, name = 'me.jpg') => s.agent.put('/api/patients/me/photo').set(s.auth).attach('photo', buf, name);

  it('accepts JPG/PNG, serves it to its owner and replaces the old file', async () => {
    const s = await patientSession();
    const first = await put(s, JPEG);
    expect(first.status).toBe(200);
    expect(first.body.patient.hasPhoto).toBe(true);
    expect(first.body.patient.photoUrl).toMatch(/^\/api\/patients\/me\/photo\?v=/);
    const old = await files('photos');
    expect((await put(s, PNG, 'me.png')).status).toBe(200);
    const now = await files('photos');
    expect(now).toHaveLength(1);
    expect(now[0]).not.toBe(old[0]);
    const got = await s.agent.get('/api/patients/me/photo').set(s.auth);
    expect(got.status).toBe(200);
    expect(got.headers['content-type']).toBe('image/png');
    expect((await s.agent.get('/api/patients/me/photo')).status).toBe(401);
  });

  it('rejects PDFs, spoofed images and files over 2 MB', async () => {
    const s = await patientSession();
    expect((await put(s, PDF, 'a.jpg')).status).toBe(400);
    expect((await put(s, Buffer.from('not an image at all'), 'a.png')).status).toBe(400);
    expect((await put(s, Buffer.concat([JPEG.subarray(0, 6), Buffer.alloc(2 * 1024 * 1024 + 10)]))).status).toBe(413);
    expect(await files('photos')).toHaveLength(0);
  });

  it('strips metadata (EXIF) from JPEGs before storing', async () => {
    const s = await patientSession();
    const exif = Buffer.concat([Buffer.from([0xff, 0xe1, 0x00, 0x12]), Buffer.from('Exif\0\0GPS-SECRET')]);
    const withExif = Buffer.concat([JPEG.subarray(0, 2), exif, JPEG.subarray(2)]);
    expect((await put(s, withExif)).status).toBe(200);
    const stored = await fs.readFile(path.join(config.uploads.dir, 'photos', (await files('photos'))[0]));
    expect(stored.includes(Buffer.from('GPS-SECRET'))).toBe(false);
  });

  it('removes the photo from disk when deleted', async () => {
    const s = await patientSession();
    await put(s, JPEG);
    const res = await s.agent.delete('/api/patients/me/photo').set(s.auth);
    expect(res.body.patient.hasPhoto).toBe(false);
    expect(await files('photos')).toHaveLength(0);
  });
});
