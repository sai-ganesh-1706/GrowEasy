// ── Page state machine ───────────────────────────────────────────────────────

export type AppStep = "upload" | "preview" | "processing" | "result";

// ── API response types ──────────────────────────────────────────────────────

export interface UploadResponse {
  uploadId: string;
  fileName: string;
  totalRows: number;
  rawRowCount: number;
  headers: string[];
  normalizedHeaders: string[];
  preview: Record<string, string>[];
}

export interface CrmRecord {
  created_at: string;
  name: string;
  email: string;
  country_code: string;
  mobile_without_country_code: string;
  company: string;
  city: string;
  state: string;
  country: string;
  lead_owner: string;
  crm_status: string;
  crm_note: string;
  data_source: string;
  possession_time: string;
  description: string;
}

export interface SkippedRow {
  row: Record<string, string>;
  reason: string;
}

export interface FailedRow {
  row: Record<string, string>;
  reason: string;
}

export interface ExtractionResponse {
  totalRows: number;
  totalImported: number;
  totalSkipped: number;
  totalFailed: number;
  parsed: CrmRecord[];
  skipped: SkippedRow[];
  failed: FailedRow[];
}

// ── Error ────────────────────────────────────────────────────────────────────

export interface ApiErrorBody {
  error: string;
  details?: string;
}
