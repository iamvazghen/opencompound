export default function DashboardDocs() {
  return (
    <>
      <h1 className="text-3xl font-bold text-white">Using the dashboard</h1>
      <p>
        The dashboard is how you drive the vault. Every button is a real on-chain transaction to the
        vault contract, which in turn acts on Aave. Here is what each part does.
      </p>

      <h2 className="pt-4 text-xl font-semibold text-white">1. Connect & pick a network</h2>
      <p>
        Connect any wallet via the Reown button. Use the network switcher beside it to move between
        testnets (Sepolia, Base Sepolia); the dashboard automatically points at the right Aave pool and
        the vault deployed on that chain. If no vault is deployed on the selected chain, the actions are
        disabled and the dashboard tells you which env address to set.
      </p>

      <h2 className="pt-4 text-xl font-semibold text-white">2. Auto-detected Aave position</h2>
      <p>
        On connect, the dashboard reads Aave&apos;s <code>getUserAccountData</code> for your wallet and
        shows any existing Aave position you hold directly. (Note: positions you build <em>through the
        vault</em> live under the vault&apos;s address, not your wallet — see the Verify panel below.)
      </p>

      <h2 className="pt-4 text-xl font-semibold text-white">3. Choose a strategy</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li><strong>Version toggle</strong> — v1 (single-asset, self-repaying loan) or v2 (yield-differential).</li>
        <li><strong>Risk presets</strong> — Conservative / Balanced / Aggressive, each annotated with its live net carry.</li>
        <li><strong>Recommended LTV</strong> — computed from the current Aave rates as the highest self-repaying LTV minus a safety buffer. &quot;Apply&quot; sets it on the vault.</li>
        <li><strong>Break-even & self-repaying badge</strong> — live, so you can see whether your chosen LTV earns or bleeds before you act.</li>
      </ul>

      <h2 className="pt-4 text-xl font-semibold text-white">4. Actions and what they do</h2>
      <table className="w-full text-sm">
        <thead className="text-neutral-500"><tr><th className="text-left">Button</th><th className="text-left">On-chain effect</th></tr></thead>
        <tbody>
          {[
            ["Deposit", "Supplies your asset to Aave via the vault; mints you shares."],
            ["Flash leverage", "Builds the position to the exact target LTV in one transaction (flash loan)."],
            ["Leverage (loop)", "The no-flash fallback: borrows + re-supplies in cycles."],
            ["Harvest (v1)", "Repays debt from any idle balance / claimed rewards in the vault."],
            ["Rebalance (v2)", "Moves the position back to target LTV after prices drift."],
            ["Flash unwind (v1)", "Repays all debt and de-leverages fully in one transaction."],
            ["Deleverage (v2)", "Withdraws collateral, swaps, repays debt toward zero."],
            ["Emergency unwind", "Owner break-glass: repay all debt and return collateral to the owner."],
          ].map(([b, e]) => (
            <tr key={b} className="border-t border-neutral-800 align-top">
              <td className="py-2 pr-4 font-medium text-white">{b}</td>
              <td className="py-2 text-neutral-400">{e}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-sm text-neutral-400">
        Deposit, withdraw, redeem and harvest are open to anyone; leverage, strategy settings, pause and
        emergency unwind are owner-gated. To drive the owner-only actions, connect with the wallet that
        deployed (owns) the vault.
      </p>

      <h2 className="pt-4 text-xl font-semibold text-white">5. Verify on-chain</h2>
      <p>
        The dashboard&apos;s <strong>Verify on-chain</strong> panel links to the vault on the block
        explorer. Open its Token Holdings to see Aave&apos;s receipts: the <strong>aToken</strong> balance
        is what the vault has supplied, the <strong>variable-debt token</strong> balance is what it
        borrowed. The Events / Token Transfers tab shows every Supply, Borrow, Repay and Withdraw to the
        Aave pool. This is the ground truth — it always matches the numbers the dashboard shows.
      </p>
      <p className="text-sm text-neutral-400">
        Aave&apos;s own app (testnet mode → Base Sepolia market) shows the <em>connected wallet&apos;s</em>
        position, so it won&apos;t display the vault&apos;s position unless you look up the vault address on
        the explorer. See <a className="text-emerald-400" href="/docs/architecture">Architecture</a> for why.
      </p>
    </>
  );
}
