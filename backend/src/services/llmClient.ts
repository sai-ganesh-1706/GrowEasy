import { AppError } from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';
import {
  CrmRecord,
  IndexedRow,
  LlmBatchResponseSchema,
  ProcessedRow,
  SchemaContext,
} from '../types/crmSchema';
import {
  CRM_EXTRACTION_SYSTEM_PROMPT,
  buildUserPrompt,
  buildRetryPrompt,
} from '../prompts/crmExtractionPrompt';

// ─── Provider Abstraction ────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Low-level LLM provider interface.
 *
 * Each provider (Groq, OpenAI, Anthropic, Gemini) implements this once.
 * All higher-level extraction logic is provider-agnostic.
 */
export interface ILlmProvider {
  chatCompletion(messages: ChatMessage[]): Promise<string>;
}

// ─── Rate Limit Error (carries Retry-After) ─────────────────────────────────

export class RateLimitError extends AppError {
  public readonly retryAfterMs?: number;

  constructor(message: string, retryAfterMs?: number, details?: string) {
    super(message, 429, { details });
    this.retryAfterMs = retryAfterMs;
  }
}

// ─── Groq Provider ──────────────────────────────────────────────────────────

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const GROQ_DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const REQUEST_TIMEOUT_MS = 60_000; // 60 s per batch

class GroqProvider implements ILlmProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.model = model || GROQ_DEFAULT_MODEL;
  }

  async chatCompletion(messages: ChatMessage[]): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: 0,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        this.throwApiError(res.status, body, res.headers);
      }

      const data = (await res.json()) as {
        choices: { message: { content: string } }[];
      };

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new AppError('LLM returned an empty response.', 502);
      }
      return content;
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;

      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new AppError(
          'LLM API request timed out. Try a smaller batch size.',
          504,
        );
      }

      const msg = err instanceof Error ? err.message : String(err);
      throw new AppError(`Failed to connect to LLM API: ${msg}`, 502);
    } finally {
      clearTimeout(timeout);
    }
  }

  private throwApiError(status: number, body: string, headers: Headers): never {
    let detail = '';
    try {
      const parsed = JSON.parse(body);
      detail = parsed?.error?.message || body;
    } catch {
      detail = body;
    }

    if (status === 429) {
      // Extract Retry-After header (seconds)
      const retryAfterHeader = headers.get('retry-after');
      let retryAfterMs: number | undefined;
      if (retryAfterHeader) {
        const seconds = parseFloat(retryAfterHeader);
        if (!isNaN(seconds) && seconds > 0) {
          retryAfterMs = Math.ceil(seconds * 1000);
        }
      }
      throw new RateLimitError(
        'LLM API rate limit exceeded. Please retry later.',
        retryAfterMs,
        detail,
      );
    }

    switch (status) {
      case 401:
        throw new AppError(
          'LLM API authentication failed. Check your LLM_API_KEY.',
          401,
          { details: detail },
        );
      default:
        throw new AppError(
          `LLM API error (HTTP ${status}).`,
          status >= 500 ? 502 : status,
          { details: detail },
        );
    }
  }
}

// ─── Provider Factory ────────────────────────────────────────────────────────

let cachedProvider: ILlmProvider | null = null;

/**
 * Return the configured LLM provider (singleton, lazily created).
 * Currently supports `groq`. Add new cases here for OpenAI / Gemini / Claude.
 */
export function getLlmProvider(): ILlmProvider {
  if (cachedProvider) return cachedProvider;

  const providerName = config.LLM_PROVIDER;
  const apiKey = config.LLM_API_KEY;

  if (!apiKey) {
    throw new AppError(
      'LLM_API_KEY is not configured. Set it in your .env file.',
      500,
    );
  }

  switch (providerName) {
    case 'groq':
      cachedProvider = new GroqProvider(apiKey);
      break;
    default:
      throw new AppError(
        `Unsupported LLM_PROVIDER "${providerName}". Supported: groq.`,
        500,
      );
  }

  return cachedProvider;
}

/** Reset provider (for testing) */
export function resetLlmProvider(): void {
  cachedProvider = null;
}

// ─── Response Parsing ────────────────────────────────────────────────────────

/**
 * Defensively parse and validate the raw LLM output.
 *
 * Handles:
 *  - Markdown code fences wrapping the JSON
 *  - Invalid JSON
 *  - Schema violations (Zod validation)
 */
function parseAndValidateResponse(raw: string): ProcessedRow[] {
  // 1. Strip code fences if the model wrapped the JSON
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '');
  cleaned = cleaned.replace(/\n?\s*```\s*$/i, '');
  cleaned = cleaned.trim();

  // 2. Parse JSON
  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Invalid JSON from LLM: ${msg}`);
  }

  // 3. Validate against Zod schema
  const result = LlmBatchResponseSchema.safeParse(json);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Schema validation failed: ${issues}`);
  }

  return result.data.processedRows;
}

// ─── Row Identity Validation ─────────────────────────────────────────────────

/**
 * Validate that the LLM response accounts for every input row exactly once.
 * Throws descriptive errors if:
 *  - Wrong number of rows returned
 *  - Missing row IDs
 *  - Duplicate row IDs
 *  - Unknown row IDs
 */
function validateRowIdentity(
  inputRows: IndexedRow[],
  processedRows: ProcessedRow[],
): void {
  const expectedIds = new Set(inputRows.map((r) => r.rowId));
  const returnedIds = processedRows.map((r) => r.rowId);

  // Count check
  if (processedRows.length !== inputRows.length) {
    throw new Error(
      `Row count mismatch: sent ${inputRows.length} rows, got ${processedRows.length} back. ` +
        `LLM must return exactly one result per input row.`,
    );
  }

  // Duplicate check
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const id of returnedIds) {
    if (seen.has(id)) duplicates.push(id);
    seen.add(id);
  }
  if (duplicates.length > 0) {
    throw new Error(`Duplicate rowIds in response: ${duplicates.join(', ')}`);
  }

  // Missing check
  const missing = [...expectedIds].filter((id) => !seen.has(id));
  if (missing.length > 0) {
    throw new Error(`Missing rowIds in response: ${missing.join(', ')}`);
  }

  // Unknown check
  const unknown = returnedIds.filter((id) => !expectedIds.has(id));
  if (unknown.length > 0) {
    throw new Error(`Unknown rowIds in response: ${unknown.join(', ')}`);
  }
}

// ─── Batch Row Preparation ───────────────────────────────────────────────────

/**
 * Convert IndexedRows into the flat objects sent to the LLM.
 * Each row gets a `rowId` key alongside its CSV column data.
 */
function prepareBatchPayload(
  rows: IndexedRow[],
): { rowId: string; [key: string]: string }[] {
  return rows.map((r) => ({ rowId: r.rowId, ...r.data }));
}

// ─── Public Extraction Interface ─────────────────────────────────────────────

export interface ExtractBatchResult {
  processedRows: ProcessedRow[];
}

/**
 * Send a batch of indexed CSV rows to the LLM and receive validated results.
 *
 * This is the main interface consumed by extractionService. It:
 *  1. Builds the prompt (system + user) with rowId-tagged rows
 *  2. Calls the LLM provider
 *  3. Parses and validates the response with Zod
 *  4. Validates row identity (count, duplicates, missing, unknown)
 *  5. On parse/validation failure, retries ONCE with a stricter follow-up prompt
 *  6. If the retry also fails, throws so the caller can handle it
 *
 * API-level errors (network, auth, rate limit) propagate immediately.
 */
export async function extractBatch(
  rows: IndexedRow[],
  schemaContext: SchemaContext,
): Promise<ExtractBatchResult> {
  const provider = getLlmProvider();
  const payload = prepareBatchPayload(rows);

  const messages: ChatMessage[] = [
    { role: 'system', content: CRM_EXTRACTION_SYSTEM_PROMPT },
    {
      role: 'user',
      content: buildUserPrompt(
        schemaContext.headers,
        schemaContext.sampleRows,
        payload,
      ),
    },
  ];

  // ── First attempt ─────────────────────────────────────────────────────
  let firstResponse: string;
  try {
    firstResponse = await provider.chatCompletion(messages);
  } catch (err) {
    // LLM API-level failure (network, auth, rate limit) — propagate
    throw err;
  }

  try {
    const processedRows = parseAndValidateResponse(firstResponse);
    validateRowIdentity(rows, processedRows);
    return { processedRows };
  } catch (parseError) {
    // First parse/validation failed — retry once
    const errorMsg =
      parseError instanceof Error ? parseError.message : String(parseError);

    logger.warn('LLM response validation failed, retrying', {
      error: errorMsg,
      rowCount: rows.length,
    });

    // ── Retry with correction context ─────────────────────────────────
    const retryMessages: ChatMessage[] = [
      ...messages,
      { role: 'assistant', content: firstResponse },
      { role: 'user', content: buildRetryPrompt(errorMsg, payload) },
    ];

    try {
      const retryResponse = await provider.chatCompletion(retryMessages);
      const processedRows = parseAndValidateResponse(retryResponse);
      validateRowIdentity(rows, processedRows);
      return { processedRows };
    } catch (retryErr) {
      // Both attempts failed — throw so extractionService can classify as failed
      const msg = retryErr instanceof Error ? retryErr.message : String(retryErr);
      logger.error('LLM retry validation also failed', {
        rowCount: rows.length,
        error: msg,
      });
      throw new AppError(
        `LLM extraction failed after retry: ${msg}`,
        502,
      );
    }
  }
}
