import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/env.js';

/** Files are stored under random names the server picks; a name from the client is never part of a path. */
const folder = (area) => path.join(config.uploads.dir, area);

export async function saveFile(area, buffer, ext) {
  await fs.mkdir(folder(area), { recursive: true, mode: 0o700 });
  const storedName = `${crypto.randomBytes(24).toString('hex')}.${ext}`;
  await fs.writeFile(path.join(folder(area), storedName), buffer, { mode: 0o600, flag: 'wx' });
  return storedName;
}

function resolveSafe(area, storedName) {
  const name = path.basename(String(storedName));
  if (name !== storedName || !/^[a-f0-9]{48}\.(jpg|png|pdf)$/.test(name)) throw new Error('invalid stored file name');
  return path.join(folder(area), name);
}

export const readFile = (area, storedName) => fs.readFile(resolveSafe(area, storedName));

export async function deleteFile(area, storedName) {
  try {
    await fs.unlink(resolveSafe(area, storedName));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err; // already gone is fine
  }
}
