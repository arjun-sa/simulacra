import dotenv from 'dotenv';
import { clearAllDatabricksData } from '../services/databricks.js';

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

async function main(): Promise<void> {
  const catalog = process.env.DATABRICKS_CATALOG?.trim();
  const schema = process.env.DATABRICKS_SCHEMA?.trim();
  const config = {
    host: readRequiredEnv('DATABRICKS_HOST'),
    token: readRequiredEnv('DATABRICKS_TOKEN'),
    warehouseId: resolveWarehouseId(),
    ...(catalog ? { catalog } : {}),
    ...(schema ? { schema } : {}),
  };

  await clearAllDatabricksData(config);
}

main().catch((err) => {
  console.error('Failed to clear Databricks data', err);
  process.exit(1);
});
