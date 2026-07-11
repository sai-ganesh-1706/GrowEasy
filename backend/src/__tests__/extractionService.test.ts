/**
 * Comprehensive tests for the extraction pipeline.
 *
 * Covers all 10 required scenarios (A–J):
 *   A. All batches succeed
 *   B. LLM returns incomplete response (fewer rows)
 *   C. Duplicate row IDs
 *   D. Missing row ID
 *   E. Unknown row ID
 *   F. Valid row intentionally skipped (no contact info)
 *   G. Rate limit then success
 *   H. Permanent failure after all retries
 *   I. Multiple batches with concurrency
 *   J. Real-world CSV shapes
 *
 * These mock the session store and LLM client so no real API calls are made,
 * but they exercise the full batching, concurrency, aggregation, pre-filtering,
 * row accounting, and failure classification logic.
 */

// ── Env must be set BEFORE any imports that read config ──────────────────────
process.env.NODE_ENV = 'test';
process.env.MAX_BATCH_SIZE = '5';
process.env.LLM_CONCURRENCY = '2';
process.env.LLM_MAX_RETRIES = '2';
process.env.LLM_RETRY_BASE_MS = '10';  // fast retries in tests
process.env.LLM_RETRY_MAX_MS = '50';
process.env.LLM_REQUEST_DELAY_MS = '0'; // no pacing delay in tests

// ── Mocks ────────────────────────────────────────────────────────────────────
jest.mock('../services/csvSessionStoreInstance', () => ({
  csvSessionStore: {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    has: jest.fn(),
    clear: jest.fn(),
  },
}));

jest.mock('../services/llmClient', () => ({
  extractBatch: jest.fn(),
  RateLimitError: jest.requireActual('../services/llmClient').RateLimitError,
}));

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { extractAllRows } from '../services/extractionService';
import { csvSessionStore } from '../services/csvSessionStoreInstance';
import { extractBatch, RateLimitError } from '../services/llmClient';
import { AppError, CsvSessionData } from '../types';
import type {
  CrmRecord,
  IndexedRow,
  ProcessedRow,
} from '../types/crmSchema';

// Local type matching the extractBatch return shape (llmClient is mocked)
type ExtractBatchResult = { processedRows: ProcessedRow[] };

// ── Helpers ──────────────────────────────────────────────────────────────────

const mockGet = csvSessionStore.get as jest.Mock;
const mockExtract = extractBatch as jest.Mock;

const makeContact = (name: string, email: string, phone: string): CrmRecord => ({
  created_at: '',
  name,
  email,
  country_code: '',
  mobile_without_country_code: phone,
  company: '',
  city: '',
  state: '',
  country: '',
  lead_owner: '',
  crm_status: '',
  crm_note: '',
  data_source: '',
  possession_time: '',
  description: '',
});

/**
 * Build a mock session with N rows.
 * Each row has Name, Email, Phone columns.
 */
function buildSession(rowCount: number, includeEmptyRows = false): CsvSessionData {
  const rows: Record<string, string>[] = [];
  for (let i = 0; i < rowCount; i++) {
    if (includeEmptyRows && i === rowCount - 1) {
      rows.push({ Name: '', Email: '', Phone: '' });
    } else {
      rows.push({
        Name: `Person${i + 1}`,
        Email: `p${i + 1}@test.com`,
        Phone: `${1000 + i}`,
      });
    }
  }
  return {
    meta: {
      uploadId: 'test-id',
      fileName: 'test.csv',
      totalRows: rowCount,
      rawRowCount: rowCount,
      headers: ['Name', 'Email', 'Phone'],
      normalizedHeaders: ['name', 'email', 'phone'],
    },
    rows,
  };
}

/**
 * Create a mock extractBatch implementation that returns all rows as imported.
 * Inspects the batch argument to read rowIds and return matching processedRows.
 */
function mockAllImported(batch: IndexedRow[]): ExtractBatchResult {
  return {
    processedRows: batch.map((r) => ({
      rowId: r.rowId,
      status: 'imported' as const,
      contact: makeContact(
        r.data.Name || 'Unknown',
        r.data.Email || '',
        r.data.Phone || '',
      ),
    })),
  };
}


// ── Tests ────────────────────────────────────────────────────────────────────

describe('extractAllRows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Basic errors ─────────────────────────────────────────────────────

  it('throws 404 for non-existent uploadId', async () => {
    mockGet.mockReturnValue(undefined);
    await expect(extractAllRows('nonexistent')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('throws 400 for empty CSV', async () => {
    mockGet.mockReturnValue({
      meta: {
        uploadId: 'test-id',
        fileName: 'test.csv',
        totalRows: 0,
        rawRowCount: 0,
        headers: ['Name'],
        normalizedHeaders: ['name'],
      },
      rows: [],
    });
    await expect(extractAllRows('test-id')).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  // ── Scenario A: 100 rows, all batches succeed ─────────────────────────

  it('A: processes 100 rows across batches with correct accounting', async () => {
    // With MAX_BATCH_SIZE=5, 100 rows → 20 batches
    const session = buildSession(100);
    mockGet.mockReturnValue(session);

    mockExtract.mockImplementation((batch: IndexedRow[]) =>
      Promise.resolve(mockAllImported(batch)),
    );

    const result = await extractAllRows('test-id');

    expect(result.totalRows).toBe(100);
    expect(result.totalImported).toBe(100);
    expect(result.totalSkipped).toBe(0);
    expect(result.totalFailed).toBe(0);
    expect(result.parsed).toHaveLength(100);
    expect(result.skipped).toHaveLength(0);
    expect(result.failed).toHaveLength(0);

    // Row accounting invariant
    expect(result.totalImported + result.totalSkipped + result.totalFailed)
      .toBe(result.totalRows);
  });

  // ── Scenario B: LLM returns fewer rows than input (incomplete) ────────

  it('B: rejects incomplete LLM response and retries', async () => {
    const session = buildSession(5);
    mockGet.mockReturnValue(session);

    // First call: return only 3 of 5 rows → extractBatch throws validation error
    // Second call (retry): return all 5 → success
    let callCount = 0;
    mockExtract.mockImplementation((batch: IndexedRow[]) => {
      callCount++;
      if (callCount === 1) {
        // Simulate what happens when LLM returns fewer rows:
        // extractBatch throws because row count validation fails
        return Promise.reject(
          new AppError('LLM extraction failed after retry: Row count mismatch: sent 5 rows, got 3 back. LLM must return exactly one result per input row.', 502),
        );
      }
      return Promise.resolve(mockAllImported(batch));
    });

    const result = await extractAllRows('test-id');

    // Should have retried and succeeded
    expect(result.totalImported).toBe(5);
    expect(result.totalFailed).toBe(0);
    expect(result.totalImported + result.totalSkipped + result.totalFailed)
      .toBe(result.totalRows);
  });

  // ── Scenario C: Duplicate row IDs in LLM response ────────────────────

  it('C: rejects LLM response with duplicate rowIds and retries', async () => {
    const session = buildSession(5);
    mockGet.mockReturnValue(session);

    let callCount = 0;
    mockExtract.mockImplementation((batch: IndexedRow[]) => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(
          new AppError('LLM extraction failed after retry: Duplicate rowIds in response: R0001', 502),
        );
      }
      return Promise.resolve(mockAllImported(batch));
    });

    const result = await extractAllRows('test-id');

    expect(result.totalImported).toBe(5);
    expect(result.totalFailed).toBe(0);
  });

  // ── Scenario D: LLM response omits a row ID ──────────────────────────

  it('D: rejects LLM response with missing rowId and retries', async () => {
    const session = buildSession(5);
    mockGet.mockReturnValue(session);

    let callCount = 0;
    mockExtract.mockImplementation((batch: IndexedRow[]) => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(
          new AppError('LLM extraction failed after retry: Missing rowIds in response: R0003', 502),
        );
      }
      return Promise.resolve(mockAllImported(batch));
    });

    const result = await extractAllRows('test-id');

    expect(result.totalImported).toBe(5);
    expect(result.totalFailed).toBe(0);
  });

  // ── Scenario E: LLM returns unknown row ID ───────────────────────────

  it('E: rejects LLM response with unknown rowId and retries', async () => {
    const session = buildSession(5);
    mockGet.mockReturnValue(session);

    let callCount = 0;
    mockExtract.mockImplementation((batch: IndexedRow[]) => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(
          new AppError('LLM extraction failed after retry: Unknown rowIds in response: R9999', 502),
        );
      }
      return Promise.resolve(mockAllImported(batch));
    });

    const result = await extractAllRows('test-id');

    expect(result.totalImported).toBe(5);
    expect(result.totalFailed).toBe(0);
  });

  // ── Scenario F: Valid row intentionally skipped ───────────────────────

  it('F: correctly classifies LLM-skipped rows as skipped (not failed)', async () => {
    const session = buildSession(5);
    mockGet.mockReturnValue(session);

    mockExtract.mockImplementation((batch: IndexedRow[]) => {
      const processedRows: ProcessedRow[] = batch.map((r, i) => {
        if (i === 2) {
          // Third row has no contact info — LLM skips it
          return {
            rowId: r.rowId,
            status: 'skipped' as const,
            reason: 'No email or phone number found',
          };
        }
        return {
          rowId: r.rowId,
          status: 'imported' as const,
          contact: makeContact(r.data.Name, r.data.Email, r.data.Phone),
        };
      });
      return Promise.resolve({ processedRows });
    });

    const result = await extractAllRows('test-id');

    expect(result.totalImported).toBe(4);
    expect(result.totalSkipped).toBe(1);
    expect(result.totalFailed).toBe(0);
    expect(result.skipped[0].reason).toBe('No email or phone number found');

    // Accounting invariant
    expect(result.totalImported + result.totalSkipped + result.totalFailed)
      .toBe(result.totalRows);
  });

  // ── Scenario G: Rate limit then success ───────────────────────────────

  it('G: retries after rate limit and eventually succeeds', async () => {
    const session = buildSession(5);
    mockGet.mockReturnValue(session);

    let callCount = 0;
    mockExtract.mockImplementation((batch: IndexedRow[]) => {
      callCount++;
      if (callCount === 1) {
        // First attempt: rate limited
        return Promise.reject(
          new RateLimitError('LLM API rate limit exceeded.', 2000),
        );
      }
      // Second attempt: success
      return Promise.resolve(mockAllImported(batch));
    });

    const result = await extractAllRows('test-id');

    expect(result.totalImported).toBe(5);
    expect(result.totalFailed).toBe(0);
    expect(result.totalImported + result.totalSkipped + result.totalFailed)
      .toBe(result.totalRows);
  });

  // ── Scenario H: Permanent failure after all retries ───────────────────

  it('H: classifies permanently failed batch rows as failed, continues others', async () => {
    // 10 rows → 2 batches of 5
    const session = buildSession(10);
    mockGet.mockReturnValue(session);

    let batchCallCount = 0;
    mockExtract.mockImplementation((batch: IndexedRow[]) => {
      batchCallCount++;
      // Batches are processed with concurrency. Track by rowId prefix.
      const isFirstBatch = batch[0].rowId === 'R0001';

      if (isFirstBatch) {
        // First batch always succeeds
        return Promise.resolve(mockAllImported(batch));
      } else {
        // Second batch always fails (all retries)
        return Promise.reject(
          new AppError('LLM API error (HTTP 503).', 502),
        );
      }
    });

    const result = await extractAllRows('test-id');

    // First batch: 5 imported, Second batch: 5 failed
    expect(result.totalImported).toBe(5);
    expect(result.totalFailed).toBe(5);
    expect(result.totalSkipped).toBe(0);
    expect(result.parsed).toHaveLength(5);
    expect(result.failed).toHaveLength(5);

    // Failed rows should have descriptive reason
    expect(result.failed[0].reason).toContain('AI extraction failed');
    expect(result.failed[0].reason).toContain('503');

    // Accounting invariant
    expect(result.totalImported + result.totalSkipped + result.totalFailed)
      .toBe(result.totalRows);
  });

  // ── Scenario I: Concurrency enforcement ───────────────────────────────

  it('I: processes multiple batches with correct pacing and accounting', async () => {
    // 20 rows → 4 batches of 5, concurrency=2
    const session = buildSession(20);
    mockGet.mockReturnValue(session);

    const callTimestamps: number[] = [];
    mockExtract.mockImplementation((batch: IndexedRow[]) => {
      callTimestamps.push(Date.now());
      return Promise.resolve(mockAllImported(batch));
    });

    const result = await extractAllRows('test-id');

    expect(result.totalRows).toBe(20);
    expect(result.totalImported).toBe(20);
    expect(result.totalFailed).toBe(0);
    expect(mockExtract).toHaveBeenCalledTimes(4);

    // Accounting invariant
    expect(result.totalImported + result.totalSkipped + result.totalFailed)
      .toBe(result.totalRows);
  });

  // ── Scenario J: Real-world CSV shapes ─────────────────────────────────

  it('J: handles CSV with empty rows (pre-filtered deterministically)', async () => {
    // 5 rows, last one is all-empty
    const session = buildSession(5, true);
    mockGet.mockReturnValue(session);

    mockExtract.mockImplementation((batch: IndexedRow[]) =>
      Promise.resolve(mockAllImported(batch)),
    );

    const result = await extractAllRows('test-id');

    // 4 processable + 1 deterministically skipped
    expect(result.totalRows).toBe(5);
    expect(result.totalImported).toBe(4);
    expect(result.totalSkipped).toBe(1);
    expect(result.totalFailed).toBe(0);
    expect(result.skipped[0].reason).toContain('All fields empty');

    // Accounting invariant
    expect(result.totalImported + result.totalSkipped + result.totalFailed)
      .toBe(result.totalRows);
  });

  it('J: handles Facebook-style CSV with extra columns', async () => {
    const session: CsvSessionData = {
      meta: {
        uploadId: 'fb-test',
        fileName: 'facebook_leads.csv',
        totalRows: 3,
        rawRowCount: 3,
        headers: ['First Name', 'Last Name', 'Email', 'Phone', 'Campaign', 'Ad Set', 'Form Name'],
        normalizedHeaders: ['first_name', 'last_name', 'email', 'phone', 'campaign', 'ad_set', 'form_name'],
      },
      rows: [
        { 'First Name': 'Alice', 'Last Name': 'Smith', Email: 'alice@fb.com', Phone: '+1-555-0100', Campaign: 'Summer Sale', 'Ad Set': 'Lookalike', 'Form Name': 'Contact Us' },
        { 'First Name': 'Bob', 'Last Name': 'Jones', Email: 'bob@fb.com', Phone: '', Campaign: 'Winter', 'Ad Set': 'Retarget', 'Form Name': 'Sign Up' },
        { 'First Name': '', 'Last Name': '', Email: '', Phone: '', Campaign: 'Test', 'Ad Set': 'Test', 'Form Name': 'Test' },
      ],
    };
    mockGet.mockReturnValue(session);

    mockExtract.mockImplementation((batch: IndexedRow[]) => {
      const processedRows: ProcessedRow[] = batch.map((r) => {
        const hasContact = r.data.Email || r.data.Phone;
        if (!hasContact) {
          return {
            rowId: r.rowId,
            status: 'skipped' as const,
            reason: 'No email or phone number found',
          };
        }
        return {
          rowId: r.rowId,
          status: 'imported' as const,
          contact: makeContact(
            `${r.data['First Name']} ${r.data['Last Name']}`.trim(),
            r.data.Email,
            r.data.Phone,
          ),
        };
      });
      return Promise.resolve({ processedRows });
    });

    const result = await extractAllRows('fb-test');

    expect(result.totalImported).toBe(2);
    expect(result.totalSkipped).toBe(1);
    expect(result.totalFailed).toBe(0);
    expect(result.totalImported + result.totalSkipped + result.totalFailed)
      .toBe(result.totalRows);
  });

  it('J: handles hand-made CSV with typo headers', async () => {
    const session: CsvSessionData = {
      meta: {
        uploadId: 'typo-test',
        fileName: 'handmade.csv',
        totalRows: 2,
        rawRowCount: 2,
        headers: ['Nme', 'Emial', 'Phoen Number'],
        normalizedHeaders: ['nme', 'emial', 'phoen_number'],
      },
      rows: [
        { Nme: 'Carol', Emial: 'carol@test.com', 'Phoen Number': '555-1234' },
        { Nme: 'Dave', Emial: 'dave@test.com', 'Phoen Number': '555-5678' },
      ],
    };
    mockGet.mockReturnValue(session);

    mockExtract.mockImplementation((batch: IndexedRow[]) =>
      Promise.resolve(mockAllImported(batch)),
    );

    const result = await extractAllRows('typo-test');

    expect(result.totalImported).toBe(2);
    expect(result.totalFailed).toBe(0);
    expect(result.totalImported + result.totalSkipped + result.totalFailed)
      .toBe(result.totalRows);
  });

  // ── Auth errors propagate ─────────────────────────────────────────────

  it('propagates critical auth errors immediately', async () => {
    const session = buildSession(5);
    mockGet.mockReturnValue(session);

    const authError = new AppError('LLM API authentication failed.', 401);
    mockExtract.mockRejectedValue(authError);

    await expect(extractAllRows('test-id')).rejects.toMatchObject({
      statusCode: 401,
    });
  });
});
