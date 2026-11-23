import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';

describe('single-origin deployment (STATIC_DIR)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ht-static-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>HealthTwin</title>');
  const app = createApp({ staticDir: dir });

  it('serves the app for client-side routes', async () => {
    const res = await request(app).get('/patient/monitor');
    expect(res.status).toBe(200);
    expect(res.text).toContain('HealthTwin');
  });
  it('still answers the API and unknown API paths as JSON, never index.html', async () => {
    expect((await request(app).get('/api/health')).body).toEqual({ status: 'ok' });
    const missing = await request(app).get('/api/nope');
    expect(missing.status).toBe(404);
    expect(missing.text).not.toContain('<title>');
  });
});
