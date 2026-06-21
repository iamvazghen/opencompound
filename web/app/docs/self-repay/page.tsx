export default function SelfRepay() {
  return (
    <>
      <h1 className="text-3xl font-bold text-white">Self-repay mechanics</h1>
      <p>
        &quot;Self-repaying&quot; means yield pays down your debt without you adding funds. It only exists
        when there is a positive income source. There are exactly two on Aave:
      </p>
      <h2 className="pt-4 text-xl font-semibold text-white">1. Reward incentives (v1, single-asset)</h2>
      <p>
        Same-asset carry is <strong>negative</strong>: on Aave the borrow APY always exceeds the supply
        APY, so supplied interest can never cover borrow interest — the original &quot;surplus interest&quot;
        idea is mathematically impossible for one asset. The only positive source is reward tokens
        (Aave Merit, LM campaigns). A keeper claims them, swaps to the underlying, and{" "}
        <code>harvestAndRepay()</code> routes them into debt. Profitable iff{" "}
        <code>supply + reward − borrow &gt; 0</code>.
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
