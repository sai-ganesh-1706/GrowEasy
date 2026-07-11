import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../types';

/**
 * Express middleware factory for Zod-based request body validation.
 *
 * Usage:
 *   router.post('/path', validateBody(mySchema), handler);
 *
 * On validation failure the middleware calls next() with an AppError(400)
 * containing a human-readable list of issues — the centralized error
 * handler formats the response.
 */
export function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.issues
        .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
        .join('; ');
      next(new AppError('Request validation failed.', 400, { details }));
      return;
    }
    req.body = result.data; // replace with parsed/coerced values
    next();
  };
}
