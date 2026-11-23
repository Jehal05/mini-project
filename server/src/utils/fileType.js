/**
 * Decides what a file really is from its first bytes. The file name and the browser's MIME header are
 * ignored because the sender controls both.
 */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function detectFileType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 8) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { kind: 'jpeg', mime: 'image/jpeg', ext: 'jpg' };
  if (buf.subarray(0, 8).equals(PNG_SIGNATURE)) return { kind: 'png', mime: 'image/png', ext: 'png' };
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return { kind: 'pdf', mime: 'application/pdf', ext: 'pdf' };
  return null;
}

export class InvalidImageError extends Error {}

const JPEG_DROP = new Set([0xe1, 0xed, 0xfe]); // EXIF/XMP (APP1), Photoshop/IPTC (APP13), comments
const PNG_DROP = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);

/** Removes metadata (GPS position, camera, comments) from a JPEG. Throws InvalidImageError if it is not well-formed. */
export function stripJpeg(buf) {
  const parts = [buf.subarray(0, 2)];
  let i = 2;
  while (i < buf.length) {
    while (buf[i] === 0xff && buf[i + 1] === 0xff) i += 1; // fill bytes
    if (buf[i] !== 0xff) throw new InvalidImageError('bad JPEG marker');
    const marker = buf[i + 1];
    if (marker === 0xd9) { parts.push(buf.subarray(i, i + 2)); return Buffer.concat(parts); }
    if (marker === 0xda) { parts.push(buf.subarray(i)); return Buffer.concat(parts); } // image data follows, copied as is
    if (i + 4 > buf.length) throw new InvalidImageError('truncated JPEG');
    const length = buf.readUInt16BE(i + 2);
    if (length < 2 || i + 2 + length > buf.length) throw new InvalidImageError('bad JPEG segment');
    if (!JPEG_DROP.has(marker)) parts.push(buf.subarray(i, i + 2 + length));
    i += 2 + length;
  }
  throw new InvalidImageError('JPEG has no image data');
}

/** Removes text, EXIF and timestamp chunks from a PNG. Throws InvalidImageError if it is not well-formed. */
export function stripPng(buf) {
  const parts = [buf.subarray(0, 8)];
  let i = 8;
  let sawEnd = false;
  while (i < buf.length) {
    if (i + 12 > buf.length) throw new InvalidImageError('truncated PNG');
    const length = buf.readUInt32BE(i);
    const end = i + 12 + length;
    if (end > buf.length) throw new InvalidImageError('bad PNG chunk');
    const type = buf.toString('latin1', i + 4, i + 8);
    if (!PNG_DROP.has(type)) parts.push(buf.subarray(i, end));
    i = end;
    if (type === 'IEND') { sawEnd = true; break; }
  }
  if (!sawEnd) throw new InvalidImageError('PNG has no end');
  return Buffer.concat(parts);
}

/** Returns the buffer to store: images with metadata removed, PDFs unchanged. */
export function sanitizeUpload(buf, type) {
  if (type.kind === 'jpeg') return stripJpeg(buf);
  if (type.kind === 'png') return stripPng(buf);
  return buf;
}
