"use client";

import { useCallback, useState } from "react";
import type { AppStep, UploadResponse, ExtractionResponse } from "@/lib/types";
import { uploadCsv, ApiError } from "@/lib/api";
import { StepIndicator } from "@/components/StepIndicator";
import { DropZone } from "@/components/DropZone";
import { DataTable } from "@/components/DataTable";
import { ProcessingView } from "@/components/ProcessingView";
import { ResultsView } from "@/components/ResultsView";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useToast } from "@/components/ToastProvider";
import { useTheme } from "@/components/ThemeProvider";

export default function ImportPage() {
  const { addToast } = useToast();
  const { theme, toggleTheme } = useTheme();

  const [step, setStep] = useState<AppStep>("upload");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadData, setUploadData] = useState<UploadResponse | null>(null);
  const [extractionResult, setExtractionResult] =
    useState<ExtractionResponse | null>(null);

  const handleFileAccepted = useCallback(
    async (file: File) => {
      setIsUploading(true);
      setUploadError(null);

      try {
        const data = await uploadCsv(file);
        setUploadData(data);
        setStep("preview");
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : "Upload failed — the server may be unreachable. Check your connection and try again.";
        setUploadError(message);
        addToast(message, "error");
      } finally {
        setIsUploading(false);
      }
    },
    [addToast]
  );

  const handleReUpload = useCallback(() => {
    setStep("upload");
    setUploadData(null);
    setUploadError(null);
    setExtractionResult(null);
  }, []);

  const handleConfirmImport = useCallback(() => {
    setStep("processing");
  }, []);

  const handleExtractionComplete = useCallback(
    (result: ExtractionResponse) => {
      setExtractionResult(result);
      setStep("result");
      addToast(
        `Import complete: ${result.totalImported} imported, ${result.totalSkipped} skipped.`,
        "success"
      );
    },
    [addToast]
  );

  const handleExtractionError = useCallback(
    (message: string) => {
      addToast(message, "error");
    },
    [addToast]
  );

  const handleStartOver = useCallback(() => {
    setStep("upload");
    setUploadData(null);
    setUploadError(null);
    setExtractionResult(null);
  }, []);

  return (
    <ErrorBoundary>
      <div className="min-h-screen flex flex-col">
        {/* ── Header ─────────────────────────────────────────── */}
        <header className="bg-surface border-b border-border px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
              <span className="text-white text-xs font-bold" aria-hidden="true">G</span>
            </div>
            <h1 className="text-sm font-semibold text-text1">
              GrowEasy Import
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <StepIndicator currentStep={step} />
            <button
              onClick={toggleTheme}
              className="p-2 rounded-md text-text2 hover:text-text1 hover:bg-bg transition-colors shrink-0"
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            >
              {theme === "light" ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              )}
            </button>
          </div>
        </header>

        {/* ── Content ────────────────────────────────────────── */}
        <main className="flex-1 px-4 sm:px-6 py-6 sm:py-8 max-w-5xl mx-auto w-full">
          {step === "upload" && (
            <section className="mt-8 sm:mt-12">
              <div className="text-center mb-8">
                <h2 className="text-xl font-semibold text-text1">
                  Import your CSV
                </h2>
                <p className="text-sm text-text2 mt-1">
                  Upload a CSV file and we&apos;ll map it to your CRM fields
                  using AI.
                </p>
              </div>
              <DropZone
                onFileAccepted={handleFileAccepted}
                isUploading={isUploading}
                error={uploadError}
                onClearError={() => setUploadError(null)}
              />
            </section>
          )}

          {step === "preview" && uploadData && (
            <section>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <span className="font-medium text-text1">
                    {uploadData.fileName}
                  </span>
                  <span className="text-text2">·</span>
                  <span className="text-text2">
                    {uploadData.totalRows} row{uploadData.totalRows !== 1 ? "s" : ""}
                  </span>
                  <span className="text-text2">·</span>
                  <span className="text-text2">
                    {uploadData.headers.length} column{uploadData.headers.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <button
                  onClick={handleReUpload}
                  className="text-sm text-text2 hover:text-text1 border border-border rounded-md px-3 py-2 transition-colors self-start sm:self-auto"
                >
                  Choose different file
                </button>
              </div>

              <DataTable headers={uploadData.headers} rows={uploadData.preview} />

              <p className="text-label text-text2 mt-3">
                {uploadData.preview.length < uploadData.totalRows
                  ? `Showing ${uploadData.preview.length} of ${uploadData.totalRows} rows`
                  : `Showing all ${uploadData.totalRows} rows`}
              </p>

              <div className="flex flex-wrap items-center justify-end gap-3 mt-6 pt-6 border-t border-border">
                <button
                  onClick={handleReUpload}
                  className="text-sm text-text2 hover:text-text1 transition-colors px-4 py-2.5"
                >
                  Re-upload
                </button>
                <button
                  onClick={handleConfirmImport}
                  className="text-sm font-medium text-white bg-primary hover:bg-primary-hover transition-colors rounded-md px-5 py-2.5"
                >
                  Confirm Import
                </button>
              </div>
            </section>
          )}

          {step === "processing" && uploadData && (
            <ProcessingView
              uploadId={uploadData.uploadId}
              totalRows={uploadData.totalRows}
              onComplete={handleExtractionComplete}
              onError={handleExtractionError}
            />
          )}

          {step === "result" && extractionResult && (
            <ResultsView result={extractionResult} onStartOver={handleStartOver} />
          )}
        </main>
      </div>
    </ErrorBoundary>
  );
}
