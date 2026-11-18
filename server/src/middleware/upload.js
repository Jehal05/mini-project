import multer from 'multer';
import { config } from '../config/env.js';

// Files are held in memory (bounded by the size limit), checked by their real bytes, cleaned, then written
// under a random name. Nothing the client names ever reaches the file system.
const memory = (maxBytes) => multer({ storage: multer.memoryStorage(), limits: { fileSize: maxBytes, files: 1, fields: 5, fieldSize: 1024, parts: 8 } });

export const uploadPhoto = memory(config.uploads.photoMaxBytes).single('photo');
export const uploadDocument = memory(config.uploads.documentMaxBytes).single('file');
