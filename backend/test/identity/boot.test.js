import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Vitest is forgiving about imports; plain Node is not. This loads the real app modules the way `node src/index.js` does.
describe('the server modules load in plain Node', () => {
  it('imports the app, monitoring and the live notifier without an import error', () => {
    const out = execFileSync(process.execPath, ['--input-type=module', '-e',
      "await import('./src/app.js'); await import('./src/monitoring.js'); const m = await import('./src/emergency/liveNotifier.js'); console.log(typeof m.createLiveNotifier)"],
    { cwd: root, env: { ...process.env, NODE_ENV: 'test' }, encoding: 'utf8' });
    expect(out.trim()).toBe('function');
  });
});
