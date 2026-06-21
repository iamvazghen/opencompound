export default function SelfRepay() {
  return (
    <>
      <h1 className="text-3xl font-bold text-white">Self-repay mechanics</h1>
      <p>
        &quot;Self-repaying&quot; means yield pays down your debt without you adding funds. It only exists
        when there is a positive income source. There are exactly two on Aave:
      </p>
      <h2 className="pt-4 text-xl font-semibold text-white">1. Net interest below break-even (v1, single-asset)</h2>
      <p>
        Supply yield is earned on the collateral; borrow interest on the (smaller) debt. Net interest
        is <code>E·(s − b·L)/(1 − L)</code>, <strong>positive while LTV &lt; s/b</strong> — the
        break-even. Example: supply 2%, borrow 4% → break-even 50%; at 40% LTV the collateral yield
        exceeds the debt interest, equity grows, and the loan repays itself. On Aave{" "}
        <code>s = b·utilization·(1 − reserveFactor)</code>, so break-even ≈ 40–70%. The vault exposes{" "}
        <code>breakEvenLtvBps()</code> and <code>isSelfRepaying()</code>; the dashboard keeps you below
        it. Incentive rewards (Aave Merit, LM) stack on top via <code>harvestAndRepay()</code>.
      </p>
      <h2 className="pt-4 text-xl font-semibold text-white">2. Yield differential (v2, wstETH / WETH)</h2>
      <p>
        Supply a yield-bearing asset that out-earns its borrow base. wstETH appreciates vs ETH via the
        staking exchange rate (~3–4%/yr); borrowing WETH costs ~2–3%. Net carry is positive, so the
        collateral value outgrows the debt and the position <strong>deleverages itself</strong> over
        time. This is the genuine self-repaying mode.
      </p>
      <h2 className="pt-4 text-xl font-semibold text-white">Why not Alchemix-style?</h2>
      <p>
        Alchemix mints a 0%-interest synthetic repaid by external yield — no liquidation. On Aave we
        borrow at a real, positive interest rate, so we can&apos;t replicate that guarantee. The closest
        honest analog is the positive-carry drift above.
      </p>
    </>
  );
}
