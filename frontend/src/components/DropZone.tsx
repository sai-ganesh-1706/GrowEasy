"use client";

import { useCallback, useRef, useState, type DragEvent, type KeyboardEvent } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

type DropZoneState = "empty" | "drag-hover" | "selected" | "uploading" | "error";

interface DropZoneProps {
  onFileAccepted: (file: File) => void;
  isUploading: boolean;
  error: string | null;
  onClearError: () => void;
}

const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".csv"];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function validateFile(file: File): string | null {
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return `Invalid file type "${ext}". Only .csv files are accepted.`;
  }
  if (file.size > MAX_SIZE_BYTES) {
    return `File is ${formatBytes(file.size)}. Maximum allowed size is 5 MB.`;
  }
  if (file.size === 0) {
    return "File is empty. Please select a CSV file with data.";
  }
  return null;
}

// ── Component ────────────────────────────────────────────────────────────────

export function DropZone({
  onFileAccepted,
  isUploading,
  error,
  onClearError,
}: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const state: DropZoneState = (() => {
    if (isUploading) return "uploading";
    if (error || validationError) return "error";
    if (dragOver) return "drag-hover";
    if (selectedFile) return "selected";
    return "empty";
  })();

  const handleFile = useCallback(
    (file: File) => {
      onClearError();
      setValidationError(null);
      const err = validateFile(file);
      if (err) {
        setValidationError(err);
        setSelectedFile(null);
        return;
      }
      setSelectedFile(file);
      onFileAccepted(file);
    },
    [onFileAccepted, onClearError]
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const openFilePicker = useCallback(() => {
    if (!isUploading) inputRef.current?.click();
  }, [isUploading]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openFilePicker();
      }
    },
    [openFilePicker]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      if (inputRef.current) inputRef.current.value = "";
    },
    [handleFile]
  );

  const handleRemoveFile = useCallback(() => {
    setSelectedFile(null);
    setValidationError(null);
    onClearError();
  }, [onClearError]);

  const displayError = error || validationError;

  return (
    <div className="w-full max-w-lg mx-auto">
      {/* ── Drop area ───────────────────────────────────────── */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload CSV file"
        aria-disabled={isUploading}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={openFilePicker}
        onKeyDown={handleKeyDown}
        className={`
          relative rounded-lg border-2 border-dashed transition-all cursor-pointer
          flex flex-col items-center justify-center gap-3 px-6 py-10
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary
          ${state === "drag-hover" ? "border-primary bg-primary/5" : ""}
          ${state === "empty" ? "border-border hover:border-text2/40 bg-surface" : ""}
          ${state === "selected" || state === "uploading" ? "border-border bg-surface" : ""}
          ${state === "error" ? "border-danger/40 bg-danger/[0.03]" : ""}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          aria-label="Choose CSV file"
          onChange={handleInputChange}
          className="hidden"
          disabled={isUploading}
        />

        {/* ── Empty / drag-hover state ──────────────────────── */}
        {!selectedFile && !isUploading && (
          <>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`${state === "drag-hover" ? "text-primary" : "text-text2"} transition-colors`}
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <div className="text-center">
              <p className="text-sm text-text1 font-medium">
                {state === "drag-hover"
                  ? "Drop your CSV file"
                  : "Drop CSV file here or click to browse"}
              </p>
              <p className="text-label text-text2 mt-1">.csv up to 5 MB</p>
            </div>
          </>
        )}

        {/* ── Selected / uploading state ────────────────────── */}
        {selectedFile && (
          <div className="flex items-center gap-3 w-full">
            <div className="w-9 h-9 rounded-md bg-bg border border-border flex items-center justify-center shrink-0">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-text2"
                aria-hidden="true"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-text1 font-medium truncate">
                {selectedFile.name}
              </p>
              <p className="text-label text-text2">
                {formatBytes(selectedFile.size)}
              </p>
            </div>
            {isUploading ? (
              <div
                className="w-5 h-5 border-2 border-border border-t-primary rounded-full animate-spin shrink-0"
                role="status"
                aria-label="Uploading file"
              />
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveFile();
                }}
                className="text-text2 hover:text-danger transition-colors shrink-0 p-1.5 rounded-md"
                aria-label="Remove selected file"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Error message ───────────────────────────────────── */}
      {displayError && (
        <p className="mt-2 text-sm text-danger" role="alert">
          {displayError}
        </p>
      )}

      {/* ── Help text ───────────────────────────────────────── */}
      {!displayError && !selectedFile && (
        <div className="mt-4 space-y-1">
          <p className="text-label text-text2">File requirements:</p>
          <ul className="text-label text-text2 list-disc list-inside space-y-0.5">
            <li>CSV format with headers in the first row</li>
            <li>Maximum file size: 5 MB</li>
            <li>At least one data row below the header</li>
          </ul>
        </div>
      )}
    </div>
  );
}
