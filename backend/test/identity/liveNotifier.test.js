import { describe, expect, it, vi } from 'vitest';
import { createLiveNotifier } from '../../src/emergency/liveNotifier.js';

const quiet = { log() {}, error() {} };

describe('live contact notifier', () => {
  it('only logs when nothing is configured', async () => {
    const mail = vi.fn(); const push = { setVapidDetails: vi.fn(), sendNotification: vi.fn() };
    const n = createLiveNotifier({ env: {}, logger: quiet, mail, push });
    expect(n.live).toEqual({ email: false, push: false });
    expect((await n.email({ to: 'a@b.c', subject: 's', text: 't' })).delivered).toBe(false);
    expect((await n.push({ to: '{}', text: 't' })).delivered).toBe(false);
    expect(mail).not.toHaveBeenCalled(); expect(push.sendNotification).not.toHaveBeenCalled();
  });
  it('sends web push when VAPID keys are set, accepting a stored JSON subscription', async () => {
    const push = { setVapidDetails: vi.fn(), sendNotification: vi.fn().mockResolvedValue({}) };
    const n = createLiveNotifier({ env: { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' }, logger: quiet, push });
    const res = await n.push({ to: JSON.stringify({ endpoint: 'https://push.example/x' }), text: 'help', link: 'https://h/s' });
    expect(res.mode).toBe('web-push');
    expect(push.setVapidDetails).toHaveBeenCalled();
    expect(push.sendNotification.mock.calls[0][0]).toEqual({ endpoint: 'https://push.example/x' });
  });
});
