"use client";

import type { AppStep } from "@/lib/types";

const STEPS: { key: AppStep; label: string }[] = [
  { key: "upload", label: "Upload" },
  { key: "preview", label: "Preview" },
  { key: "processing", label: "Confirm" },
  { key: "result", label: "Result" },
];

const ORDER: Record<AppStep, number> = {
  upload: 0,
  preview: 1,
  processing: 2,
  result: 3,
};

interface StepIndicatorProps {
  currentStep: AppStep;
}

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  const currentIdx = ORDER[currentStep];

  return (
    <nav aria-label="Import progress" className="flex items-center gap-0">
      {STEPS.map((step, i) => {
        const isComplete = i < currentIdx;
        const isCurrent = i === currentIdx;
        const isProcessing = currentStep === "processing" && step.key === "processing";

        return (
          <div key={step.key} className="flex items-center">
            {i > 0 && (
              <div
                className={`w-4 sm:w-6 h-px mx-0.5 sm:mx-1 ${
                  isComplete || isCurrent ? "bg-primary" : "bg-border"
                }`}
              />
            )}
            <div className="flex items-center gap-1 sm:gap-1.5">
              <div
                className={`
                  w-2 h-2 rounded-full shrink-0 transition-colors
                  ${isComplete ? "bg-success" : ""}
                  ${isCurrent && !isProcessing ? "bg-primary" : ""}
                  ${isProcessing ? "bg-primary animate-pulse" : ""}
                  ${!isComplete && !isCurrent ? "bg-border" : ""}
                `}
              />
              <span
                className={`text-label whitespace-nowrap hidden sm:inline ${
                  isCurrent ? "text-text1" : "text-text2"
                }`}
                aria-current={isCurrent ? "step" : undefined}
              >
                {isComplete ? "✓ " : ""}
                {isProcessing ? "Processing…" : step.label}
              </span>
            </div>
          </div>
        );
      })}
    </nav>
  );
}
