import './env.ts';
import * as Sentry from '@sentry/node';
import { buildApp } from './app.ts';
import { env } from './env.ts';
import { pool } from './db/index.ts';

const app = await buildApp();
Sentry.setupFastifyErrorHandler(app);
try { await app.listen({ port: env.PORT, host: '0.0.0.0' }); }   // 0.0.0.0 required on Railway
catch (err) { app.log.error(err); process.exit(1); }

async function shutdown(sig: NodeJS.Signals) {
  app.log.info(`${sig} received — draining`);
  try { await app.close(); await pool.end(); await Sentry.close(2000); process.exit(0); }
  catch (err) { app.log.error(err); process.exit(1); }
}
for (const sig of ['SIGTERM', 'SIGINT'] as const) process.on(sig, () => void shutdown(sig));
