export default function Guardrails() {
  return (
    <>
      <h1 className="text-3xl font-bold text-white">Guardrails &amp; safety</h1>
      <p>
        Leverage carries liquidation risk. OpenCompound layers several guardrails so a position
        doesn&apos;t silently drift into danger while you&apos;re away — though none can defeat an
        instant market crash.
      </p>

      <h2 className="pt-4 text-xl font-semibold text-white">Static guards (always on)</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li><strong>Hard ceilings</strong> — target LTV and cycle count are capped in the contract (≤ 90% / ≤ 10 cycles for v1, ≤ 93% for v2), enforced regardless of settings.</li>
        <li><strong>Reentrancy + pause</strong> — every state-changing call is <code>nonReentrant</code>; the owner can <code>pause</code> the vault in an emergency.</li>
        <li><strong>Aave&apos;s own engine</strong> — Aave rejects any borrow or withdrawal that would push the health factor below 1, and runs its liquidation system as the backstop.</li>
      </ul>

      <h2 className="pt-4 text-xl font-semibold text-white">The permissionless guard (the active guardian)</h2>
      <p>
        Static caps don&apos;t help if LTV <em>drifts up</em> after you set it. So both vaults expose a{" "}
        <strong><code>guard()</code></strong> function with two key properties:
      </p>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <strong>Permissionless</strong> — anyone can call it, so a keeper bot (or even another user)
          can protect your position when you&apos;re not watching. You don&apos;t have to be online.
        </li>
        <li>
          <strong>Only acts when unsafe</strong> — it reverts unless LTV has risen above the configurable{" "}
          <strong>Safe LTV</strong> ceiling. When it does fire, it deleverages the position straight back
          to target. Because it can only ever <em>reduce</em> risk, an attacker can&apos;t grief a
          healthy position with it.
        </li>
      </ul>
      <p>
        For v1 (same asset) the guard needs no swap, so it&apos;s cheap and reliable. For v2 it swaps
        collateral to debt to repay, like a normal deleverage.
      </p>

      <h2 className="pt-4 text-xl font-semibold text-white">Why LTV drifts in the first place</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <strong>v1 — slow rate creep.</strong> Debt accrues at the borrow rate, collateral at the
          slower supply rate, so even with no price move the LTV inches up over time. It&apos;s gradual,
          but over long periods (or if rates spike) it matters — which is exactly what the guard handles.
        </li>
        <li>
          <strong>v2 — de-peg / rate shock.</strong> A wstETH/WETH wobble or a borrow-rate spike can move
          LTV faster. The guard (and the keeper-callable <code>rebalance</code>) pull it back to target.
        </li>
      </ul>

      <h2 className="pt-4 text-xl font-semibold text-white">Automation</h2>
      <p>
        The guard is the on-chain hook; making it <em>automatic</em> means having something call it on a
        schedule or when LTV crosses the line. That&apos;s a keeper — Gelato, Chainlink Automation, or a
        simple bot — wired at deploy time to watch the Safe LTV and call <code>guard()</code>. Until a
        keeper is attached, the guard is available for anyone to call manually (including from the
        dashboard&apos;s Guard button).
      </p>

      <h2 className="pt-4 text-xl font-semibold text-white">What it can&apos;t do</h2>
      <p>
        No guardrail is absolute. A sudden, large price crash can move a position from healthy to
        liquidatable within a single block, before any keeper can react — this is inherent to all
        leveraged DeFi. Keep a conservative LTV, lean on v1&apos;s self-repaying band, and treat the
        guard as risk reduction, not a guarantee. This is a testnet / educational project and is not
        audited.
      </p>
    </>
  );
}
