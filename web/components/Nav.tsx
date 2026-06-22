import Link from "next/link";

// N5 — floating pill nav. Sits above the atmospheric background, blurred surface.
export function Nav({ connect = false }: { connect?: boolean }) {
  return (
    <header className="sticky top-0 z-50 px-4 pt-4">
      <div className="surface mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-3xl px-4 py-2.5 sm:rounded-full sm:px-5">
        <Link href="/" aria-label="OpenCompound home" className="flex items-center gap-2 text-[15px] font-medium tracking-tight">
          <span aria-hidden className="text-[var(--color-accent)]">◇</span>
          <span>OpenCompound</span>
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-1 text-sm">
          <NavLink href="/strategies">Strategies</NavLink>
          <NavLink href="/docs">Docs</NavLink>
          {connect ? (
            <div className="ml-2 flex items-center gap-2">
              {/* Reown network switcher — pick / switch testnet chain */}
              <appkit-network-button />
              {/* balance hidden: its USD-price fetch hits Reown's API which 400s on testnets */}
              <appkit-button balance="hide" />
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
