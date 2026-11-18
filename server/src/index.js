import { connectDb } from './config/db.js';
import { config } from './config/env.js';
import { createApp } from './app.js';

await connectDb();
createApp().listen(config.port, () => console.log(`HealthTwin API listening on :${config.port} (${config.env})`));
