import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import multer from 'multer';
import { AppError } from '../types';
import { logger } from '../utils/logger';

/**
 * Centralized error-handling middleware.
 *
 * Catches all errors thrown/next()'d from route handlers and middleware,
 * maps them to appropriate HTTP responses, and logs unexpected failures.
 * This is the ONLY place error responses are formatted.
 */
export const errorHandler: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const correlationId = req.requestId;

  // ── Multer-specific errors (e.g. file too large) ─────────────────────
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      logger.warn('Upload rejected: file too large', { code: err.code }, correlationId);
      res.status(413).json({
        error: 'File too large. Maximum allowed size is 5 MB.',
      });
      return;
    }
    logger.warn('Upload rejected', { code: err.code, message: err.message }, correlationId);
    res.status(400).json({
      error: `Upload error: ${err.message}`,
    });
    return;
  }

  // ── Known operational errors ─────────────────────────────────────────
  if (err instanceof AppError || isAppError(err)) {
    const appErr = err as AppError;
    const body: Record<string, string> = { error: appErr.message };
    if (appErr.details) {
      body.details = appErr.details;
    }
    logger.warn('Operational error', {
      statusCode: appErr.statusCode,
      message: appErr.message,
    }, correlationId);
    res.status(appErr.statusCode).json(body);
    return;
  }

  // ── Unexpected / programmer errors ───────────────────────────────────
  logger.error('Unhandled error', {
    name: err.name,
    message: err.message,
    stack: err.stack,
  }, correlationId);
  res.status(500).json({
    error: 'An unexpected error occurred. Please try again later.',
  });
};

/** Duck-type check for AppError in case instanceof fails across module boundaries */
function isAppError(err: unknown): err is AppError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'statusCode' in err &&
    'isOperational' in err &&
    typeof (err as AppError).statusCode === 'number'
  );
}
