import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { loadCatalog } from './catalog.js';

const catalogDir = process.env.CATALOG_DIR ?? fileURLToPath(new URL('../../../data/catalog', import.meta.url));
const port = Number(process.env.PORT ?? 3001);

// Unset or invalid limits fall back to the defaults in agentClient.ts.
const positive = (value?: string) => (Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : undefined);

const REQUESTS_PER_MINUTE = 20;

const app = buildApp(loadCatalog(catalogDir), join(catalogDir, 'media'), {
  agentsUrl: process.env.AGENTS_URL,
  dailyModelCalls: positive(process.env.AGENT_DAILY_MODEL_CALLS),
  concurrentRuns: positive(process.env.AGENT_CONCURRENT_RUNS)
}, {
  // WEB_DIR is set in the container image; in development Vite serves the dashboard instead.
  webDir: process.env.WEB_DIR,
  requestsPerMinute: positive(process.env.RATE_LIMIT_PER_MINUTE) ?? REQUESTS_PER_MINUTE,
  trustProxy: positive(process.env.TRUST_PROXY)
});
await app.listen({ port, host: '0.0.0.0' });
