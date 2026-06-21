export default function Risks() {
  return (
    <>
      <h1 className="text-3xl font-bold text-white">Risks &amp; liquidation</h1>
      <ul className="list-disc space-y-3 pl-5">
        <li>
          <strong>Liquidation.</strong> If your health factor falls below 1.0, Aave liquidates your
          collateral at a penalty. Leverage shrinks the buffer — higher LTV, closer to liquidation.
        </li>
        <li>
          <strong>Negative carry (v1).</strong> Same-asset loops bleed the supply/borrow spread every
          block. Without rewards exceeding the spread, you lose money guaranteed. The dashboard shows
          live net carry.
        </li>
        <li>
          <strong>Depeg (v2).</strong> wstETH can trade below its ETH value during withdrawal-queue
          stress, pushing a &quot;correlated&quot; position toward liquidation.
        </li>
        <li>
          <strong>Rate risk.</strong> A spike in the borrow rate can flip positive carry negative; the
          position must be unwound or it slowly bleeds.
        </li>
        <li>
          <strong>Smart-contract risk.</strong> Not audited. Testnet only. Bugs can lose funds.
        </li>
      </ul>
      <h2 className="pt-4 text-xl font-semibold text-white">Mitigations in the contract</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li><code>nonReentrant</code> on every state-changing path; <code>Pausable</code> kill-switch.</li>
        <li>Hard ceilings: LTV ≤ 90%, cycles ≤ 10, enforced regardless of config.</li>
        <li>Aave reverts any withdraw/borrow that would break the health factor.</li>
        <li><code>emergencyUnwind()</code> repays all debt and returns collateral to the owner.</li>
      </ul>
    </>
  );
}
