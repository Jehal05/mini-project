// Builds the real backup service from the environment. Created on first use so importing this file costs nothing.
import fs from 'node:fs';
import { env } from '../config/env.js';
import { createBackupService } from './backup.js';
import { createCodec, mongoStore } from './mongoStore.js';
import { writeAdminAudit } from './auditRepo.js';

let service = null;
export function getBackupService() {
  if (!service) {
    const pkg = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    service = createBackupService({
      store: mongoStore,
      codec: createCodec(),
      dir: env.backupDir,
      keep: env.backupKeep,
      encryptionKey: env.backupEncryptionKey,
      nodeEnv: env.nodeEnv,
      allowProductionRestore: env.allowProductionRestore,
      appVersion: pkg.version,
      audit: writeAdminAudit,
    });
  }
  return service;
}
