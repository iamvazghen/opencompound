import type { Metadata } from "next";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Deployment & roadmap — OpenCompound",
  description: "Deployment status, what's production-ready, and the on-chain go-live checklist for OpenCompound.",
};

const done: string[] = [
  "ERC-4626 inflation / donation-attack hardening (virtual-shares offset)",
  "Proportional flash-unwind on withdraw — any depositor exits a leveraged vault in one tx",
  "Supply-cap / frozen / paused-aware deposit limits",
  "Dynamic, non-hardcoded guardrails (live liquidation threshold × buffer)",
  "Oracle / MEV guards (zero-feed revert, rebalance anti-spam deadband)",
  "Invariant suite (solvency, share-backing, LTV ceiling) + fuzz",
  "Live mainnet-fork tests for BOTH vaults (real Aave V3 + Uniswap)",
  "Deploy scripts (v1 + v2) with multisig-aware owner",
  "Frontend: RPC proxy (key off client), tx toasts, error boundaries, legal pages",
];

const todo: { label: string; who: string }[] = [
  { label: "Professional security audit + bug bounty", who: "external · blocker" },
  { label: "Owner → Safe multisig / timelock; decide immutable vs upgradeable", who: "you create the Safe" },
  { label: "Economic validation on live mainnet rates (confirm carry; reserve not isolation-mode)", who: "analysis" },
  { label: "Keeper automation for guard() / rebalance() (Gelato / Chainlink)", who: "needs a funded account" },
  { label: "Fork scenario depth: interest accrual over time, paused reserves, liquidations", who: "tests" },
  { label: "Error tracking (Sentry DSN); geoblocking if required", who: "config / policy" },
];

export default function DeploymentPage() {
  return (
    <>
      <Nav />
      <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-6 py-12">
        <header className="space-y-3">
          <p className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-paper-2)] px-3 py-1 text-xs text-[var(--color-ink-2)]">
            <span className="size-1.5 rounded-full bg-[var(--color-positive)]" /> Testnet build · not audited
          </p>
          <h1 className="text-[var(--text-display-s)] text-[var(--color-ink)]">Deployment &amp; roadmap</h1>
          <p className="text-[var(--color-ink-2)]">
            OpenCompound is a fully-functional <strong className="text-[var(--color-ink)]">testnet</strong> build,
            live on Base Sepolia &amp; Ethereum Sepolia. The contracts are <strong className="text-[var(--color-ink)]">not
            audited</strong> — these are the steps that must clear before any real-funds (mainnet) deployment.
            Full instructions are in <code className="text-[var(--color-accent)]">DEPLOYMENT.md</code> in the repo.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl text-[var(--color-ink)]">Production-ready ✓</h2>
          <ul className="space-y-2">
            {done.map((d) => (
              <li key={d} className="flex gap-3 text-sm text-[var(--color-ink-2)]">
                <span aria-hidden className="text-[var(--color-positive)]">✓</span>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl text-[var(--color-ink)]">Before mainnet funds</h2>
          <ul className="space-y-2">
            {todo.map((t) => (
              <li key={t.label} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                <span aria-hidden className="text-[var(--color-warning)]">○</span>
                <span className="text-[var(--color-ink)]">{t.label}</span>
                <span className="mono-num text-xs text-[var(--color-ink-3)]">— {t.who}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-3 rounded-2xl border border-[var(--color-line)] bg-[var(--color-paper-2)]/50 p-6">
          <h2 className="text-xl text-[var(--color-ink)]">Deploying it yourself</h2>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-[var(--color-ink-2)]">
            <li>Deploy the vaults with Foundry (<code className="text-[var(--color-accent)]">script/Deploy.s.sol</code> for v1, <code className="text-[var(--color-accent)]">script/DeployV2.s.sol</code> for v2) against a chain with Aave V3.</li>
            <li>Set <code className="text-[var(--color-accent)]">NEXT_PUBLIC_VAULT_V1_&lt;chainId&gt;</code> / <code className="text-[var(--color-accent)]">_V2_</code> and add v1 markets to <code className="text-[var(--color-accent)]">web/lib/config.ts</code>.</li>
            <li>Deploy the dashboard on Vercel (root dir <code className="text-[var(--color-accent)]">web</code>); set the env vars, keeping <code className="text-[var(--color-accent)]">ALCHEMY_API_KEY</code> server-only.</li>
            <li>For production, set <code className="text-[var(--color-accent)]">VAULT_OWNER</code> to a Safe multisig and flip <code className="text-[var(--color-accent)]">NEXT_PUBLIC_NETWORK_MODE=mainnet</code>.</li>
          </ol>
        </section>
      </main>
    </>
  );
}
