import Link from "next/link";
import { Nav } from "@/components/Nav";

export default function Landing() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-5xl px-6 pt-24 pb-16 text-center">
          <p className="mb-4 inline-block rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
            Built on Aave V3 · Testnet
          </p>
          <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
            Leverage &amp; self-repaying vaults,
            <br />
            <span className="text-emerald-400">without the false math.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-neutral-400">
            OpenCompound runs same-asset leverage loops and self-repaying strategies on Aave V3.
            Connect your wallet, auto-detect your existing Aave position, and execute — with the
            real economics shown to you, not hidden.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Link
              href="/app"
              className="rounded bg-emerald-500 px-6 py-3 font-medium text-neutral-950 hover:bg-emerald-400"
            >
              Launch Dashboard
            </Link>
            <Link
              href="/docs"
              className="rounded border border-neutral-700 px-6 py-3 font-medium hover:border-neutral-500"
            >
              Read the Docs
            </Link>
          </div>
        </section>

        {/* Honest economics — two modes */}
        <section className="mx-auto max-w-5xl px-6 pb-24">
          <h2 className="mb-2 text-center text-2xl font-semibold">Two modes. Stated honestly.</h2>
          <p className="mx-auto mb-10 max-w-2xl text-center text-sm text-neutral-500">
            Same-asset looping does <em>not</em> amplify price exposure (collateral and debt cancel)
            and carries negative interest. We show you when a strategy makes money — and when it
            doesn&apos;t.
          </p>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-6">
              <h3 className="text-lg font-semibold text-emerald-400">Reward-Farming Leverage</h3>
              <p className="mt-1 text-xs uppercase tracking-wide text-neutral-500">single-asset · v1</p>
              <p className="mt-4 text-sm text-neutral-400">
                Loop supply→borrow→re-supply up to 4× at 70% LTV. Net price exposure is zero and the
                rate carry is negative — so this only profits when <strong>incentive rewards</strong>{" "}
                exceed the spread. The dashboard reads live Aave rates and warns before you loop into
                a loss.
              </p>
            </div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-6">
              <h3 className="text-lg font-semibold text-emerald-400">Yield-Differential (Self-Repaying)</h3>
              <p className="mt-1 text-xs uppercase tracking-wide text-neutral-500">wstETH / WETH · v2</p>
              <p className="mt-4 text-sm text-neutral-400">
                Supply a yield-bearing asset, borrow its base in e-mode. Staking yield beats the
                borrow cost, so the position carries <strong>positive</strong> and the debt
                self-repays as collateral outgrows it. This is the real leveraged-staking carry
                trade.
              </p>
            </div>
          </div>
          <p className="mt-8 text-center text-xs text-neutral-600">
            Educational / portfolio project. Not audited. Testnet only. Not financial advice.
          </p>
        </section>
      </main>
      <footer className="border-t border-neutral-800 px-6 py-6 text-center text-xs text-neutral-600">
        OpenCompound · <Link href="/docs" className="hover:text-neutral-400">Docs</Link> ·{" "}
        <Link href="/app" className="hover:text-neutral-400">Dashboard</Link>
      </footer>
    </>
  );
}
