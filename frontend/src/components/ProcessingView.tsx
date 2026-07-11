"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { extractCrmData, ApiError } from "@/lib/api";
import type { ExtractionResponse } from "@/lib/types";

const STAGED_MESSAGES = [
  "Analyzing CSV structure…",
  "Mapping fields to CRM schema…",
  "Extracting contact information…",
  "Validating email and phone data…",
  "Resolving CRM statuses…",
  "Aggregating batch results…",
  "Finalizing import…",
];

interface ProcessingViewProps {
  uploadId: string;
  totalRows: number;
  onComplete: (result: ExtractionResponse) => void;
  onError: (error: string) => void;
}

export function ProcessingView({
  uploadId,
  totalRows,
  onComplete,
  onError,
}: ProcessingViewProps) {
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState(STAGED_MESSAGES[0]);
  const [failed, setFailed] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isRetrying, setIsRetrying] = useState(false);
  const abortRef = useRef(false);
  const hasStartedRef = useRef(false);

  const runExtraction = useCallback(async () => {
    abortRef.current = false;
    setFailed(false);
    setErrorMessage("");
    setProgress(0);
    setStatusMessage(STAGED_MESSAGES[0]);

    let msgIndex = 0;
    const interval = setInterval(() => {
      if (abortRef.current) {
        clearInterval(interval);
        return;
      }
      msgIndex = Math.min(msgIndex + 1, STAGED_MESSAGES.length - 1);
      setStatusMessage(STAGED_MESSAGES[msgIndex]);
      setProgress(Math.min(((msgIndex + 1) / STAGED_MESSAGES.length) * 85, 85));
    }, 2200);

    try {
      const result = await extractCrmData(uploadId);
      clearInterval(interval);
      abortRef.current = true;
      setProgress(100);
      setStatusMessage("Complete");
      setTimeout(() => onComplete(result), 400);
    } catch (err) {
      clearInterval(interval);
      abortRef.current = true;

      const msg =
        err instanceof ApiError
          ? err.message
          : "The AI extraction service is unavailable. Check your network connection and try again.";
      setFailed(true);
      setErrorMessage(msg);
      onError(msg);
    }
  }, [uploadId, onComplete, onError]);

  // Guard against React Strict Mode double-invocation in development.
  // Without this, the effect fires twice ~200ms apart, causing two API calls.
  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    runExtraction();
    return () => {
      abortRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRetry = useCallback(async () => {
    setIsRetrying(true);
    await runExtraction();
    setIsRetrying(false);
  }, [runExtraction]);

  return (
    <section className="mt-8 sm:mt-16 max-w-md mx-auto px-4 sm:px-0">
      <div className="text-center mb-8">
        <h2 className="text-xl font-semibold text-text1">
          {failed ? "Import failed" : "Processing your data"}
        </h2>
        <p className="text-sm text-text2 mt-1">
          {failed
            ? "The extraction could not be completed."
            : `Importing ${totalRows.toLocaleString()} row${totalRows !== 1 ? "s" : ""} using AI`}
        </p>
      </div>

      {!failed && (
        <div className="space-y-3">
          <div
            className="w-full h-1 bg-border rounded-full overflow-hidden"
            role="progressbar"
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Import progress: ${Math.round(progress)}%`}
          >
            <div
              className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-label">
            <span className="text-text2" aria-live="polite">{statusMessage}</span>
            <span className="text-text2 font-mono tabular-nums">
              {Math.round(progress)}%
            </span>
          </div>
        </div>
      )}

      {failed && (
        <div className="border border-danger/20 rounded-lg p-5 bg-danger/[0.03]" role="alert">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text1 mb-1">
              Extraction failed
            </p>
            <p className="text-sm text-text2 break-words">{errorMessage}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-danger/10">
            <button
              onClick={handleRetry}
              disabled={isRetrying}
              className="text-sm font-medium text-white bg-primary hover:bg-primary-hover disabled:opacity-50 transition-colors rounded-md px-4 py-2.5"
            >
              {isRetrying ? "Retrying…" : "Retry Import"}
            </button>
            <p className="text-label text-text2">
              Uses the same uploaded file — no re-upload needed.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
