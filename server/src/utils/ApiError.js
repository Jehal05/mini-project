export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message = 'Bad request', details) { return new ApiError(400, 'BAD_REQUEST', message, details); }
  static unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED') { return new ApiError(401, code, message); }
  static forbidden(message = 'You do not have access to this resource', code = 'FORBIDDEN') { return new ApiError(403, code, message); }
  static notFound(message = 'Not found') { return new ApiError(404, 'NOT_FOUND', message); }
  static conflict(message = 'Conflict', code = 'CONFLICT') { return new ApiError(409, code, message); }
  static tooMany(message = 'Too many attempts. Try again later.') { return new ApiError(429, 'TOO_MANY_REQUESTS', message); }
}
