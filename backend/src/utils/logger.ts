type LogLevel = 'info' | 'warn' | 'error';

interface LogPayload {
  level: LogLevel;
  message: string;
  timestamp: string;
  correlationId?: string;
  [key: string]: unknown;
}

function emit(level: LogLevel, payload: LogPayload): void {
  const line = JSON.stringify(payload);
  switch (level) {
    case 'error':
      console.error(line);
      break;
    case 'warn':
      console.warn(line);
      break;
    default:
      console.info(line);
  }
}

function buildPayload(
  level: LogLevel,
  message: string,
  data?: Record<string, unknown>,
  correlationId?: string,
): LogPayload {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(correlationId ? { correlationId } : {}),
    ...(data ?? {}),
  };
}

/**
 * Lightweight structured logger.
 *
 * Outputs one JSON line per log entry so it is easy to parse with log
 * aggregators (ELK, Datadog, CloudWatch, etc.) while remaining readable
 * during local development.
 *
 * Every method accepts an optional `correlationId` (typically the uploadId
 * or requestId) so related log lines can be traced across the request lifecycle.
 */
export const logger = {
  info(message: string, data?: Record<string, unknown>, correlationId?: string): void {
    emit('info', buildPayload('info', message, data, correlationId));
  },

  warn(message: string, data?: Record<string, unknown>, correlationId?: string): void {
    emit('warn', buildPayload('warn', message, data, correlationId));
  },

  error(message: string, data?: Record<string, unknown>, correlationId?: string): void {
    emit('error', buildPayload('error', message, data, correlationId));
  },
};
