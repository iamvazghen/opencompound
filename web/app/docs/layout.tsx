import Link from "next/link";
import { Nav } from "@/components/Nav";

const pages = [
  ["/docs", "Overview"],
  ["/docs/leverage-math", "Leverage math"],
  ["/docs/self-repay", "Self-repay mechanics"],
  ["/docs/risks", "Risks & liquidation"],
  ["/docs/contract", "Contract reference"],
  ["/docs/faq", "FAQ"],
];

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <div className="mx-auto flex w-full max-w-5xl flex-1 gap-10 px-6 py-10">
        <aside className="hidden w-48 shrink-0 sm:block">
          <nav className="sticky top-24 space-y-1 text-sm">
            {pages.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className="block rounded-lg px-3 py-1.5 text-[var(--color-ink-3)] transition-colors duration-[var(--dur-fast)] hover:bg-[var(--color-paper-2)] hover:text-[var(--color-ink)]"
              >
                {label}
              </Link>
            ))}
          </nav>
        </aside>
        <article className="min-w-0 flex-1 space-y-4 text-[var(--color-ink-2)] [&_h1]:text-[var(--color-ink)] [&_h2]:text-[var(--color-ink)] [&_code]:text-[var(--color-accent)]">
          {children}
        </article>
      </div>
    </>
  );
}
