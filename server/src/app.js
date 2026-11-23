import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

// The Express app is exported separately from server.js so tests can import it
// without opening a port or a database connection.
const app = express();

app.use(helmet());
app.use(cors({ origin: env.clientUrl, credentials: true }));
// Files arrive as base64 JSON (5 MB file = about 7 MB of text), so those routes get a bigger limit before the general one.
app.use(['/api/patients/me/documents', '/api/patients/me/photo', /^\/api\/inpatient\/admissions\/[a-f\d]{24}\/records\/file$/i], express.json({ limit: '8mb' }));
app.use(express.json({ limit: '1mb' }));

// The monitoring and detection routers are added at startup (server.js) because they need the Socket.IO server.
// They are mounted here, before the not-found handler, so they are reachable.
export const monitoringMount = express.Router();
app.use(monitoringMount);

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

export default app;
