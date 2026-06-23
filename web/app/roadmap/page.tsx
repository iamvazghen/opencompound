import type { Metadata } from "next";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Roadmap — OpenCompound",
  description: "The four-phase plan: mainnet, more assets, more base protocols, and DEX + Ondo RWA integration.",
};

type Phase = { n: string; title: string; status: string; live?: boolean; intro: string; items: string[] };

const phases: Phase[] = [
  {
    n: "01",
    title: "Mainnet",
    status: "Up next",
    live: true,
    intro: "Take the strategy layer from testnet to production, hardened for real funds.",
    items: [
      "Professional security audit + public bug bounty.",
      "Ownership moved to a Safe multisig / timelock; no single-EOA control.",
      "Keeper automation wired for guard() and rebalance() (Gelato / Chainlink).",
      "Deploy the pooled vaults + PositionFactory to mainnet — Base first, then Ethereum and L2s.",
    ],
  },
  {
    n: "02",
    title: "More assets",
    status: "Planned",
    intro: "A managed position for every asset worth holding.",
    items: [
      "A vault and an isolated-position market for each major Aave reserve: WBTC, USDT, DAI, wstETH, cbETH, and more.",
      "One-click access to the same self-repaying / leveraged-staking strategies across the whole asset list.",
      "Per-asset live break-even and safe-LTV, so each market is parameterised from its own real rates.",
    ],
  },
  {
    n: "03",
    title: "More base protocols",
    status: "Planned",
    intro: "Extend the layer beyond Aave — route every position to the best terms.",
    items: [
      "Integrate additional lending markets: Compound, Morpho, Spark, and others.",
      "The strategy layer becomes protocol-agnostic — it picks the venue with the best supply/borrow spread and caps for each position.",
      "More base liquidity to build on means deeper, safer, more efficient positions for users.",
    ],
  },
  {
    n: "04",
    title: "DEXes + Ondo Finance (RWA)",
    status: "Planned",
    intro:
      "Turn drawn liquidity into productive capital — and a second layer of protection for the underlying position.",
    items: [
      "Per chain, integrate at least one DEX (ideally two or more) so cash you draw can flow straight into liquidity pools.",
      "An Ondo Finance bridge to acquire tokenized real-world assets (RWA) — e.g. treasuries — with drawn liquidity.",
      "Drawing cash stays optional: withdraw to your wallet to use however you like, exactly as today.",
      "But if you choose to deploy it, the integration makes investing seamless — and the yield it earns adds a second layer of protection for your Aave position by generating income that can service the debt.",
    ],
  },
];

export default function RoadmapPage() {
  return (
    <>
      <Nav />
      <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
        <h1 className="text-[var(--text-display-s)] text-[var(--color-ink)]">Roadmap</h1>
        <p className="mt-4 max-w-2xl text-lg text-[var(--color-ink-2)]">
          OpenCompound is the strategy layer above on-chain credit. Aave (and its peers) provide the
          trust-minimised base layer for supplying and borrowing; OpenCompound manages those positions
          algorithmically — better than an average user could by hand. Here&apos;s how it grows.
        </p>

        <ol className="mt-12 space-y-6">
          {phases.map((p) => (
            <li key={p.n} className="surface relative rounded-2xl p-7">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-baseline gap-3">
                  <span className="mono-num text-sm text-[var(--color-accent)]">{p.n}</span>
                  <h2 className="text-2xl text-[var(--color-ink)]">{p.title}</h2>
                </div>
                <span
                  className={`rounded-full border px-3 py-0.5 text-xs ${
                    p.live
                      ? "border-[var(--color-accent)]/50 text-[var(--color-accent)]"
                      : "border-[var(--color-line)] text-[var(--color-ink-3)]"
                  }`}
                >
                  {p.status}
                </span>
              </div>
              <p className="mt-3 text-[var(--color-ink-2)]">{p.intro}</p>
              <ul className="mt-4 space-y-2">
                {p.items.map((it) => (
                  <li key={it} className="flex gap-3 text-sm text-[var(--color-ink-2)]">
                    <span aria-hidden className="text-[var(--color-accent)]">◇</span>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>

        <p className="mt-10 rounded-2xl border border-[var(--color-line)] bg-[var(--color-paper-2)] p-5 text-sm text-[var(--color-ink-3)]">
          This roadmap is forward-looking and not a commitment or a financial promise. OpenCompound is
          currently a testnet, unaudited project — see the{" "}
          <a href="/deployment" className="text-[var(--color-accent)] hover:underline">deployment status</a>{" "}
          and <a href="/risk" className="text-[var(--color-accent)] hover:underline">risk disclosure</a>.
        </p>
      </main>
    </>
  );
}
