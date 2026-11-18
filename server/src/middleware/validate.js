import { ApiError } from '../utils/ApiError.js';

/** Validates req[source] with a zod schema and stores the parsed result on req.valid. */
export const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source] ?? {});
  if (!result.success) {
    const fields = {};
    for (const issue of result.error.issues) fields[issue.path.join('.') || '_'] ??= issue.message;
    return next(new ApiError(400, 'VALIDATION_ERROR', 'Please check the highlighted fields', fields));
  }
  req.valid = result.data;
  return next();
};
