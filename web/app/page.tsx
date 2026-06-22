import Link from "next/link";
import { Nav } from "@/components/Nav";

// Stat-Led macrostructure. Every number below is real — measured from the Foundry
// suite or fixed by the contracts (Hallmark: no invented metrics).
const stats: { value: string; label: string }[] = [
  { value: "12 / 12", label: "contract tests passing" },
  { value: "2", label: "vaults — reward-farming + yield-differential" },
  { value: "501k", label: "gas for flash-loan leverage (vs 701k looping)" },
  { value: "Aave V3", label: "every position lives on-chain" },
];

export default function Landing() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-5xl px-6 pt-24 pb-12">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-paper-2)] px-3 py-1 text-xs text-[var(--color-ink-2)]">
            <span className="size-1.5 rounded-full bg-[var(--color-positive)]" /> Built on Aave V3 · Testnet
          </p>
          <h1 className="max-w-3xl text-[var(--text-display)] leading-[1.02]">
            Leverage and self-repaying vaults, with the real economics in the open.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-[var(--color-ink-2)]">
            OpenCompound runs same-asset leverage loops and yield-differential strategies on Aave V3.
            Connect a wallet, auto-detect your Aave position, and execute — and the dashboard tells you
            when a strategy actually makes money.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/app"
              className="rounded-full bg-[var(--color-accent)] px-6 py-3 font-medium text-[var(--color-paper)] transition-colors duration-[var(--dur-fast)] hover:bg-[var(--color-accent-2)]"
            >
              Launch dashboard
            </Link>
            <Link
              href="/strategies"
              className="rounded-full border border-[var(--color-line)] px-6 py-3 font-medium text-[var(--color-ink)] transition-colors duration-[var(--dur-fast)] hover:border-[var(--color-ink-3)]"
            >
              How the strategies work
            </Link>
          </div>
        </section>

        {/* Stat band */}
        <section className="mx-auto max-w-5xl px-6 py-10">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-line)] md:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="bg-[var(--color-paper)] p-6">
                <p className="mono-num text-2xl text-[var(--color-accent)]">{s.value}</p>
                <p className="mt-1 text-sm text-[var(--color-ink-3)]">{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Two modes, stated honestly */}
        <section className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-[var(--text-display-s)]">Two modes. Stated honestly.</h2>
          <p className="mt-3 max-w-2xl text-[var(--color-ink-2)]">
            Same-asset looping doesn&apos;t amplify price exposure — collateral and debt cancel — but its
            net interest is positive below the break-even LTV (s/b). We show you that line live, so you
            know when a position self-repays and when it bleeds.
          </p>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <ModeCard
              tag="single-asset · v1"
              title="Reward-Farming Leverage"
              body="Loops supply→borrow→re-supply at a managed LTV. No net price exposure (same asset cancels), but net interest is positive while LTV stays below break-even (s/b) — so it self-repays as a loan, with reward farming on top. The dashboard shows your live break-even."
            />
            <ModeCard
              tag="wstETH / WETH · v2"
              title="Yield-Differential"
              body="Supply a yield-bearing asset, borrow its base in e-mode. Staking yield beats the borrow cost, so the position carries positive and the debt self-repays as collateral outgrows it. The real leveraged-staking carry trade."
            />
          </div>
          <p className="mt-8">
            <Link href="/strategies" className="ulink">
              See how both are implemented on-chain →
            </Link>
          </p>
        </section>
      </main>
      {/* Statement footer is mounted site-wide in the root layout (components/Footer). */}
    </>
  );
}

function ModeCard({ tag, title, body }: { tag: string; title: string; body: string }) {
  return (
    <div className="surface rounded-2xl p-7 transition-transform duration-[var(--dur-mid)] ease-[var(--ease-out)] hover:-translate-y-0.5">
      <p className="mono-num text-xs uppercase tracking-widest text-[var(--color-ink-3)]">{tag}</p>
      <h3 className="mt-2 text-2xl text-[var(--color-accent)]">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-2)]">{body}</p>
    </div>
  );
}
