import { Router } from 'express';
import { writeSnapshotToDatabricks } from '../services/databricks.js';
import { PrometheusSnapshotStore } from '../services/prometheusState.js';
import {
  type PrometheusConfig,
  pushSnapshotToPushgateway,
  shouldExposeScrape,
  shouldPushToGateway
} from '../services/prometheus.js';
import type { RunStateStore } from '../services/runState.js';
import { HttpError, isSystemSnapshot } from '../types.js';

interface MetricsDeps {
  databricks: { host: string; token: string; warehouseId: string };
  runState: RunStateStore;
  prometheus: PrometheusConfig;
  prometheusStore: PrometheusSnapshotStore;
}

export function createMetricsRouter(deps: MetricsDeps): Router {
  const router = Router();

  router.get('/prometheus', (_req, res) => {
    if (!shouldExposeScrape(deps.prometheus)) {
      res.status(404).json({ error: 'Prometheus scrape mode is disabled' });
      return;
    }

    res
      .status(200)
      .set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
      .send(deps.prometheusStore.getText());
  });

  router.post('/snapshot', (req, res, next) => {
    try {
      if (!isSystemSnapshot(req.body)) throw new HttpError(400, 'Invalid SystemSnapshot payload');
      const snapshot = req.body;
      res.status(200).json({ ok: true });

      const decision = deps.runState.evaluateSnapshot(snapshot);
      if (!decision.persist) {
        console.log(`[metrics/snapshot] skipped runId=${snapshot.runId} reason=${decision.reason}`);
        return;
      }

      void writeSnapshotToDatabricks(snapshot, deps.databricks).catch((err) => {
        console.error('[metrics/snapshot] databricks error:', err);
      });

      if (shouldExposeScrape(deps.prometheus)) {
        deps.prometheusStore.setLatest(snapshot);
      }

      if (shouldPushToGateway(deps.prometheus) && deps.prometheus.pushgatewayUrl) {
        void pushSnapshotToPushgateway(snapshot, deps.prometheus.pushgatewayUrl, deps.prometheus.jobName).catch(
          (err) => {
            console.error('[metrics/snapshot] pushgateway error:', err);
          }
        );
      }
    } catch (err) {
      next(err);
    }
  });

  return router;
}
