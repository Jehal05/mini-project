// HTTP helpers: an error type that carries a status code, and a wrapper that forwards async errors.
export class HttpError extends Error {
  constructor(status, error, message) {
    super(message);
    this.status = status;
    this.error = error;
  }
}

// Express 4 does not catch rejected promises, so route handlers are wrapped with this.
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
