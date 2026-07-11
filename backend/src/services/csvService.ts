import Papa from 'papaparse';
import { AppError } from '../types';

/** Result of parsing a CSV buffer */
export interface CsvParseResult {
  /** Trimmed original headers as they appear in the CSV */
  headers: string[];
  /** Lowercased, whitespace-collapsed, underscore-separated versions */
  normalizedHeaders: string[];
  /** Parsed row objects keyed by trimmed original headers */
  rows: Record<string, string>[];
  /** Total lines in the CSV data section (before skipping empties) */
  rawRowCount: number;
}

/**
 * Parse a raw CSV buffer into structured data.
 *
 * Handles:
 * - Quoted fields with embedded commas and newlines
 * - Inconsistent header casing/spacing (trims + normalizes)
 * - Dynamic headers (no fixed column assumptions)
 */
export function parseCsvBuffer(buffer: Buffer): CsvParseResult {
  const csvString = buffer.toString('utf-8');

  if (!csvString.trim()) {
    throw new AppError('The uploaded CSV file is empty.', 400);
  }

  // ── Parse with PapaParse ───────────────────────────────────────────────
  const result = Papa.parse<Record<string, string>>(csvString, {
    header: true,
    skipEmptyLines: 'greedy', // skip lines that are empty or only whitespace
    transformHeader: (header: string) => header.trim(),
  });

  // ── Handle parse errors ────────────────────────────────────────────────
  // FieldMismatch = row has more/fewer fields than header (non-fatal)
  // Delimiter     = auto-detection warning on minimal/single-col files
  const NON_FATAL_TYPES = new Set(['FieldMismatch', 'Delimiter']);
  const fatalErrors = result.errors.filter((e) => !NON_FATAL_TYPES.has(e.type));

  if (fatalErrors.length > 0) {
    const details = fatalErrors
      .slice(0, 5) // show at most 5 errors
      .map((e) => `Row ${e.row ?? '?'}: [${e.type}] ${e.message}`)
      .join('; ');
    throw new AppError('CSV parsing failed.', 400, { details });
  }

  // ── Validate headers ──────────────────────────────────────────────────
  const headers = result.meta.fields ?? [];

  if (headers.length === 0) {
    throw new AppError('CSV contains no headers.', 400);
  }

  // ── Validate rows ─────────────────────────────────────────────────────
  const rows = result.data;

  if (rows.length === 0) {
    throw new AppError('CSV file has headers but contains no data rows.', 400);
  }

  // ── Normalize headers ─────────────────────────────────────────────────
  const normalizedHeaders = headers.map((h) =>
    h
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_') // collapse non-alphanumeric runs into _
      .replace(/^_|_$/g, ''), // strip leading/trailing _
  );

  // rawRowCount: total lines minus the header line
  // PapaParse doesn't directly expose this, so we count newlines in the
  // original string as an approximation.
  const rawRowCount = csvString
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0).length - 1; // subtract header

  return { headers, normalizedHeaders, rows, rawRowCount };
}
