export default function DocsOverview() {
  return (
    <>
      <h1 className="text-3xl font-bold text-white">OpenCompound docs</h1>
      <p>
        OpenCompound is an ERC-4626 vault on Aave V3 that runs same-asset leverage loops and
        self-repaying strategies. It&apos;s a testnet / portfolio project — not audited, not financial
        advice.
      </p>
      <h2 className="pt-4 text-xl font-semibold text-white">How it works</h2>
      <ol className="list-decimal space-y-2 pl-5">
        <li><strong>Deposit</strong> an asset; the vault supplies it to Aave V3 and mints you shares.</li>
        <li><strong>Leverage</strong> loops borrow→re-supply up to 4 cycles at a target LTV (default 70%).</li>
        <li><strong>Harvest &amp; repay</strong> routes idle balance (e.g. claimed rewards) into debt repayment.</li>
        <li><strong>Deleverage / emergency unwind</strong> safely exit; Aave&apos;s health-factor check is the backstop.</li>
      </ol>
      <h2 className="pt-4 text-xl font-semibold text-white">Two modes</h2>
      <p>
        <strong>Reward-Farming Leverage (v1, single-asset)</strong> — mechanically loops, but same-asset
        carry is negative; only profitable with incentive rewards. The dashboard warns you when carry is
        negative.
      </p>
      <p>
        <strong>Self-Repaying (v2, yield-differential)</strong> — supply a yield-bearing asset (wstETH),
        borrow its base (WETH) in e-mode; positive carry means the debt self-repays over time.
      </p>
      <p className="pt-4 text-sm text-neutral-500">
        Read the <a className="text-emerald-400" href="/docs/leverage-math">leverage math</a> next.
      </p>
    </>
  );
}
