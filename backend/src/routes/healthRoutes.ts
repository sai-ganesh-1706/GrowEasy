import { Router } from 'express';

const router = Router();

/** GET /api/health — lightweight liveness probe */
router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

export default router;
