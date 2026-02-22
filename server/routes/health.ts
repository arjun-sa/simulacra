import { Router } from 'express';
import { checkDatabricks } from '../services/databricks.js';
import { checkPushgateway, type PrometheusConfig, shouldPushToGateway } from '../services/prometheus.js';

interface HealthDeps {
  databricks: { host: string; token: string; warehouseId: string };
  prometheus: PrometheusConfig;
}

export function createHealthRouter(deps: HealthDeps): Router {
  const router = Router();

  router.get('/', async (_req, res, next) => {
    try {
      const databricks = await checkDatabricks(deps.databricks);
      let pushgateway: 'disabled' | 'connected' | 'error' = 'disabled';
      if (shouldPushToGateway(deps.prometheus) && deps.prometheus.pushgatewayUrl) {
        pushgateway = await checkPushgateway(deps.prometheus.pushgatewayUrl);
      }

      res.status(200).json({
        status: 'ok',
        databricks,
        pushgateway,
        prometheus: {
          enabled: deps.prometheus.enabled,
          mode: deps.prometheus.mode
        },
        anthropic: 'disabled',
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
