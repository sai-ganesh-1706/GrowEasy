import { config } from './config'; // ← must be first: loads dotenv + validates env
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import apiRoutes from './routes';
import { errorHandler } from './middleware';
import { requestId } from './middleware/requestId';
import { logger } from './utils/logger';

const app = express();

// ── Global Middleware ────────────────────────────────────────────────────────

// Request correlation ID (before anything else so logs have it)
app.use(requestId);

// Security / safety nets
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// Rate limiting — applies to all /api routes
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
  }),
);

// ── API Routes ──────────────────────────────────────────────────────────────
app.use('/api', apiRoutes);

// ── Centralized Error Handler (must be registered LAST) ─────────────────────
app.use(errorHandler);

// ── Start Server ────────────────────────────────────────────────────────────
if (config.NODE_ENV !== 'test') {
  app.listen(config.PORT, () => {
    logger.info('Server started', {
      port: config.PORT,
      env: config.NODE_ENV,
      llmProvider: config.LLM_PROVIDER,
      batchSize: config.MAX_BATCH_SIZE,
    });
  });
}

export default app;
