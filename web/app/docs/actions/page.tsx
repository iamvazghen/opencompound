function Action({
  name,
  who,
  children,
}: {
  name: string;
  who: "Anyone" | "Owner only" | "Permissionless" | "You";
  children: React.ReactNode;
}) {
  const tone =
    who === "Owner only"
      ? "border-[var(--color-warning)]/40 text-[var(--color-warning)]"
      : "border-[var(--color-positive)]/40 text-[var(--color-positive)]";
  return (
    <div className="border-t border-[var(--color-line)] pt-5">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-lg font-semibold text-white">{name}</h3>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs ${tone}`}>{who}</span>
      </div>
      <div className="mt-2 space-y-2 text-[var(--color-ink-2)]">{children}</div>
    </div>
  );
}

export default function ActionsDocs() {
  return (
    <>
      <h1 className="text-3xl font-bold text-white">Dashboard actions explained</h1>
      <p>
        Every button on the dashboard is a real on-chain transaction to the vault, which acts on Aave.
        Here&apos;s exactly what each one does, who can call it, and when to use it.
      </p>

      <div className="space-y-1 pt-2">
        <Action name="Connect / Network switch" who="You">
          <p>
            Connect any wallet via Reown. The network button switches between testnets (Sepolia, Base
            Sepolia); the dashboard re-points to that chain&apos;s Aave pool and vault automatically.
          </p>
        </Action>

        <Action name="Watch (paste address) / Exit watch" who="Anyone">
          <p>
            Paste any address to view its position and the vault read-only — no wallet needed, no actions
            possible. &quot;Exit watch&quot; returns to normal. Useful for tracking a wallet (e.g. the
            deployer) without connecting it.
          </p>
        </Action>

        <Action name="Deposit" who="Anyone">
          <p>
            Pulls the chosen amount of the asset from your wallet, supplies it to Aave through the vault,
            and mints you vault shares 1:1 with the net equity added. This is the normal way in. (Two
            wallet prompts: approve, then deposit.)
          </p>
        </Action>

        <Action name="Migrate aTokens (v1)" who="Anyone">
          <p>
            Already supplied this asset to Aave yourself? Instead of depositing new funds, transfer your
            existing <strong>aTokens</strong> into the vault and receive shares for them — no new capital,
            no swap. Only collateral can move: Aave debt is non-transferable, so any existing borrow must
            be unwound on your own account first.
          </p>
        </Action>

        <Action name="Apply Conservative / Balanced / Aggressive" who="Owner only">
          <p>
            Writes the preset&apos;s target LTV (and, for v2, slippage) to the vault via
            <code> setStrategy</code>. Each preset shows its live net carry so you can see whether it
            self-repays at the current rates before applying.
          </p>
        </Action>

        <Action name="Apply recommended" who="Owner only">
          <p>
            Sets the vault to the <strong>recommended LTV</strong> — the highest self-repaying LTV at the
            current rates, minus a safety buffer (computed live from supply ÷ borrow). The best
            risk-adjusted setpoint without doing the maths yourself.
          </p>
        </Action>

        <Action name="Flash leverage" who="Owner only">
          <p>
            Builds the position to the <strong>exact</strong> target LTV in a single transaction using an
            Aave flash loan — far cheaper than looping and not cycle-limited. v1 needs no swap; v2 swaps
            the borrow into the collateral asset inside the same transaction.
          </p>
        </Action>

        <Action name="Leverage (loop)" who="Owner only">
          <p>
            The no-flash fallback: borrows and re-supplies in cycles up to the max. Reaches roughly the
            target over several cycles. Use it if you prefer to avoid the ~0.09% flash fee.
          </p>
        </Action>

        <Action name="Harvest (v1)" who="Anyone">
          <p>
            Repays debt from any idle balance sitting in the vault — e.g. incentive rewards a keeper has
            claimed and dropped in. Reduces the loan using found yield.
          </p>
        </Action>

        <Action name="Rebalance (v2)" who="Permissionless">
          <p>
            Moves the position back to target LTV after prices drift — deleverages if over target,
            re-levers a step if under. Keeper-callable so the position stays on target unattended.
          </p>
        </Action>

        <Action name="Flash unwind (v1) / Deleverage (v2)" who="Owner only">
          <p>
            <strong>Flash unwind</strong> (v1) repays <em>all</em> debt and fully de-leverages in one
            transaction via a flash loan. <strong>Deleverage</strong> (v2) withdraws collateral, swaps,
            and repays debt toward zero. Both return you to an unlevered position you can then withdraw.
          </p>
        </Action>

        <Action name="Guard" who="Permissionless">
          <p>
            The safety net. <strong>Anyone</strong> (or a keeper bot) can call it, but it only acts when
            LTV has risen above the <strong>live Safe LTV</strong> — a fraction of the asset&apos;s
            current Aave liquidation threshold, recomputed every call, never hardcoded. When it fires it
            deleverages back to a safe level, protecting the position from liquidation even while
            you&apos;re away. It reverts if the position is already safe, so it can&apos;t be misused.
          </p>
        </Action>

        <Action name="Emergency unwind" who="Owner only">
          <p>
            Break-glass: repays all debt and withdraws all collateral straight to the owner. For getting
            out fast in an emergency; normal exits are Withdraw / Redeem.
          </p>
        </Action>

        <Action name="Withdraw / Redeem" who="You">
          <p>
            Standard ERC-4626 exits. <strong>Withdraw</strong> takes out a specific amount of the asset;
            <strong> Redeem</strong> burns a number of shares for the underlying. Both return funds to
            your wallet. Deleverage first if the position is leveraged.
          </p>
        </Action>
      </div>

      <p className="pt-6 text-sm text-[var(--color-ink-3)]">
        &quot;Owner only&quot; actions require the wallet that owns the vault. &quot;Anyone&quot; /
        &quot;Permissionless&quot; actions can be called by any address (e.g. keeper bots) — but the
        permissionless ones can only ever reduce risk or help the position, never harm it.
      </p>
    </>
  );
}
