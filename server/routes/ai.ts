import { Router } from 'express';

export function createAiRouter(): Router {
  const router = Router();

  router.post('/generate-topology', (_req, res) => {
    res.status(503).json({ error: 'AI topology generation is temporarily disabled for MVP' });
  });

  return router;
}
