import { Router } from 'express';
import { checkDatabricks } from '../services/databricks.js';

interface HealthDeps {
  databricks: { host: string; token: string; warehouseId: string };
}

export function createHealthRouter(deps: HealthDeps): Router {
  const router = Router();

  router.get('/', async (_req, res, next) => {
    try {
      const databricks = await checkDatabricks(deps.databricks);

      res.status(200).json({
        status: 'ok',
        databricks,
        pushgateway: 'disabled',
        anthropic: 'disabled',
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
