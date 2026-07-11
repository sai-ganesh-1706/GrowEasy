"use client";

import { useState, useCallback } from "react";

interface SkippedRowCardProps {
  rowIndex: number;
  row: Record<string, string>;
  reason: string;
}

export function SkippedRowCard({ rowIndex, row, reason }: SkippedRowCardProps) {
  const [expanded, setExpanded] = useState(false);

  const label =
    row["Name"] ||
    row["name"] ||
    row["Email"] ||
    row["email"] ||
    row["First Name"] ||
    Object.values(row).find((v) => v && v.length > 0) ||
    "Unknown";

  const toggle = useCallback(() => setExpanded((p) => !p), []);

  return (
    <div className="border-l-[3px] border-warning pl-4 py-3">
      <p className="text-sm font-medium text-text1">
        Row {rowIndex}
        <span className="text-text2 font-normal"> — &quot;{label}&quot;</span>
      </p>

      <p className="text-sm text-text2 mt-0.5">{reason}</p>

      <button
        onClick={toggle}
        aria-expanded={expanded}
        aria-label={`${expanded ? "Hide" : "Show"} original data for row ${rowIndex}`}
        className="mt-2 text-label text-text2 hover:text-text1 transition-colors flex items-center gap-1 py-1 rounded-md"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`transition-transform ${expanded ? "rotate-90" : ""}`}
          aria-hidden="true"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        Original data
      </button>

      {expanded && (
        <div className="mt-2 bg-bg rounded-md p-3 text-xs font-mono text-text2 space-y-0.5 border border-border">
          {Object.entries(row).map(([key, val]) => (
            <div key={key}>
              <span className="text-text1">{key}:</span>{" "}
              <span>{val || "(empty)"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
