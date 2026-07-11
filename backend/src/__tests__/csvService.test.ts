import { parseCsvBuffer } from '../services/csvService';

describe('parseCsvBuffer', () => {
  it('parses a valid CSV with multiple rows', () => {
    const csv = 'Name,Email,Phone\nAlice,alice@test.com,111\nBob,bob@test.com,222\n';
    const result = parseCsvBuffer(Buffer.from(csv));

    expect(result.headers).toEqual(['Name', 'Email', 'Phone']);
    expect(result.normalizedHeaders).toEqual(['name', 'email', 'phone']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({ Name: 'Alice', Email: 'alice@test.com', Phone: '111' });
    expect(result.rows[1]).toEqual({ Name: 'Bob', Email: 'bob@test.com', Phone: '222' });
    expect(result.rawRowCount).toBe(2);
  });

  it('handles quoted fields with embedded commas', () => {
    const csv = 'Name,Company\n"Smith, John","Acme, Inc"\n';
    const result = parseCsvBuffer(Buffer.from(csv));

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].Name).toBe('Smith, John');
    expect(result.rows[0].Company).toBe('Acme, Inc');
  });

  it('handles quoted fields with embedded newlines', () => {
    const csv = 'Name,Note\n"Alice","Line1\nLine2"\n';
    const result = parseCsvBuffer(Buffer.from(csv));

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].Note).toContain('Line1');
    expect(result.rows[0].Note).toContain('Line2');
  });

  it('trims whitespace from headers', () => {
    const csv = '  Name  ,  Email  \nAlice,a@b.com\n';
    const result = parseCsvBuffer(Buffer.from(csv));

    expect(result.headers).toEqual(['Name', 'Email']);
  });

  it('normalizes headers to lowercase with underscores', () => {
    const csv = 'First Name,Last Name,E-Mail\nA,B,c@d.com\n';
    const result = parseCsvBuffer(Buffer.from(csv));

    expect(result.normalizedHeaders).toEqual(['first_name', 'last_name', 'e_mail']);
  });

  it('throws on completely empty input', () => {
    expect(() => parseCsvBuffer(Buffer.from(''))).toThrow(/empty/i);
  });

  it('throws on headers-only CSV with no data rows', () => {
    expect(() => parseCsvBuffer(Buffer.from('Name,Email\n'))).toThrow(/no data rows/i);
  });

  it('handles rows with more fields than headers gracefully', () => {
    const csv = 'A,B\n1,2,3\n4,5\n';
    const result = parseCsvBuffer(Buffer.from(csv));
    expect(result.rows.length).toBeGreaterThanOrEqual(2);
  });
});
