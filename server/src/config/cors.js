// Reads the allowed frontend origins from CLIENT_URL (comma-separated) for Express and Socket.IO.
export function allowedOrigins() {
  return (process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}
