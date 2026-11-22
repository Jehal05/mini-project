export const isObjectId = (v) => typeof v === 'string' && /^[0-9a-f]{24}$/i.test(v);
