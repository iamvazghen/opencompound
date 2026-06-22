"use client";

import { createContext, useCallback, useContext, useState } from "react";

type Kind = "pending" | "success" | "error";
type Toast = { id: number; kind: Kind; msg: string; href?: string };

type Ctx = {
  push: (t: Omit<Toast, "id">) => number;
  update: (id: number, patch: Partial<Omit<Toast, "id">>) => void;
  dismiss: (id: number) => void;
};

const ToastCtx = createContext<Ctx | null>(null);

export function useToast(): Ctx {
  const c = useContext(ToastCtx);
  if (!c) throw new Error("useToast must be used within <ToastProvider>");
  return c;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const autoDismiss = useCallback((id: number, kind: Kind) => {
    if (kind !== "pending") setTimeout(() => dismiss(id), 7000);
  }, [dismiss]);

  const push = useCallback<Ctx["push"]>((t) => {
    const id = Date.now() + Math.random();
    setToasts((p) => [...p, { ...t, id }]);
    autoDismiss(id, t.kind);
    return id;
  }, [autoDismiss]);

  const update = useCallback<Ctx["update"]>((id, patch) => {
    setToasts((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    if (patch.kind) autoDismiss(id, patch.kind);
  }, [autoDismiss]);

  return (
    <ToastCtx.Provider value={{ push, update, dismiss }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex w-[min(92vw,22rem)] flex-col gap-2" role="status" aria-live="polite">
        {toasts.map((t) => (
          <Card key={t.id} t={t} onClose={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

function Card({ t, onClose }: { t: Toast; onClose: () => void }) {
  const tone =
    t.kind === "success" ? "var(--color-positive)" : t.kind === "error" ? "var(--color-danger)" : "var(--color-accent)";
  const icon = t.kind === "success" ? "✓" : t.kind === "error" ? "⚠" : "○";
  return (
    <div
      className="surface flex items-start gap-3 rounded-xl p-3 text-sm shadow-lg"
      style={{ borderColor: `color-mix(in oklch, ${tone} 45%, transparent)` }}
    >
      <span aria-hidden style={{ color: tone }} className={t.kind === "pending" ? "animate-pulse" : ""}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="break-words text-[var(--color-ink)]">{t.msg}</p>
        {t.href && (
          <a href={t.href} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--color-accent)] hover:underline">
            View transaction ↗
          </a>
        )}
      </div>
      <button onClick={onClose} aria-label="Dismiss" className="text-[var(--color-ink-3)] hover:text-[var(--color-ink)]">×</button>
    </div>
  );
}
