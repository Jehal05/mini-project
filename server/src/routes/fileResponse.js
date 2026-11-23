// Headers for any file handed back: never cached, never sniffed, never allowed to run anything.
export function sendFile(res, { mime, data, name }) {
  res.set({
    'Content-Type': mime,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    ...(name && { 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(name)}` }),
  });
  res.send(data);
}
