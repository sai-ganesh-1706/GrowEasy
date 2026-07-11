"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

type ToastVariant = "error" | "success" | "info";

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  addToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

let nextId = 0;
const AUTO_DISMISS_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, variant: ToastVariant = "error") => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, message, variant }]);
      setTimeout(() => removeToast(id), AUTO_DISMISS_MS);
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}

      <div
        className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-[calc(100vw-2rem)] sm:w-[380px]"
        aria-live="assertive"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="alert"
            className={`
              flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg
              bg-surface text-sm animate-slide-in
              ${t.variant === "error" ? "border-danger/30 text-danger" : ""}
              ${t.variant === "success" ? "border-success/30 text-success" : ""}
              ${t.variant === "info" ? "border-border text-text1" : ""}
            `}
          >
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => removeToast(t.id)}
              className="text-text2 hover:text-text1 transition-colors shrink-0 text-lg leading-none p-1 rounded-md"
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <style jsx global>{`
        @keyframes slide-in {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        .animate-slide-in {
          animation: slide-in 0.2s ease-out;
        }
      `}</style>
    </ToastContext.Provider>
  );
}
