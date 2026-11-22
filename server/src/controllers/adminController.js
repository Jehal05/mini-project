import { asyncHandler } from '../utils/asyncHandler.js';
import { getSummary } from '../services/analytics.js';

export const analyticsSummary = asyncHandler(async (req, res) => res.json(await getSummary(req.query)));
