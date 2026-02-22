import { Router } from 'express';
import { writeSnapshotToDatabricks } from '../services/databricks.js';
import type { RunStateStore } from '../services/runState.js';
import { HttpError, isSystemSnapshot } from '../types.js';

interface MetricsDeps {
  databricks: { host: string; token: string; warehouseId: string };
  runState: RunStateStore;
}

export function createMetricsRouter(deps: MetricsDeps): Router {
  const router = Router();

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
    } catch (err) {
      next(err);
    }
  });

  return router;
}
