import { AppError } from '../types';
import { config } from '../config';
import { csvSessionStore } from './csvSessionStoreInstance';
import { extractBatch, RateLimitError } from './llmClient';
import { RequestScheduler } from './requestScheduler';
import { logger } from '../utils/logger';
import {
  BatchResult,
  CrmRecord,
  ExtractionResponse,
  FailedRow,
  IndexedRow,
  SchemaContext,
  SkippedRow,
} from '../types/crmSchema';

// ─── Constants (from config) ────────────────────────────────────────────────

const SAMPLE_ROW_COUNT = 5; // rows shown to LLM as format context

// ─── Concurrency Utility ────────────────────────────────────────────────────

/**
 * Run an array of async tasks with bounded concurrency.
 *
 * Creates `limit` workers that each pull the next available task from a
 * shared index counter — this preserves result ordering while keeping
 * exactly `limit` tasks in flight at any time.
 */
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < tasks.length) {
      const i = nextIndex++;
      results[i] = await tasks[i]();
    }
  }

  const workerCount = Math.min(limit, tasks.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

// ─── Batch Splitting ────────────────────────────────────────────────────────

function splitIntoBatches<T>(items: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

// ─── Row Indexing ───────────────────────────────────────────────────────────

function assignRowIds(rows: Record<string, string>[]): IndexedRow[] {
  return rows.map((data, i) => ({
    rowId: `R${String(i + 1).padStart(4, '0')}`,
    data,
  }));
}

// ─── Deterministic Pre-filtering ────────────────────────────────────────────

interface PreFilterResult {
  processable: IndexedRow[];
  deterministicallySkipped: SkippedRow[];
}

/**
 * Filter out rows that can be skipped without calling the LLM:
 * - Rows where ALL values are empty/whitespace-only
 */
function preFilterRows(indexedRows: IndexedRow[]): PreFilterResult {
  const processable: IndexedRow[] = [];
  const deterministicallySkipped: SkippedRow[] = [];

  for (const row of indexedRows) {
    const allEmpty = Object.values(row.data).every(
      (v) => v === undefined || v === null || v.trim() === '',
    );

    if (allEmpty) {
      deterministicallySkipped.push({
        row: row.data,
        reason: 'All fields empty — skipped without AI processing',
      });
    } else {
      processable.push(row);
    }
  }

  return { processable, deterministicallySkipped };
}

// ─── Retry Delay Calculation ────────────────────────────────────────────────

/**
 * Exponential backoff with jitter, respecting provider Retry-After.
 *
 * delay = min(baseDelay * 2^attempt + randomJitter, maxDelay)
 *
 * If the provider returned a Retry-After value, use that instead.
 */
function computeRetryDelay(
  attempt: number,
  providerRetryAfterMs?: number,
): number {
  if (providerRetryAfterMs && providerRetryAfterMs > 0) {
    // Add small jitter even to provider-specified delays
    return providerRetryAfterMs + Math.floor(Math.random() * 500);
  }

  const baseDelay = config.LLM_RETRY_BASE_MS;
  const maxDelay = config.LLM_RETRY_MAX_MS;
  const jitter = Math.floor(Math.random() * 500);
  return Math.min(baseDelay * Math.pow(2, attempt) + jitter, maxDelay);
}

// ─── Main Extraction Pipeline ───────────────────────────────────────────────

/**
 * Full extraction pipeline:
 *
 *  1. Retrieve parsed CSV rows from the session store by uploadId
 *  2. Assign row IDs and pre-filter obviously empty rows
 *  3. Split processable rows into batches (size from config.MAX_BATCH_SIZE)
 *  4. Build a SchemaContext from the CSV headers + first N sample rows
 *  5. Run batches through the LLM with pacing & bounded concurrency
 *  6. Classify results: imported, skipped (intentional), failed (infrastructure)
 *  7. Enforce row accounting invariant
 *  8. Aggregate all batch results into a single ExtractionResponse
 */
export async function extractAllRows(
  uploadId: string,
): Promise<ExtractionResponse> {
  const startTime = Date.now();

  // ── 1. Retrieve session ──────────────────────────────────────────────
  const session = csvSessionStore.get(uploadId);
  if (!session) {
    throw new AppError(
      `Upload session "${uploadId}" not found or expired. Please re-upload the CSV.`,
      404,
    );
  }

  const { rows } = session;
  const { headers } = session.meta;

  if (rows.length === 0) {
    throw new AppError('No rows to extract — the CSV is empty.', 400);
  }

  // ── 2. Assign row IDs and pre-filter ─────────────────────────────────
  const indexedRows = assignRowIds(rows);
  const { processable, deterministicallySkipped } = preFilterRows(indexedRows);

  if (deterministicallySkipped.length > 0) {
    logger.info('Pre-filter: empty rows skipped deterministically', {
      count: deterministicallySkipped.length,
    }, uploadId);
  }

  // ── 3. Prepare context ───────────────────────────────────────────────
  const sampleRows = rows.slice(0, SAMPLE_ROW_COUNT);
  const schemaContext: SchemaContext = { headers, sampleRows };

  // ── 4. Split into batches ────────────────────────────────────────────
  const batchSize = config.MAX_BATCH_SIZE;
  const batches = splitIntoBatches(processable, batchSize);

  const maxRetries = config.LLM_MAX_RETRIES;
  const concurrency = config.LLM_CONCURRENCY;
  const scheduler = new RequestScheduler(config.LLM_REQUEST_DELAY_MS);

  logger.info('Extraction started', {
    totalRows: rows.length,
    processableRows: processable.length,
    preFilteredSkipped: deterministicallySkipped.length,
    batchCount: batches.length,
    batchSize,
    concurrency,
    maxRetries,
  }, uploadId);

  // ── 5. Build tasks with retry + pacing ─────────────────────────────
  let totalRetryCount = 0;
  let successfulBatchCount = 0;
  let failedBatchCount = 0;

  const tasks = batches.map(
    (batch, batchIndex) => async (): Promise<BatchResult> => {
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          // All requests (initial + retry) go through the scheduler
          await scheduler.acquire();

          if (attempt > 0) {
            totalRetryCount++;
            const providerRetryMs =
              lastError instanceof RateLimitError
                ? lastError.retryAfterMs
                : undefined;
            const delayMs = computeRetryDelay(attempt - 1, providerRetryMs);

            logger.info('Batch retry — waiting before attempt', {
              batchIndex: batchIndex + 1,
              attempt: attempt + 1,
              maxAttempts: maxRetries + 1,
              delayMs,
              usedProviderRetryAfter: !!providerRetryMs,
            }, uploadId);

            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }

          logger.info('Batch sent to LLM', {
            batchIndex: batchIndex + 1,
            batchTotal: batches.length,
            rowCount: batch.length,
            attempt: attempt + 1,
          }, uploadId);

          const result = await extractBatch(batch, schemaContext);

          // ── Classify LLM results ───────────────────────────────────
          const parsed: CrmRecord[] = [];
          const skipped: SkippedRow[] = [];

          for (const pr of result.processedRows) {
            if (pr.status === 'imported') {
              parsed.push(pr.contact);
            } else {
              // Find the original row data for this rowId
              const originalRow = batch.find((r) => r.rowId === pr.rowId);
              skipped.push({
                row: originalRow?.data ?? {},
                reason: pr.reason,
              });
            }
          }

          logger.info('Batch succeeded', {
            batchIndex: batchIndex + 1,
            imported: parsed.length,
            skipped: skipped.length,
            attempts: attempt + 1,
          }, uploadId);

          successfulBatchCount++;
          return { parsed, skipped, failed: [] };
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));

          // Critical auth/config errors — stop everything immediately
          if (err instanceof AppError && (err.statusCode === 401 || err.statusCode === 500)) {
            logger.error('Batch critical failure — aborting all batches', {
              batchIndex: batchIndex + 1,
              error: lastError.message,
              statusCode: err.statusCode,
            }, uploadId);
            throw err;
          }

          logger.warn('Batch attempt failed', {
            batchIndex: batchIndex + 1,
            attempt: attempt + 1,
            maxAttempts: maxRetries + 1,
            error: lastError.message,
            errorType: err instanceof RateLimitError ? 'rate_limit' : 'other',
            willRetry: attempt < maxRetries,
          }, uploadId);
        }
      }

      // All retries exhausted — mark batch rows as FAILED (not skipped)
      failedBatchCount++;
      const msg = lastError?.message ?? 'Unknown error';
      logger.error('Batch failed after all retries', {
        batchIndex: batchIndex + 1,
        totalAttempts: maxRetries + 1,
        error: msg,
        rowCount: batch.length,
      }, uploadId);

      return {
        parsed: [],
        skipped: [],
        failed: batch.map((row) => ({
          row: row.data,
          reason: `AI extraction failed after ${maxRetries + 1} attempts: ${msg}`,
        })),
      };
    },
  );

  // ── 6. Execute with bounded concurrency ──────────────────────────────
  const batchResults = await runWithConcurrency(tasks, concurrency);

  // ── 7. Aggregate ─────────────────────────────────────────────────────
  const allParsed = batchResults.flatMap((r) => r.parsed);
  const allSkipped = [
    ...deterministicallySkipped,
    ...batchResults.flatMap((r) => r.skipped),
  ];
  const allFailed = batchResults.flatMap((r) => r.failed);

  const response: ExtractionResponse = {
    totalRows: rows.length,
    totalImported: allParsed.length,
    totalSkipped: allSkipped.length,
    totalFailed: allFailed.length,
    parsed: allParsed,
    skipped: allSkipped,
    failed: allFailed,
  };

  // ── 8. Row accounting invariant ──────────────────────────────────────
  const accounted = response.totalImported + response.totalSkipped + response.totalFailed;
  if (accounted !== response.totalRows) {
    logger.error('ROW ACCOUNTING INVARIANT VIOLATED', {
      totalRows: response.totalRows,
      totalImported: response.totalImported,
      totalSkipped: response.totalSkipped,
      totalFailed: response.totalFailed,
      accounted,
      delta: response.totalRows - accounted,
    }, uploadId);
  }

  // ── 9. Completion logging ────────────────────────────────────────────
  const durationMs = Date.now() - startTime;
  logger.info('Extraction complete', {
    totalRows: response.totalRows,
    totalImported: response.totalImported,
    totalSkipped: response.totalSkipped,
    totalFailed: response.totalFailed,
    batchCount: batches.length,
    successfulBatchCount,
    failedBatchCount,
    totalRetryCount,
    durationMs,
  }, uploadId);

  return response;
}
