#!/usr/bin/env node
// Feature 99 command line. Usage (from server/):
//   node scripts/backup.js backup [--label name]
//   node scripts/backup.js list
//   node scripts/backup.js verify <file>
//   node scripts/backup.js restore <file>                     (dry run: shows what would change)
//   node scripts/backup.js restore <file> --confirm RESTORE   (really restores, after a safety backup)
//   node scripts/backup.js keygen                             (prints a new BACKUP_ENCRYPTION_KEY)
import crypto from 'node:crypto';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { getBackupService } from '../src/services/backupDefault.js';

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };
const arg = rest.find((a) => !a.startsWith('--') && rest[rest.indexOf(a) - 1] !== '--label' && rest[rest.indexOf(a) - 1] !== '--confirm');
const actor = undefined; // command line runs as the server owner, recorded as an empty actor in the audit log

const usage = () => console.log('Commands: backup [--label x] | list | verify <file> | restore <file> [--confirm RESTORE] | keygen');

async function main() {
  if (cmd === 'keygen') {
    console.log(crypto.randomBytes(32).toString('hex'));
    console.error('Put this in BACKUP_ENCRYPTION_KEY. Keep a copy somewhere safe: without it encrypted backups cannot be read.');
    return 0;
  }
  if (!['backup', 'list', 'verify', 'restore'].includes(cmd)) { usage(); return 1; }

  await connectDB();
  const svc = getBackupService();
  try {
    if (cmd === 'backup') {
      const r = await svc.createBackup({ actor, label: flag('label') });
      console.log(`Backup written and verified: ${r.name} (${r.totalDocuments} documents, ${r.encrypted ? 'encrypted' : 'NOT encrypted'})`);
      if (r.removedByRetention.length) console.log(`Removed by retention: ${r.removedByRetention.join(', ')}`);
    } else if (cmd === 'list') {
      const r = await svc.listBackups();
      for (const b of r.results) console.log(`${b.name}  ${b.createdAt ?? ''}  ${b.totalDocuments ?? '?'} docs  ${b.encrypted ? 'encrypted' : 'plain'}`);
      if (!r.count) console.log('No backups yet.');
    } else if (cmd === 'verify') {
      if (!arg) { usage(); return 1; }
      const r = await svc.verifyBackup(arg, { actor });
      console.log(r.ok ? `OK: ${r.name} (${r.totalDocuments} documents)` : `FAILED: ${r.name}\n - ${r.problems.join('\n - ')}`);
      return r.ok ? 0 : 2;
    } else if (cmd === 'restore') {
      if (!arg) { usage(); return 1; }
      const r = await svc.restoreBackup(arg, { actor, confirm: flag('confirm') });
      console.log(r.dryRun ? 'DRY RUN, nothing was changed.' : `RESTORED from ${r.name}. Safety backup: ${r.safetyBackup}`);
      for (const p of r.plan) console.log(`  ${p.collection}: live ${p.liveDocuments} -> backup ${p.backupDocuments}`);
      if (r.untouchedCollections.length) console.log(`  not in the backup, left as they are: ${r.untouchedCollections.join(', ')}`);
      if (r.dryRun) console.log(r.message);
    }
    return 0;
  } catch (e) {
    console.error(`Error: ${e.message}`);
    return 1;
  } finally {
    await disconnectDB();
  }
}

main().then((code) => { process.exitCode = code; });
