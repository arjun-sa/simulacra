# Simulcra

Simulcra is an interactive distributed-systems simulator with live topology editing, failure modeling, and observability export.

You can:
- Build and edit service topologies on a canvas.
- Run a tick-based simulation in real time.
- Watch throughput, latency, queue depth, health, and failure events.
- Persist run data and topology to Databricks.
- Export node-level metrics to Prometheus (scrape or Pushgateway mode).

## System Overview

Simulcra is split into two runtime layers:
- `frontend/`: React + Vite app that contains the simulation engine and visual UI.
- `server/`: Express + TypeScript ingestion API for Databricks persistence and Prometheus endpoints.

High-level data flow:
1. Frontend simulation runs locally in-browser.
2. On each snapshot callback, frontend posts a normalized payload to `server`.
3. Server deduplicates/filters snapshots and asynchronously writes accepted data to Databricks.
4. Server also exposes Prometheus metrics (`/metrics/prometheus`) and optionally pushes to Pushgateway.

## Repository Layout

- `frontend/src/app/` UI and topology editor
- `frontend/src/simulation/` simulation engine, node models, routing, metrics logic
- `server/routes/` API route handlers
- `server/services/` Databricks, Prometheus, run state, etc.
- `scripts/run-prometheus.sh` local Prometheus launcher helper
- `PROMETHEUS_SETUP.md` Prometheus setup notes

## Key Features Implemented

### 1. Interactive Simulation Canvas
- Drag-and-drop nodes
- Connect services with directed edges
- Select/edit node config
- Pan across large topologies
- Start/Pause/Resume/Step controls

### 2. Realistic Default Topology
Current starter system includes:
- `Event Producer`
- `Priority Producer` (throughput `2`)
- `API Gateway`
- `Kafka Cluster`
- `Consumer Group`
- `Load Balancer`
- `Worker Pool A`
- `Worker Pool B`
- `Redis Cache`
- `Circuit Breaker`
- `PostgreSQL` (sink)
- `DLQ`

Notes:
- Cache hits now terminate locally (they do not forward), so they reduce downstream load.
- DLQ routing requires explicit edges.
- Normal routing avoids DLQ edges; DLQ is treated as failure path.

### 3. Node-Specific Behavior Models
Each node has explicit simulation logic in `frontend/src/simulation/nodes/*.ts`, with class-level comments describing behavior.

Examples:
- API gateway: throughput budget + timeout drops
- Kafka: partition queues + per-partition drain rates
- Worker pools: replica-scaled processing + probabilistic errors
- Circuit breaker: closed/open/half-open state machine
- DLQ: terminal sink that accumulates unresolved failures

### 4. Run + Topology Persistence in Databricks
Server persists:
- Per-service metrics snapshots
- Run-level snapshots
- Run lifecycle (`start` / `end`)
- Run topology JSON (`run_topologies`)

This enables post-run architecture-aware analysis (not just symptom metrics).

### 5. Prometheus Integration
Server supports:
- `scrape` mode (`GET /metrics/prometheus`)
- `pushgateway` mode
- `both`

Prometheus output includes granular node metrics (identity, throughput, latency, queue depth, error/health, status encoding, backpressure estimate), plus run-level aggregates.

## Frontend Setup

Requirements:
- Node.js 20+

Commands:
```bash
cd /Users/arjunsakthi/Simulcra/frontend
npm install
npm run dev
```

Frontend runs on Vite default (`http://localhost:5173`).

## Server Setup

Requirements:
- Node.js 20+
- Databricks SQL Warehouse credentials

Commands:
```bash
cd /Users/arjunsakthi/Simulcra/server
cp .env.example .env
npm install
npm run dev
```

Server default:
- `http://localhost:3001`

Important env vars:
- `DATABRICKS_HOST`
- `DATABRICKS_TOKEN`
- `DATABRICKS_WAREHOUSE_ID` (or `DATABRICKS_HTTP_PATH`)
- `DATABRICKS_CATALOG` / `DATABRICKS_SCHEMA` (optional)
- `PROMETHEUS_ENABLED`
- `PROMETHEUS_MODE` (`pushgateway|scrape|both`)
- `PUSHGATEWAY_URL` (required for push modes)

## API Endpoints

### `POST /runs/start`
Starts a run record and persists topology.

Expected body:
- `runId`
- `topologyName`
- `nodeCount`
- `topology` (`nodes` + `edges`)

### `POST /runs/end`
Marks run as ended.

### `POST /metrics/snapshot`
Accepts simulation snapshot payload, deduplicates, writes to Databricks, and updates Prometheus state.

### `GET /metrics/prometheus`
Prometheus exposition output (when scrape mode enabled).

### `GET /health`
Connectivity/feature status including Databricks and Prometheus mode.

## Databricks Tables

Configured targets:
- `simulcra.snapshot_service_metrics`
- `simulcra.snapshots`
- `simulcra.runs`
- `simulcra.run_topologies`

## Data Reset Utility

To clear persisted simulation data from Databricks:
```bash
cd /Users/arjunsakthi/Simulcra/server
npm run clear:data
```

This clears:
- `snapshot_service_metrics`
- `snapshots`
- `runs`
- `run_topologies`

## Prometheus (Local)

If using local binary bundle:
```bash
cd /Users/arjunsakthi/Simulcra
./scripts/run-prometheus.sh
```

Prometheus UI:
- `http://localhost:9090`

See also:
- `/Users/arjunsakthi/Simulcra/PROMETHEUS_SETUP.md`

## Simulation Semantics (Important)

- Simulation is tick-based (`DEFAULT_TICK_MS = 100` in engine).
- `throughputPerSec` translates into per-tick processing budgets with carry.
- Failures can emit `message_error` / `message_dropped` events.
- Engine-level failure handling can route failed messages to DLQ only via explicit DLQ downstream edges.
- Load balancer currently adapts to crash/recover state (non-crashed targets), not full runtime error-rate weighting.

## Current Limitations

- Load balancer does not yet dynamically weight by observed failure/latency.
- Some service models are intentionally simplified and probabilistic.
- Metrics cardinality grows by `run_id` + `node` labels; tune strategy if scaling to many concurrent runs.
- Frontend chunk size is currently large in production build output.

## Suggested Next Improvements

1. Dynamic LB adaptation using downstream rolling error/latency windows.
2. Retry/backoff policy nodes to model safer failure recovery.
3. Rich run comparison UI backed by Databricks history.
4. Optional topology linting (detect anti-patterns before run start).
5. Dashboard presets for Prometheus/Grafana.

## Development Notes

Frontend build check:
```bash
cd /Users/arjunsakthi/Simulcra/frontend
npm run build
```

Server type check:
```bash
cd /Users/arjunsakthi/Simulcra/server
npm run check
```
