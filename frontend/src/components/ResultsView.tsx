"use client";

import { useCallback, useState } from "react";
import type { ExtractionResponse, CrmRecord } from "@/lib/types";
import { SkippedRowCard } from "./SkippedRowCard";

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  GOOD_LEAD_FOLLOW_UP: { bg: "bg-success/10", text: "text-success" },
  SALE_DONE: { bg: "bg-primary/10", text: "text-primary" },
  DID_NOT_CONNECT: { bg: "bg-warning/10", text: "text-warning" },
  BAD_LEAD: { bg: "bg-danger/10", text: "text-danger" },
};

const STATUS_LABELS: Record<string, string> = {
  GOOD_LEAD_FOLLOW_UP: "Good Lead",
  SALE_DONE: "Sale Done",
  DID_NOT_CONNECT: "Did Not Connect",
  BAD_LEAD: "Bad Lead",
};

function StatusBadge({ status }: { status: string }) {
  if (!status) return <span className="text-text2 text-label">—</span>;
  const style = STATUS_STYLES[status] || { bg: "bg-bg", text: "text-text2" };
  const label = STATUS_LABELS[status] || status;
  return (
    <span className={`inline-block text-label px-2 py-0.5 rounded-md ${style.bg} ${style.text}`}>
      {label}
    </span>
  );
}

// ── CRM table columns ───────────────────────────────────────────────────────

const CRM_DISPLAY_HEADERS = [
  "name",
  "email",
  "mobile_without_country_code",
  "company",
  "city",
  "country",
  "crm_status",
  "data_source",
  "crm_note",
];

const CRM_HEADER_LABELS: Record<string, string> = {
  name: "Name",
  email: "Email",
  mobile_without_country_code: "Phone",
  company: "Company",
  city: "City",
  country: "Country",
  crm_status: "Status",
  data_source: "Source",
  crm_note: "CRM Note",
};

function crmRecordToRow(record: CrmRecord): Record<string, string> {
  const row: Record<string, string> = {};
  for (const key of CRM_DISPLAY_HEADERS) {
    row[CRM_HEADER_LABELS[key]] = record[key as keyof CrmRecord] || "";
  }
  return row;
}

// ── CSV Download ─────────────────────────────────────────────────────────────

function downloadCsv(records: CrmRecord[], filename: string) {
  const allKeys = Object.keys(records[0] || {}) as (keyof CrmRecord)[];
  const header = allKeys.join(",");
  const rows = records.map((r) =>
    allKeys.map((k) => `"${String(r[k] ?? "").replace(/"/g, '""')}"`).join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Tab type ─────────────────────────────────────────────────────────────────

type ResultTab = "imported" | "skipped" | "failed";

// ── Component ────────────────────────────────────────────────────────────────

interface ResultsViewProps {
  result: ExtractionResponse;
  onStartOver: () => void;
}

export function ResultsView({ result, onStartOver }: ResultsViewProps) {
  const [activeTab, setActiveTab] = useState<ResultTab>("imported");

  const tableHeaders = CRM_DISPLAY_HEADERS.map((k) => CRM_HEADER_LABELS[k]);
  const tableRows = result.parsed.map(crmRecordToRow);

  const handleDownload = useCallback(() => {
    downloadCsv(result.parsed, "crm_import_results.csv");
  }, [result.parsed]);

  const totalFailed = result.totalFailed ?? 0;
  const failedRows = result.failed ?? [];

  return (
    <section>
      {/* ── Summary stats ──────────────────────────────────── */}
      <div className={`grid grid-cols-1 gap-3 sm:gap-4 mb-6 ${totalFailed > 0 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        <StatCard label="Total Rows" value={result.totalRows} variant="neutral" />
        <StatCard label="Imported" value={result.totalImported} variant="success" />
        <StatCard
          label="Skipped"
          value={result.totalSkipped}
          variant={result.totalSkipped > 0 ? "warning" : "neutral"}
        />
        {totalFailed > 0 && (
          <StatCard label="Failed" value={totalFailed} variant="danger" />
        )}
      </div>

      {/* ── Tab bar ────────────────────────────────────────── */}
      <div className="flex items-center gap-0 border-b border-border mb-5" role="tablist">
        <TabButton
          active={activeTab === "imported"}
          onClick={() => setActiveTab("imported")}
          label={`Imported (${result.totalImported})`}
          id="tab-imported"
          controls="panel-imported"
        />
        <TabButton
          active={activeTab === "skipped"}
          onClick={() => setActiveTab("skipped")}
          label={`Skipped (${result.totalSkipped})`}
          id="tab-skipped"
          controls="panel-skipped"
        />
        {totalFailed > 0 && (
          <TabButton
            active={activeTab === "failed"}
            onClick={() => setActiveTab("failed")}
            label={`Failed (${totalFailed})`}
            id="tab-failed"
            controls="panel-failed"
          />
        )}
      </div>

      {/* ── Imported tab ───────────────────────────────────── */}
      {activeTab === "imported" && (
        <div id="panel-imported" role="tabpanel" aria-labelledby="tab-imported">
          {result.totalImported === 0 ? (
            <EmptyState message="No records were imported." />
          ) : (
            <CrmTable records={result.parsed} headers={tableHeaders} rows={tableRows} />
          )}
        </div>
      )}

      {/* ── Skipped tab ────────────────────────────────────── */}
      {activeTab === "skipped" && (
        <div id="panel-skipped" role="tabpanel" aria-labelledby="tab-skipped">
          {result.totalSkipped === 0 ? (
            <EmptyState message="Every row was imported successfully — nothing was skipped." />
          ) : (
            <div className="bg-surface border border-border rounded-lg p-4 sm:p-5 space-y-1">
              {result.skipped.map((s, i) => (
                <SkippedRowCard key={i} rowIndex={i + 1} row={s.row} reason={s.reason} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Failed tab ─────────────────────────────────────── */}
      {activeTab === "failed" && (
        <div id="panel-failed" role="tabpanel" aria-labelledby="tab-failed">
          {totalFailed === 0 ? (
            <EmptyState message="No rows failed during extraction." />
          ) : (
            <div className="space-y-3">
              <div className="border border-danger/20 rounded-lg p-4 bg-danger/[0.03]" role="alert">
                <p className="text-sm text-text2">
                  {totalFailed} row{totalFailed !== 1 ? "s" : ""} could not be processed due to
                  infrastructure errors (rate limits, timeouts, or parsing failures).
                  These are not invalid rows — they simply couldn&apos;t be sent to the AI.
                  Re-importing the file will retry them.
                </p>
              </div>
              <div className="bg-surface border border-border rounded-lg p-4 sm:p-5 space-y-1">
                {failedRows.map((f, i) => (
                  <SkippedRowCard key={i} rowIndex={i + 1} row={f.row} reason={f.reason} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Action bar ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mt-6 pt-6 border-t border-border">
        <button
          onClick={onStartOver}
          className="text-sm text-text2 hover:text-text1 border border-border rounded-md px-4 py-2.5 transition-colors"
        >
          Start Over
        </button>
        {result.totalImported > 0 && (
          <button
            onClick={handleDownload}
            className="text-sm font-medium text-white bg-primary hover:bg-primary-hover transition-colors rounded-md px-4 py-2.5 flex items-center gap-2"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download CSV
          </button>
        )}
      </div>
    </section>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: "neutral" | "success" | "warning" | "danger";
}) {
  const valueColor =
    variant === "success"
      ? "text-success"
      : variant === "warning"
        ? "text-warning"
        : variant === "danger"
          ? "text-danger"
          : "text-text1";

  return (
    <div className="bg-surface border border-border rounded-lg px-4 sm:px-5 py-3 sm:py-4">
      <p className="text-label text-text2 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-semibold font-mono tabular-nums mt-1 ${valueColor}`}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  id,
  controls,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  id: string;
  controls: string;
}) {
  return (
    <button
      role="tab"
      id={id}
      aria-selected={active}
      aria-controls={controls}
      onClick={onClick}
      className={`
        px-4 py-2.5 text-sm font-medium transition-colors relative
        ${active ? "text-text1" : "text-text2 hover:text-text1"}
      `}
    >
      {label}
      {active && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
      )}
    </button>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="border border-border rounded-lg p-8 sm:p-10 text-center">
      <p className="text-sm text-text2">{message}</p>
    </div>
  );
}

function CrmTable({
  records,
  headers,
  rows,
}: {
  records: CrmRecord[];
  headers: string[];
  rows: Record<string, string>[];
}) {
  const statusIdx = headers.indexOf("Status");

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="overflow-auto max-h-[420px]">
        <table className="w-full text-sm border-collapse min-w-[600px]">
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
            {records.map((record, i) => (
              <tr key={i} className="hover:bg-bg/60 transition-colors">
                {headers.map((h, colIdx) => (
                  <td
                    key={h}
                    className="px-4 py-2.5 whitespace-nowrap text-text1 max-w-[280px] truncate"
                    title={rows[i]?.[h] ?? ""}
                  >
                    {colIdx === statusIdx ? (
                      <StatusBadge status={record.crm_status} />
                    ) : (
                      rows[i]?.[h] ?? ""
                    )}
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
