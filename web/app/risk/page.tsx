import type { Metadata } from "next";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Risk disclosure — OpenCompound",
  description: "Material risks of using OpenCompound's leveraged and self-repaying Aave V3 vaults.",
};

export default function RiskPage() {
  return (
    <>
      <Nav />
      <article id="main-content" className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-6 py-12 text-[var(--color-ink-2)] [&_h2]:mt-8 [&_h2]:text-[var(--color-ink)] [&_strong]:text-[var(--color-ink)]">
        <h1 className="text-[var(--text-display-s)] text-[var(--color-ink)]">Risk disclosure</h1>
        <p>
          OpenCompound is experimental, <strong>unaudited</strong> software for interacting with Aave V3.
          Using it can lead to <strong>total loss of funds</strong>. Read this before depositing.
        </p>

        <h2>Liquidation</h2>
        <p>
          Leveraged positions borrow against collateral on Aave. If your collateral falls in value, the
          debt asset rises, or interest accrues past the liquidation threshold, Aave liquidators can
          seize collateral at a penalty. The vault&apos;s permissionless <code>guard()</code> reduces but
          does not eliminate this risk — it depends on a keeper or someone calling it in time.
        </p>

        <h2>Smart-contract risk</h2>
        <p>
          The vault contracts have <strong>not been audited</strong>. They use flash loans, oracle
          pricing, and (for v2) on-chain swaps. Bugs, economic exploits, or integration failures with
          Aave or Uniswap could drain the vault. Deposits are not insured.
        </p>

        <h2>Interest-rate &amp; carry risk</h2>
        <p>
          &quot;Self-repaying&quot; depends on the supply yield exceeding the borrow cost at your chosen
          LTV (below the break-even shown in the dashboard). Aave rates float; a position that is
          self-repaying today can bleed if borrow rates rise or the LTV drifts up.
        </p>

        <h2>Oracle, swap &amp; MEV risk (v2)</h2>
        <p>
          v2 values debt and bounds swaps using Aave&apos;s price oracle. Oracle failure or manipulation,
          thin Uniswap liquidity, or swap slippage can reduce equity or block unwinds.
        </p>

        <h2>Third-party dependencies</h2>
        <p>
          The protocol relies on Aave V3, Uniswap V3, the connected RPC provider, and your wallet. An
          outage or change in any of these can prevent deposits, withdrawals, or guarding.
        </p>

        <h2>No advice</h2>
        <p>
          Nothing here is financial, investment, legal, or tax advice. You are solely responsible for
          your decisions and for complying with the laws of your jurisdiction.
        </p>
      </article>
    </>
  );
}
