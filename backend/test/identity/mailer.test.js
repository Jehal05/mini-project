import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadMailer(env) {
  Object.assign(process.env, env);
  vi.resetModules();
  const mod = await import('../../src/utils/mailer.js');
  for (const k of Object.keys(env)) delete process.env[k];
  return mod;
}
afterEach(() => vi.unstubAllGlobals());

describe('email API (Resend) path of feature 7', () => {
  const env = { MAIL_PROVIDER: 'resend', RESEND_API_KEY: 'test-key', MAIL_FROM: 'HealthTwin <no-reply@example.test>' };

  it('posts the message with the API key and does not use the console outbox', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { sendMail, outbox } = await loadMailer(env);
    await sendMail({ to: 'a@b.test', subject: 'Hi', text: 'Body' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer test-key');
    expect(JSON.parse(init.body)).toEqual({ from: 'HealthTwin <no-reply@example.test>', to: ['a@b.test'], subject: 'Hi', text: 'Body' });
    expect(outbox).toHaveLength(0);
  });

  it('throws when the provider refuses, so the caller can log it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 422 })));
    const { sendMail } = await loadMailer(env);
    await expect(sendMail({ to: 'a@b.test', subject: 'Hi', text: 'Body' })).rejects.toThrow(/422/);
  });

  it('falls back to the console outbox when no API key is set', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { sendMail, outbox } = await loadMailer({ MAIL_PROVIDER: 'resend', RESEND_API_KEY: '' });
    await sendMail({ to: 'a@b.test', subject: 'Hi', text: 'Body' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(outbox).toHaveLength(1);
  });
});
