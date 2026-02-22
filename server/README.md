# Simulcra Backend Server

Express + TypeScript API for simulation ingestion (MVP mode).

Databricks table targets used by this server:
- `simulcra.snapshot_service_metrics` (per-service rows)
- `simulcra.snapshots` (one row per emitted snapshot)
- `simulcra.runs` (run lifecycle rows)
- `simulcra.run_topologies` (one row per run with topology JSON)

## Requirements

- Node.js 20+
- Databricks SQL Warehouse + token

## Setup

1. Copy env vars:

```bash
cp .env.example .env
```

2. Install dependencies:

```bash
npm install
```

3. Run in dev mode:

```bash
npm run dev
```

The server starts on `http://localhost:3001` (or `PORT`).

## Environment variables

- `DATABRICKS_HOST` Example: `dbc-c0249c28-448d.cloud.databricks.com`
- `DATABRICKS_TOKEN` Databricks PAT
- `DATABRICKS_WAREHOUSE_ID` Warehouse id (the id part from `/sql/1.0/warehouses/<id>`)
- `DATABRICKS_HTTP_PATH` Optional alternative, e.g. `/sql/1.0/warehouses/45523db66932781d`
- `DATABRICKS_CATALOG` Optional Unity Catalog name used to fully qualify tables
- `DATABRICKS_SCHEMA` Optional schema name used to fully qualify tables
- `PROMETHEUS_ENABLED` Optional, `true` to enable Prometheus integration (default `false`)
- `PROMETHEUS_MODE` Optional, one of `pushgateway`, `scrape`, `both` (default `pushgateway`)
- `PUSHGATEWAY_URL` Required when `PROMETHEUS_MODE` includes pushgateway
- `PROMETHEUS_JOB_NAME` Optional Pushgateway job name (default `simulation`)
- `PORT` Defaults to `3001`

## Routes

### `POST /metrics/snapshot`

Receives `SystemSnapshot`, responds immediately, then asynchronously writes to Databricks.

```bash
curl -X POST http://localhost:3001/metrics/snapshot \
  -H 'Content-Type: application/json' \
  -d '{
    "runId": "run-123",
    "timestamp": 1730000000000,
    "services": {
      "worker-a": {
        "nodeId": "worker-a",
        "nodeType": "worker",
        "throughputPerSec": 120,
        "avgLatencyMs": 40,
        "p95LatencyMs": 80,
        "errorRate": 0.02,
        "queueDepth": 5,
        "healthScore": 0.94,
        "status": "healthy"
      }
    },
    "system": {
      "totalThroughput": 120,
      "overallHealthScore": 0.94,
      "bottleneckService": null
    }
  }'
```

### `POST /ai/generate-topology`

Currently disabled in MVP mode and returns 503.

```bash
curl -X POST http://localhost:3001/ai/generate-topology \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Kafka event pipeline with API gateway, workers, cache, and postgres"}'
```

### `POST /runs/start`

Writes run start metadata and topology JSON to Databricks.

```bash
curl -X POST http://localhost:3001/runs/start \
  -H 'Content-Type: application/json' \
  -d '{
    "runId":"run-123",
    "topologyName":"Checkout Flow",
    "nodeCount":8,
    "topology":{
      "nodes":[{"id":"node-0","type":"producer","label":"Producer"}],
      "edges":[]
    }
  }'
```

### `POST /runs/end`

Marks a run as ended in Databricks.

```bash
curl -X POST http://localhost:3001/runs/end \
  -H 'Content-Type: application/json' \
  -d '{"runId":"run-123"}'
```

### `GET /health`

Checks Databricks connectivity and Prometheus integration health.

```bash
curl http://localhost:3001/health
```

### `GET /metrics/prometheus`

Returns Prometheus exposition format when scrape mode is enabled.

```bash
curl http://localhost:3001/metrics/prometheus
```
