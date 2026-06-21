import Link from "next/link";

export function Nav({ connect = false }: { connect?: boolean }) {
  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
      <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
        <span className="text-emerald-400">◇</span> OpenCompound
      </Link>
      <nav className="flex items-center gap-6 text-sm text-neutral-300">
        <Link href="/strategies" className="hover:text-white">Strategies</Link>
        <Link href="/app" className="hover:text-white">Dashboard</Link>
        <Link href="/docs" className="hover:text-white">Docs</Link>
        {connect ? (
          // Reown AppKit web component — renders the connect/account button.
          <appkit-button />
        ) : (
          <Link
            href="/app"
            className="rounded bg-emerald-500 px-3 py-1.5 font-medium text-neutral-950 hover:bg-emerald-400"
          >
            Launch App
          </Link>
        )}
      </nav>
    </header>
  );
}
