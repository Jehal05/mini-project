// 404 handler and central error handler: every error leaves the API as JSON { error, message }.
import mongoose from 'mongoose';

export function notFound(req, res) {
  res.status(404).json({
    error: 'NotFound',
    message: `Route ${req.method} ${req.originalUrl} does not exist`,
  });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let error = err.error || 'InternalServerError';
  let message = err.message || 'Something went wrong';

  if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    error = 'ValidationError';
    message = Object.values(err.errors).map((e) => e.message).join('; ');
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    error = 'InvalidId';
    message = `Invalid value for ${err.path}`;
  } else if (err.code === 11000) {
    status = 409;
    error = 'Duplicate';
    message = `Duplicate value for ${Object.keys(err.keyValue || {}).join(', ')}`;
  }

  if (status >= 500) console.error('[error]', err);

  // Do not leak internal details in production.
  if (status >= 500 && process.env.NODE_ENV === 'production') {
    message = 'Something went wrong';
  }

  res.status(status).json({ error, message });
}
