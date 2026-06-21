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
          <nav className="sticky top-10 space-y-1 text-sm">
            {pages.map(([href, label]) => (
              <Link key={href} href={href}
                className="block rounded px-3 py-1.5 text-neutral-400 hover:bg-neutral-900 hover:text-white">
                {label}
              </Link>
            ))}
          </nav>
        </aside>
        <article className="prose-docs min-w-0 flex-1 space-y-4 text-neutral-300">{children}</article>
      </div>
    </>
  );
}
