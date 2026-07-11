"use client";

interface DataTableProps {
  headers: string[];
  rows: Record<string, string>[];
  maxHeight?: string;
}

/**
 * Reusable data table with sticky header, horizontal scroll,
 * and bounded vertical scroll.
 */
export function DataTable({
  headers,
  rows,
  maxHeight = "420px",
}: DataTableProps) {
  if (headers.length === 0) {
    return (
      <div className="border border-border rounded-lg p-8 text-center text-text2 text-sm">
        No columns to display.
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bg border-b border-border">
              {headers.map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="text-left text-label uppercase tracking-wider text-text2 px-4 py-2.5 whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        </table>
        <div className="px-4 py-8 text-center text-text2 text-sm">
          Headers detected but no data rows found.
        </div>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="overflow-auto" style={{ maxHeight }}>
        <table className="w-full text-sm border-collapse min-w-[480px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-bg border-b border-border">
              {headers.map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="text-left text-label uppercase tracking-wider text-text2 px-4 py-2.5 whitespace-nowrap bg-bg"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-surface divide-y divide-border">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-bg/60 transition-colors">
                {headers.map((h) => (
                  <td
                    key={h}
                    className="px-4 py-2.5 whitespace-nowrap text-text1 max-w-[280px] truncate"
                    title={row[h] ?? ""}
                  >
                    {row[h] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
