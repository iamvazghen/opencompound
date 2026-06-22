"use client";

// Route-level error boundary. Catches render/runtime errors in any page and offers a recovery.
// (Hook a real error tracker — e.g. Sentry — into the useEffect once a DSN is configured.)
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="text-2xl text-[var(--color-accent)]">◇</span>
      <h1 className="text-[var(--text-display-s)]">Something went wrong</h1>
      <p className="text-sm text-[var(--color-ink-2)]">{error.message || "An unexpected error occurred."}</p>
      <button
        onClick={reset}
        className="rounded-full bg-[var(--color-accent)] px-5 py-2 text-sm font-medium text-[var(--color-paper)] hover:bg-[var(--color-accent-2)]"
      >
        Try again
      </button>
    </main>
  );
}
