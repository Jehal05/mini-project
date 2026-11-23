import { httpError } from '../utils/httpError.js';
export const invalid = (fields) => Object.assign(httpError(400, 'Please check the highlighted fields'), { code: 'VALIDATION_ERROR', fields });
