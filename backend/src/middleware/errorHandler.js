import { config } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

export function notFound(req, _res, next) {
  next(ApiError.notFound(`No route for ${req.method} ${req.path}`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  let e = err;
  if (err?.type === 'entity.parse.failed') e = ApiError.badRequest('Malformed JSON body');
  else if (err?.type === 'entity.too.large') e = new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  else if (err?.name === 'MulterError') {
    e = err.code === 'LIMIT_FILE_SIZE'
      ? new ApiError(413, 'FILE_TOO_LARGE', 'That file is too large')
      : new ApiError(400, 'UPLOAD_ERROR', 'The upload could not be read. Send one file in the expected field.');
  } else if (err?.code === 11000) e = ApiError.conflict('That value is already in use');
  else if (err?.name === 'ValidationError' && err.errors) {
    const fields = Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v.message]));
    e = new ApiError(400, 'VALIDATION_ERROR', 'Validation failed', fields);
  }

  if (!(e instanceof ApiError)) {
    console.error('[error]', err);
    e = new ApiError(500, 'INTERNAL_ERROR', config.isProd ? 'Something went wrong' : err.message);
  }
  res.status(e.status).json({ error: { code: e.code, message: e.message, details: e.details } });
}
