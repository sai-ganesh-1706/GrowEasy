import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Attaches a unique `requestId` to every incoming request.
 *
 * If the client sends an `X-Request-Id` header it is reused; otherwise a
 * new UUID v4 is generated. The id is also set on the response header so
 * clients can correlate responses to requests.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const id = (req.headers['x-request-id'] as string) || uuidv4();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}

// ── Augment Express Request ──────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      /** Unique per-request identifier for log correlation */
      requestId: string;
    }
  }
}
