import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { createHealthRouter } from './routes/health.js';
import { createMetricsRouter } from './routes/metrics.js';
import { createRunsRouter } from './routes/runs.js';
import { createAiRouter } from './routes/ai.js';
import { RunStateStore } from './services/runState.js';

dotenv.config();

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function resolveWarehouseId(): string {
  const fromId = process.env.DATABRICKS_WAREHOUSE_ID?.trim();
  if (fromId) return fromId;

  const fromPath = process.env.DATABRICKS_HTTP_PATH?.trim();
  if (fromPath) {
    const match = fromPath.match(/\/warehouses\/([^/]+)\/?$/);
    if (match?.[1]) return match[1];
  }

  throw new Error('Missing Databricks warehouse config: set DATABRICKS_WAREHOUSE_ID or DATABRICKS_HTTP_PATH');
}

const config = {
  databricks: {
    host: readRequiredEnv('DATABRICKS_HOST'),
    token: readRequiredEnv('DATABRICKS_TOKEN'),
    warehouseId: resolveWarehouseId(),
    catalog: process.env.DATABRICKS_CATALOG?.trim() || undefined,
    schema: process.env.DATABRICKS_SCHEMA?.trim() || undefined
  },
  port: Number(process.env.PORT || 3001)
};

const app = express();
const runState = new RunStateStore();
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);

app.use('/metrics', createMetricsRouter({ databricks: config.databricks, runState }));
app.use('/ai', createAiRouter());
app.use('/runs', createRunsRouter({ databricks: config.databricks, runState }));
app.use('/health', createHealthRouter({ databricks: config.databricks }));

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`Server listening on http://localhost:${config.port}`);
});
