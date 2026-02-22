import { DBSQLClient } from '@databricks/sql';
import type { SystemSnapshot, TopologyConfig } from '../types.js';

interface RunStartRecord {
  runId: string;
  topologyName: string;
  nodeCount: number;
}

interface DatabricksConfig {
  host: string;
  token: string;
  warehouseId: string;
  catalog?: string;
  schema?: string;
}

const METRICS_TABLE = 'snapshot_service_metrics';
const SNAPSHOTS_TABLE = 'snapshots';
const RUNS_TABLE = 'runs';
const RUN_TOPOLOGIES_TABLE = 'run_topologies';
const DEFAULT_SCHEMA = 'simulcra';
const resolvedTableByBase = new Map<string, string>();
let runTopologiesTableEnsured = false;

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlNumber(value: number): string {
  return Number.isFinite(value) ? String(value) : '0';
}

function sqlTimestamp(ms: number): string {
  return `to_timestamp(${sqlString(new Date(ms).toISOString())})`;
}

function normalizeHost(host: string): string {
  return host.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function quotePath(parts: string[]): string {
  return parts.map((p) => `\`${p}\``).join('.');
}

function candidateTableNames(config: DatabricksConfig, baseName: string): string[] {
  const schema = config.schema || DEFAULT_SCHEMA;
  if (config.catalog) return [quotePath([config.catalog, schema, baseName])];
  return [
    quotePath(['hive_metastore', schema, baseName]),
    quotePath(['main', schema, baseName]),
    quotePath([schema, baseName])
  ];
}

function isTableNotFound(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.message.includes('TABLE_OR_VIEW_NOT_FOUND') || err.message.includes('SQLSTATE: 42P01');
}

async function executeStatement(config: DatabricksConfig, statement: string): Promise<void> {
  const client = new DBSQLClient();
  const connected = await client.connect({
    token: config.token,
    host: normalizeHost(config.host),
    path: `/sql/1.0/warehouses/${config.warehouseId}`
  });

  const session = await connected.openSession();
  try {
    const op = await session.executeStatement(statement, { runAsync: true });
    await op.fetchAll();
    await op.close();
  } finally {
    await session.close();
    await connected.close();
  }
}

async function executeWithTableFallback(
  config: DatabricksConfig,
  baseTable: string,
  buildStatement: (qualifiedTable: string) => string
): Promise<void> {
  const candidates = candidateTableNames(config, baseTable);
  const cached = resolvedTableByBase.get(baseTable);
  const ordered = cached ? [cached, ...candidates.filter((c) => c !== cached)] : candidates;

  let lastErr: unknown;
  for (const table of ordered) {
    try {
      await executeStatement(config, buildStatement(table));
      if (resolvedTableByBase.get(baseTable) !== table) {
        resolvedTableByBase.set(baseTable, table);
        console.log(`[databricks] resolved ${baseTable} -> ${table}`);
      }
      return;
    } catch (err) {
      lastErr = err;
      if (!isTableNotFound(err)) throw err;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(`Unable to resolve table: ${baseTable}`);
}

function isRelationMissing(err: unknown): boolean {
  return err instanceof Error && (
    err.message.includes('TABLE_OR_VIEW_NOT_FOUND') ||
    err.message.includes('SQLSTATE: 42P01') ||
    err.message.includes('SCHEMA_NOT_FOUND') ||
    err.message.includes('DATABASE_NOT_FOUND')
  );
}

async function ensureRunTopologiesTable(config: DatabricksConfig): Promise<void> {
  if (runTopologiesTableEnsured) {
    return;
  }

  const candidates = candidateTableNames(config, RUN_TOPOLOGIES_TABLE);
  let lastErr: unknown;
  for (const table of candidates) {
    try {
      await executeStatement(
        config,
        `CREATE TABLE IF NOT EXISTS ${table}
        (run_id STRING, node_count INT, edge_count INT, topology_json STRING, created_at TIMESTAMP, updated_at TIMESTAMP)`
      );
      resolvedTableByBase.set(RUN_TOPOLOGIES_TABLE, table);
      runTopologiesTableEnsured = true;
      return;
    } catch (err) {
      lastErr = err;
      if (!isRelationMissing(err)) throw err;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(`Unable to ensure table: ${RUN_TOPOLOGIES_TABLE}`);
}

async function writeSummarySnapshot(snapshot: SystemSnapshot, config: DatabricksConfig): Promise<void> {
  await executeWithTableFallback(config, SNAPSHOTS_TABLE, (table) => `INSERT INTO ${table}
    (run_id, ts_ms, ts, total_throughput, overall_health_score, bottleneck_service, raw_json, ingested_at)
    VALUES (
      ${sqlString(snapshot.runId)},
      ${Math.round(snapshot.timestamp)},
      ${sqlTimestamp(snapshot.timestamp)},
      ${sqlNumber(snapshot.system.totalThroughput)},
      ${sqlNumber(snapshot.system.overallHealthScore)},
      ${snapshot.system.bottleneckService ? sqlString(snapshot.system.bottleneckService) : 'NULL'},
      ${sqlString(JSON.stringify(snapshot))},
      NOW()
    )`);
}

async function writeServiceMetrics(snapshot: SystemSnapshot, config: DatabricksConfig): Promise<void> {
  const rows = Object.entries(snapshot.services)
    .map(
      ([serviceKey, svc]) =>
        `(${sqlString(snapshot.runId)}, ${Math.round(snapshot.timestamp)}, ${sqlTimestamp(snapshot.timestamp)}, ${sqlString(
          serviceKey
        )}, ${sqlString(svc.nodeId)}, ${sqlString(svc.nodeType)}, ${sqlNumber(svc.throughputPerSec)}, ${sqlNumber(
          svc.avgLatencyMs
        )}, ${sqlNumber(svc.p95LatencyMs)}, ${sqlNumber(svc.errorRate)}, ${sqlNumber(svc.queueDepth)}, ${sqlNumber(
          svc.healthScore
        )}, ${sqlString(svc.status)}, NOW())`
    )
    .join(', ');

  if (!rows) return;

  await executeWithTableFallback(config, METRICS_TABLE, (table) => `INSERT INTO ${table}
    (run_id, ts_ms, ts, service_key, node_id, node_type, throughput_per_sec, avg_latency_ms, p95_latency_ms, error_rate, queue_depth, health_score, status, ingested_at)
    VALUES ${rows}`);
}

export async function writeSnapshotToDatabricks(snapshot: SystemSnapshot, config: DatabricksConfig): Promise<void> {
  await Promise.all([writeSummarySnapshot(snapshot, config), writeServiceMetrics(snapshot, config)]);
}

export async function startRunInDatabricks(payload: RunStartRecord, config: DatabricksConfig): Promise<void> {
  await executeWithTableFallback(config, RUNS_TABLE, (table) => `INSERT INTO ${table}
    (run_id, topology_name, node_count, started_at, created_at, updated_at)
    VALUES (${sqlString(payload.runId)}, ${sqlString(payload.topologyName)}, ${Math.round(payload.nodeCount)}, NOW(), NOW(), NOW())`);
}

export async function endRunInDatabricks(runId: string, config: DatabricksConfig): Promise<void> {
  await executeWithTableFallback(
    config,
    RUNS_TABLE,
    (table) => `UPDATE ${table} SET ended_at = NOW(), updated_at = NOW() WHERE run_id = ${sqlString(runId)}`
  );
}

export async function writeRunTopologyInDatabricks(
  runId: string,
  topology: TopologyConfig,
  config: DatabricksConfig
): Promise<void> {
  await ensureRunTopologiesTable(config);
  await executeWithTableFallback(
    config,
    RUN_TOPOLOGIES_TABLE,
    (table) => `DELETE FROM ${table} WHERE run_id = ${sqlString(runId)}`
  );
  await executeWithTableFallback(config, RUN_TOPOLOGIES_TABLE, (table) => `INSERT INTO ${table}
    (run_id, node_count, edge_count, topology_json, created_at, updated_at)
    VALUES (
      ${sqlString(runId)},
      ${Math.round(topology.nodes.length)},
      ${Math.round(topology.edges.length)},
      ${sqlString(JSON.stringify(topology))},
      NOW(),
      NOW()
    )`);
}

export async function clearAllDatabricksData(config: DatabricksConfig): Promise<void> {
  await ensureRunTopologiesTable(config).catch((err) => {
    console.warn('[databricks] unable to ensure run_topologies before clear:', err);
  });

  const tableNames = [METRICS_TABLE, SNAPSHOTS_TABLE, RUNS_TABLE, RUN_TOPOLOGIES_TABLE];
  for (const tableName of tableNames) {
    try {
      await executeWithTableFallback(config, tableName, (table) => `DELETE FROM ${table}`);
      console.log(`[databricks] cleared ${tableName}`);
    } catch (err) {
      console.warn(`[databricks] skipped clearing ${tableName}:`, err);
    }
  }
}

export async function checkDatabricks(config: DatabricksConfig): Promise<'connected' | 'error'> {
  try {
    await executeWithTableFallback(config, RUNS_TABLE, (table) => `SELECT 1 FROM ${table} LIMIT 1`);
    return 'connected';
  } catch {
    return 'error';
  }
}
