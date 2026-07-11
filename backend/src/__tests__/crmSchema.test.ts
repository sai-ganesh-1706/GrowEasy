import { CrmRecordSchema, BatchResultSchema, SkippedRowSchema } from '../types/crmSchema';

const validRecord = {
  created_at: '2024-03-15',
  name: 'John Doe',
  email: 'john@example.com',
  country_code: '+1',
  mobile_without_country_code: '5551234567',
  company: 'Acme Corp',
  city: 'New York',
  state: 'NY',
  country: 'USA',
  lead_owner: 'Jane Smith',
  crm_status: 'SALE_DONE' as const,
  crm_note: '',
  data_source: 'eden_park' as const,
  possession_time: 'Q4 2024',
  description: 'Interested in premium plan',
};

describe('CrmRecordSchema', () => {
  it('accepts a valid CRM record with all fields', () => {
    const result = CrmRecordSchema.safeParse(validRecord);
    expect(result.success).toBe(true);
  });

  it('accepts empty crm_status and data_source', () => {
    const result = CrmRecordSchema.safeParse({
      ...validRecord,
      crm_status: '',
      data_source: '',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid crm_status', () => {
    const result = CrmRecordSchema.safeParse({
      ...validRecord,
      crm_status: 'INVALID_STATUS',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid data_source', () => {
    const result = CrmRecordSchema.safeParse({
      ...validRecord,
      data_source: 'unknown_source',
    });
    expect(result.success).toBe(false);
  });

  it('rejects record missing required fields', () => {
    const { email, ...incomplete } = validRecord;
    const result = CrmRecordSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });
});

describe('BatchResultSchema', () => {
  it('accepts valid BatchResult with parsed and skipped', () => {
    const result = BatchResultSchema.safeParse({
      parsed: [validRecord],
      skipped: [{ row: { name: 'test' }, reason: 'no phone' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts BatchResult with empty arrays', () => {
    const result = BatchResultSchema.safeParse({ parsed: [], skipped: [] });
    expect(result.success).toBe(true);
  });
});

describe('SkippedRowSchema', () => {
  it('accepts a valid skipped row', () => {
    const result = SkippedRowSchema.safeParse({
      row: { col: 'val' },
      reason: 'No email or phone number found',
    });
    expect(result.success).toBe(true);
  });

  it('rejects skipped row without reason', () => {
    const result = SkippedRowSchema.safeParse({ row: { col: 'val' } });
    expect(result.success).toBe(false);
  });
});
