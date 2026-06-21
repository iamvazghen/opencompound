import Link from "next/link";

// N5 — floating pill nav. Sits above the atmospheric background, blurred surface.
export function Nav({ connect = false }: { connect?: boolean }) {
  return (
    <header className="sticky top-0 z-50 px-4 pt-4">
      <div className="surface mx-auto flex max-w-5xl items-center justify-between rounded-full px-5 py-2.5">
        <Link href="/" className="flex items-center gap-2 text-[15px] font-medium tracking-tight">
          <span aria-hidden className="text-[var(--color-accent)]">◇</span>
          <span>OpenCompound</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <NavLink href="/strategies">Strategies</NavLink>
          <NavLink href="/docs">Docs</NavLink>
          {connect ? (
            <div className="ml-2">
              <appkit-button />
            </div>
          ) : (
            <Link
              href="/app"
              className="ml-2 rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-[var(--color-paper)] transition-colors duration-[var(--dur-fast)] hover:bg-[var(--color-accent-2)]"
            >
              Launch app
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-full px-3 py-1.5 text-[var(--color-ink-2)] transition-colors duration-[var(--dur-fast)] hover:bg-[var(--color-paper-3)] hover:text-[var(--color-ink)]"
    >
      {children}
    </Link>
  );
}
