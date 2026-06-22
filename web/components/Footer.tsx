import Link from "next/link";

// Site-wide statement footer (mounted once in the root layout). Carries the standing disclaimer
// and the legal links so every page surfaces them.
export function Footer() {
  return (
    <footer className="mx-auto mt-10 w-full max-w-5xl px-6 pb-12">
      <div className="surface rounded-2xl p-8">
        <p className="max-w-2xl font-display text-2xl leading-snug text-[var(--color-ink)]">
          Educational / portfolio project. Not audited. Testnet only. Leveraged positions can be
          liquidated. Not financial advice.
        </p>
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[var(--color-ink-3)]">
          <Link href="/strategies" className="hover:text-[var(--color-ink)]">Strategies</Link>
          <Link href="/docs" className="hover:text-[var(--color-ink)]">Docs</Link>
          <Link href="/app" className="hover:text-[var(--color-ink)]">Dashboard</Link>
          <Link href="/deployment" className="hover:text-[var(--color-ink)]">Deployment</Link>
          <Link href="/risk" className="hover:text-[var(--color-ink)]">Risk disclosure</Link>
          <Link href="/terms" className="hover:text-[var(--color-ink)]">Terms</Link>
          <a
            href="https://github.com/iamvazghen/opencompound"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--color-ink)]"
          >
            GitHub ↗
          </a>
        </div>
      </div>
    </footer>
  );
}
