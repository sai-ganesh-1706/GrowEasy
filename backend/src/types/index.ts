// ─── Shared Types ────────────────────────────────────────────────────────────

/** Custom application error with HTTP status code */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: string;

  constructor(
    message: string,
    statusCode: number,
    options?: { isOperational?: boolean; details?: string },
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = options?.isOperational ?? true;
    this.details = options?.details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/** Metadata for a single CSV upload session */
export interface CsvUploadMeta {
  uploadId: string;
  fileName: string;
  totalRows: number;
  rawRowCount: number;
  headers: string[];
  normalizedHeaders: string[];
}

/** Full parsed CSV data stored in the session */
export interface CsvSessionData {
  meta: CsvUploadMeta;
  rows: Record<string, string>[];
}

/** Response returned to the client from POST /api/csv/upload */
export interface CsvUploadResponse extends CsvUploadMeta {
  preview: Record<string, string>[];
}

/** Generic interface for a session store — swap implementation for Redis later */
export interface ISessionStore<T> {
  set(key: string, value: T, ttlMs?: number): void;
  get(key: string): T | undefined;
  delete(key: string): boolean;
  has(key: string): boolean;
  clear(): void;
}
