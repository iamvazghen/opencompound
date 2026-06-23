import Link from "next/link";
import { Nav } from "@/components/Nav";

// Strategies page — pure explanation. No source code: prose, formulas, benefits, trade-offs.

function Section({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-4 border-t border-[var(--color-line)] pt-10">
      {children}
    </section>
  );
}
function Formula({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-paper-2)] p-5 text-center">
      <p className="mono-num text-lg text-[var(--color-accent)]">{children}</p>
      {note && <p className="mt-2 text-xs text-[var(--color-ink-3)]">{note}</p>}
    </div>
  );
}
function Benefits({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {items.map((b) => (
        <li key={b} className="flex gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-paper-2)] p-3 text-sm">
          <span className="text-[var(--color-positive)]">✓</span>
          <span className="text-[var(--color-ink-2)]">{b}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Strategies() {
  return (
    <>
      <Nav />
      <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 px-6 py-14 text-[var(--color-ink-2)] [&_h2]:text-[var(--color-ink)] [&_h3]:text-[var(--color-ink)] [&_strong]:text-[var(--color-ink)]">
        <h1 className="text-[var(--text-display-s)] text-[var(--color-ink)]">Strategy overviews</h1>
        <p className="mt-4 text-lg">
          OpenCompound runs two distinct strategies on top of Aave V3. Both are real on-chain positions
          — the vault genuinely supplies and borrows on Aave — wrapped in an automated, share-based
          vault. This page explains what each strategy does, the maths that governs it, who it suits,
          and where the risk sits. For the technical mechanics, see the{" "}
          <Link href="/docs/architecture" className="ulink">architecture docs</Link>.
        </p>
        <nav className="mt-6 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {[
            ["#v1", "v1 · Reward-Farming / Self-Repaying Loan"],
            ["#v2", "v2 · Yield-Differential"],
            ["#efficiency", "Execution efficiency"],
            ["#choosing", "Which one is for you"],
          ].map(([href, label]) => (
            <a key={href} href={href} className="ulink">{label}</a>
          ))}
        </nav>

        {/* ───────────── v1 ───────────── */}
        <Section id="v1">
          <h2 className="text-2xl">v1 — Single-asset, self-repaying loan</h2>
          <p>
            You deposit one asset and the vault supplies it to Aave as collateral. Against that
            collateral the vault borrows the <em>same</em> asset and hands it back to you as usable
            liquidity. If you keep the loan-to-value below the break-even point, the supply interest your
            collateral earns is larger than the borrow interest you pay — so the loan quietly services
            and pays itself down. <strong>It is self-repaying, as long as you manage the LTV correctly
            relative to the supply and borrow rates.</strong>
          </p>
          <div className="space-y-3 rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5 p-5">
            <p className="text-[var(--color-ink)]">
              <strong>Self-repaying, defined:</strong> a position self-repays whenever the interest earned
              on the whole collateral exceeds the interest paid on the borrowed slice — i.e. while LTV
              stays under <span className="mono-num text-[var(--color-accent)]">break-even = supply rate ÷ borrow rate</span>.
              Manage the LTV against the live rates and you never add a cent; the yield does the repaying.
            </p>
            <p className="text-[var(--color-ink)]">
              <strong>Withdraw cash for any purpose — without the tax event:</strong> you draw spendable
              liquidity from an asset you want to <em>keep</em>, and use it for whatever you like —
              redeploy into other DeFi, cover real-world expenses, anything. Borrowing is not a disposal,
              so it doesn&apos;t trigger a capital-gains sale the way cashing out would. You hold your
              ETH/BTC, take the cash, and the position keeps paying the loan back from yield. Your draw is
              capped at a <strong>live safe loan-to-value</strong>, and the dashboard shows the exact
              amount you can take while staying self-repaying — so you can&apos;t borrow yourself toward
              liquidation. (Not tax advice — rules vary by jurisdiction.)
            </p>
            <p className="text-[var(--color-ink)]">
              <strong>Your own isolated position:</strong> each user gets a personal position (an
              individual Aave account), not a slice of a shared pool — so you set your own LTV, draw your
              own cash, and loop your own leverage (up to 5 cycles) independently of everyone else. A
              permissionless guard can always step in to deleverage you back to safety if the market
              moves against you, even while you&apos;re away.
            </p>
            <p className="text-[var(--color-ink)]">
              <strong>Works for any asset:</strong> the exact same logic runs on ETH, USDC, USDT, WBTC,
              DAI and any other token Aave lists — each with its own live break-even computed from that
              asset&apos;s own supply and borrow rates.
            </p>
          </div>

          <h3 className="pt-2 text-lg">The core insight</h3>
          <p>
            Supply interest is earned on your <strong>whole collateral</strong>, but borrow interest is
            paid only on the <strong>amount you borrowed</strong>. Because the collateral is the larger
            base, a low loan-to-value (LTV) position can earn more in supply interest than it pays in
            borrow interest — even though, rate-for-rate, borrowing always costs more than supplying.
          </p>
          <Formula note="s = supply APR · b = borrow APR · L = loan-to-value (debt ÷ collateral) · E = your equity">
            net&nbsp;interest&nbsp;=&nbsp;E&nbsp;·&nbsp;(s&nbsp;−&nbsp;b·L)&nbsp;/&nbsp;(1&nbsp;−&nbsp;L)
          </Formula>
          <p>
            This is positive — the position self-repays — whenever your LTV stays below the{" "}
            <strong>break-even point</strong>:
          </p>
          <Formula note="On Aave, s = b · utilisation · (1 − reserve factor), so break-even is roughly 40–70% on mainnet.">
            break-even&nbsp;LTV&nbsp;=&nbsp;s&nbsp;/&nbsp;b
          </Formula>
          <p>
            Worked example: if supply is 2% and borrow is 4%, the break-even is 50%. At 40% LTV your
            collateral&apos;s 2% yield outruns the 4% you pay on a loan half its size, so equity grows
            and the debt drifts toward zero on its own. At 60% it would slowly bleed. The dashboard
            reads the live Aave rates and shows your break-even and the recommended LTV in real time, so
            you never have to do this maths by hand.
          </p>

          <h3 className="pt-2 text-lg">Two honest caveats</h3>
          <p>
            <strong>It is not leveraged price exposure.</strong> Because collateral and debt are the
            same token, they move together and cancel — your net directional exposure always equals your
            equity, no matter how many times you loop. This is a yield and liquidity tool, not a way to
            go &quot;long with leverage.&quot;
          </p>
          <p>
            <strong>Borrowing never beats simply supplying for raw yield.</strong> Each unit borrowed
            adds the negative supply-minus-borrow spread. So the reason to use v1 is not a bigger APY —
            it is to <em>extract usable liquidity</em> from an asset you want to keep, and have that loan
            quietly pay itself down, or to <em>farm incentive rewards</em> on a larger supplied balance.
          </p>

          <h3 className="pt-2 text-lg">Benefits</h3>
          <Benefits items={[
            "Borrow against your holdings without selling them — keep the asset, get liquidity.",
            "The loan self-services from yield while you stay below break-even.",
            "Works for any single asset Aave lists (ETH, BTC, USDC, …).",
            "Reward/points farming on an amplified supplied balance.",
            "Live break-even + recommended-LTV guidance, so you can't accidentally bleed.",
            "Fully reversible on-chain — unwind to your wallet at any time.",
          ]} />

          <h3 className="pt-2 text-lg">Who it suits</h3>
          <p>
            Long-term holders who want spendable liquidity without a taxable sale, and yield/points
            farmers who want a larger Aave footprint. It is conservative by design: the recommended
            preset keeps you comfortably inside the self-repaying band.
          </p>
        </Section>

        {/* ───────────── v2 ───────────── */}
        <Section id="v2">
          <h2 className="text-2xl">v2 — Yield-differential (leveraged staking)</h2>
          <p>
            v2 is the strategy that actually earns an amplified yield. You supply a{" "}
            <strong>yield-bearing</strong> asset (for example wstETH, which appreciates against ETH from
            staking rewards) and borrow its <strong>correlated base</strong> (WETH). Because the two
            track each other closely, Aave&apos;s e-mode allows a high LTV, and because the collateral
            out-earns the cost of the debt, the position carries positive and compounds.
          </p>

          <h3 className="pt-2 text-lg">Why this one is genuinely profitable</h3>
          <p>
            Here the effective yield on the collateral is the Aave supply rate <em>plus</em> the external
            staking yield — and that total exceeds the borrow rate. The same break-even formula applies,
            but with the richer yield, so the positive-carry band reaches much higher LTVs:
          </p>
          <Formula note="effective supply = Aave supply APR + staking yield (e.g. ~3% for wstETH)">
            net&nbsp;carry&nbsp;positive&nbsp;while&nbsp;&nbsp;L&nbsp;&lt;&nbsp;(s&nbsp;+&nbsp;staking)&nbsp;/&nbsp;b
          </Formula>
          <p>
            Leverage now <em>helps</em>: looping the position multiplies a small positive spread into a
            meaningful yield on your equity, while also amplifying exposure to the staking-yield accrual.
            This is the well-established &quot;leveraged staking&quot; carry trade.
          </p>

          <h3 className="pt-2 text-lg">Self-repaying, the honest way</h3>
          <p>
            There is no magic debt eraser. As the collateral appreciates against the debt, the debt
            becomes cheaper in collateral terms, so your equity (and the vault&apos;s share price) rises
            on its own — no transaction required. That passive compounding <em>is</em> the
            self-repayment. An optional rebalance keeps the leverage on target as prices move.
          </p>

          <h3 className="pt-2 text-lg">Withdraw cash here too — tax-free</h3>
          <p>
            Because the leveraged-staking position carries positive, it also gives you headroom to{" "}
            <strong>borrow cash against it for any purpose</strong> — reinvest elsewhere, or spend in the
            real world — without selling your staked ETH and without a taxable disposal. The staking
            yield differential keeps servicing the debt while you hold the exposure, and any draw is held
            below the live safe loan-to-value so the position stays self-repaying rather than tipping
            toward liquidation.
          </p>

          <h3 className="pt-2 text-lg">The trade-off v1 doesn&apos;t have</h3>
          <p>
            Because you supply one asset and borrow another, each leverage step needs a swap (borrowed
            WETH → more wstETH), which introduces swap fees and slippage, plus the risk that the two
            assets de-peg or that the borrow rate spikes above the staking yield and flips the carry
            negative. It is a higher-reward, higher-maintenance strategy than v1.
          </p>

          <h3 className="pt-2 text-lg">Benefits</h3>
          <Benefits items={[
            "Real amplified yield — leverage multiplies a positive carry.",
            "Leveraged exposure to staking-yield accrual.",
            "Self-compounding: equity grows passively as collateral out-earns debt.",
            "High capital efficiency via Aave e-mode (correlated-asset high LTV).",
            "Single-transaction entry via flash loan (no manual loops).",
            "On-target rebalancing keeps risk where you set it.",
          ]} />

          <h3 className="pt-2 text-lg">Who it suits</h3>
          <p>
            Users who want yield on ETH and are comfortable with smart-contract, de-peg, and
            interest-rate risk in exchange for a leveraged return. It is the more aggressive of the two.
          </p>
        </Section>

        {/* ───────────── efficiency ───────────── */}
        <Section id="efficiency">
          <h2 className="text-2xl">Execution efficiency</h2>
          <p>
            Building a leveraged position by looping — borrow a little, re-supply, repeat — is slow, pays
            transaction and (for v2) swap costs on every cycle, and can only approach the target LTV
            asymptotically — which is why loops are <strong>capped at 5</strong> (four loops already get
            you ~91% of the way; beyond five is wasted gas). OpenCompound instead uses a{" "}
            <strong>flash loan</strong> to reach the exact target in a single transaction, and to fully
            unwind in a single transaction.
          </p>
          <p>
            The vault borrows the shortfall for one block, builds the whole position at once, and repays
            the flash loan from the proceeds — paying only a ~0.09% flash fee instead of repeated
            gas and slippage. In live testing this reached the exact target LTV at lower gas than the
            loop, and cleared all debt in one transaction where the naive method needed several passes.
          </p>
          <Benefits items={[
            "One transaction to the exact target leverage — not a cycle-limited approximation.",
            "One transaction to fully unwind — no multi-step health-factor juggling.",
            "Lower total cost than looping (single fee vs. repeated gas + slippage).",
            "Same-asset v1 needs no swap at all, so its flash paths are essentially free of slippage.",
          ]} />
        </Section>

        {/* ───────────── choosing ───────────── */}
        <Section id="choosing">
          <h2 className="text-2xl">Which one is for you</h2>
          <p>
            <strong>Choose v1</strong> if you want to keep an asset, borrow against it for liquidity, and
            have that loan pay itself down — or to farm rewards. It carries no directional leverage and
            is the safer, simpler strategy.
          </p>
          <p>
            <strong>Choose v2</strong> if you want an amplified, self-compounding yield on ETH via
            leveraged staking, and you accept the extra swap, de-peg, and rate risk that comes with it.
          </p>
          <p className="rounded-xl border border-[var(--color-line)] bg-[var(--color-paper-2)] p-4 text-sm">
            Whichever you pick, every position is a real Aave position held by the vault on your behalf,
            fully visible on-chain and reversible to your wallet at any time. This is an educational /
            testnet project — not audited, not financial advice.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link href="/app" className="rounded-full bg-[var(--color-accent)] px-5 py-2.5 font-medium text-[var(--color-paper)] hover:bg-[var(--color-accent-2)]">
              Open the dashboard
            </Link>
            <Link href="/docs/architecture" className="rounded-full border border-[var(--color-line)] px-5 py-2.5 font-medium text-[var(--color-ink)] hover:border-[var(--color-ink-3)]">
              How it works (docs)
            </Link>
          </div>
        </Section>
      </main>
    </>
  );
}
