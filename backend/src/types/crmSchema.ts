import { z } from 'zod';

// ─── Enums ───────────────────────────────────────────────────────────────────

export const CRM_STATUSES = [
  'GOOD_LEAD_FOLLOW_UP',
  'DID_NOT_CONNECT',
  'BAD_LEAD',
  'SALE_DONE',
  '',
] as const;

export const DATA_SOURCES = [
  'leads_on_demand',
  'meridian_tower',
  'eden_park',
  'varah_swamy',
  'sarjapur_plots',
  '',
] as const;

// ─── CRM Record Schema (15 core fields) ─────────────────────────────────────

export const CrmRecordSchema = z.object({
  created_at: z.string(),
  name: z.string(),
  email: z.string(),
  country_code: z.string(),
  mobile_without_country_code: z.string(),
  company: z.string(),
  city: z.string(),
  state: z.string(),
  country: z.string(),
  lead_owner: z.string(),
  crm_status: z.enum(CRM_STATUSES),
  crm_note: z.string(),
  data_source: z.enum(DATA_SOURCES),
  possession_time: z.string(),
  description: z.string(),
});

export type CrmRecord = z.infer<typeof CrmRecordSchema>;

// ─── LLM Response Schema (new: rowId-tracked) ───────────────────────────────

/**
 * Each row in the LLM response MUST include:
 * - rowId: echoed back from the input
 * - status: "imported" or "skipped"
 * - contact: full CRM record (only when status=imported)
 * - reason: why skipped (only when status=skipped)
 */
export const ProcessedRowSchema = z.discriminatedUnion('status', [
  z.object({
    rowId: z.string(),
    status: z.literal('imported'),
    contact: CrmRecordSchema,
  }),
  z.object({
    rowId: z.string(),
    status: z.literal('skipped'),
    reason: z.string(),
  }),
]);

export type ProcessedRow = z.infer<typeof ProcessedRowSchema>;

export const LlmBatchResponseSchema = z.object({
  processedRows: z.array(ProcessedRowSchema),
});

export type LlmBatchResponse = z.infer<typeof LlmBatchResponseSchema>;

// ─── Indexed Row (internal: row with tracking ID) ────────────────────────────

export interface IndexedRow {
  rowId: string;
  data: Record<string, string>;
}

// ─── Skipped Row ─────────────────────────────────────────────────────────────

export interface SkippedRow {
  row: Record<string, string>;
  reason: string;
}

// ─── Failed Row (infrastructure failure, not a content issue) ────────────────

export interface FailedRow {
  row: Record<string, string>;
  reason: string;
}

// ─── Batch Result (internal aggregation per batch) ───────────────────────────

export interface BatchResult {
  parsed: CrmRecord[];
  skipped: SkippedRow[];
  failed: FailedRow[];
}

// ─── Full Extraction Response (aggregated across all batches) ────────────────

export interface ExtractionResponse {
  totalRows: number;
  totalImported: number;
  totalSkipped: number;
  totalFailed: number;
  parsed: CrmRecord[];
  skipped: SkippedRow[];
  failed: FailedRow[];
}

// ─── Schema Context (passed to LLM for per-upload context) ───────────────────

export interface SchemaContext {
  headers: string[];
  sampleRows: Record<string, string>[];
}

// ─── Legacy compatibility: re-export old schemas for existing tests ──────────

export const SkippedRowSchema = z.object({
  row: z.record(z.string(), z.any()),
  reason: z.string(),
});

/** @deprecated Use LlmBatchResponseSchema for new code */
export const BatchResultSchema = z.object({
  parsed: z.array(CrmRecordSchema).default([]),
  skipped: z.array(SkippedRowSchema).default([]),
});

