import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

// The limiter is off in the normal suite. Build a second app with it switched on.
async function limitedApp() {
  process.env.RATE_LIMIT = 'on';
  vi.resetModules();
  const { createApp } = await import('../../src/app.js');
  delete process.env.RATE_LIMIT;
  return createApp();
}

describe('rate limiting', () => {
  it('stops a flood of logins from one address (30 per 15 minutes) with 429', async () => {
    const app = await limitedApp();
    const statuses = [];
    for (let i = 0; i < 32; i += 1) {
      const res = await request(app).post('/api/auth/login/patient').send({ identifier: `flood${i}@test.example`, password: 'Wrong12345' });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 30).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(30)).toEqual([429, 429]);
  });

  it('limits password-reset requests to 10 per 15 minutes', async () => {
    const app = await limitedApp();
    const statuses = [];
    for (let i = 0; i < 12; i += 1) statuses.push((await request(app).post('/api/auth/forgot-password').send({ email: 'x@test.example' })).status);
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });

  it('answers with the standard error shape and a retry hint', async () => {
    const app = await limitedApp();
    let res;
    for (let i = 0; i < 11; i += 1) res = await request(app).post('/api/auth/forgot-password').send({ email: 'x@test.example' });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('TOO_MANY_REQUESTS');
    expect(res.headers).toHaveProperty('ratelimit');
  });
});
