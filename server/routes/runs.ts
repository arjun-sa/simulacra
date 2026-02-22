import { Router } from 'express';
import { endRunInDatabricks, startRunInDatabricks, writeRunTopologyInDatabricks } from '../services/databricks.js';
import type { RunStateStore } from '../services/runState.js';
import { HttpError, isTopologyConfig } from '../types.js';

interface RunsDeps {
  databricks: { host: string; token: string; warehouseId: string };
  runState: RunStateStore;
}

export function createRunsRouter(deps: RunsDeps): Router {
  const router = Router();

  router.post('/start', async (req, res, next) => {
    try {
      const { runId, topologyName, nodeCount, topology } = req.body ?? {};
      if (
        typeof runId !== 'string' ||
        typeof topologyName !== 'string' ||
        typeof nodeCount !== 'number' ||
        !isTopologyConfig(topology)
      ) {
        throw new HttpError(400, 'Expected { runId, topologyName, nodeCount, topology }');
      }

      await startRunInDatabricks({ runId, topologyName, nodeCount }, deps.databricks);
      await writeRunTopologyInDatabricks(runId, topology, deps.databricks);
      deps.runState.markStarted(runId);
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/end', async (req, res, next) => {
    try {
      const runId = req.body?.runId;
      if (typeof runId !== 'string') throw new HttpError(400, 'Expected { runId }');

      await endRunInDatabricks(runId, deps.databricks);
      deps.runState.markEnded(runId);
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
