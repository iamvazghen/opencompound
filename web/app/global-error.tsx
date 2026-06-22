"use client";

// Last-resort boundary for errors thrown in the root layout itself. Must render its own <html>/<body>.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: "#0e0d0b", color: "#e9e4da", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 28 }}>OpenCompound hit a fatal error</h1>
          <p style={{ opacity: 0.7, fontSize: 14 }}>{error.message || "Please reload the page."}</p>
          <button
            onClick={reset}
            style={{ borderRadius: 999, background: "#d1a35a", color: "#0e0d0b", border: "none", padding: "8px 20px", fontSize: 14, cursor: "pointer" }}
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
