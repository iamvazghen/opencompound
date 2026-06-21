export default function LeverageMath() {
  return (
    <>
      <h1 className="text-3xl font-bold text-white">Leverage math</h1>
      <p>
        Each cycle borrows up to the target LTV against current collateral and re-supplies it. With
        deposit <code>D</code>, LTV fraction <code>r</code>, and <code>n</code> cycles:
      </p>
      <pre className="overflow-x-auto rounded bg-neutral-900 p-4 text-sm text-emerald-300">
{`supplied = D · (1 + r + r² + … + rⁿ)
debt     = D · (r + r² + … + rⁿ)
equity   = supplied − debt = D   (always)
max leverage (n→∞) = 1 / (1 − r)`}
      </pre>
      <p>At 70% LTV over 4 cycles, starting from 1 unit:</p>
      <table className="w-full text-sm">
        <thead className="text-neutral-500">
          <tr><th className="text-left">Cycle</th><th className="text-right">Borrow</th><th className="text-right">Supplied</th><th className="text-right">Debt</th></tr>
        </thead>
        <tbody className="font-mono">
          <tr><td>1</td><td className="text-right">0.7000</td><td className="text-right">1.7000</td><td className="text-right">0.7000</td></tr>
          <tr><td>2</td><td className="text-right">0.4900</td><td className="text-right">2.1900</td><td className="text-right">1.1900</td></tr>
          <tr><td>3</td><td className="text-right">0.3430</td><td className="text-right">2.5330</td><td className="text-right">1.5330</td></tr>
          <tr><td>4</td><td className="text-right">0.2401</td><td className="text-right">2.7731</td><td className="text-right">1.7731</td></tr>
        </tbody>
      </table>
      <p>
        Gross exposure is 2.77×; the theoretical max at 70% is 3.33×, so 4 cycles reach ~83% of it.
        Equity stays exactly 1 — <strong>leverage never changes your equity, only gross size.</strong>
      </p>
      <p className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-300">
        Critical: for a <em>same-asset</em> loop, gross exposure is NOT price exposure. You are long
        2.77 and short 1.77 of the same token — net directional exposure equals your equity (1.0). The
        loop amplifies carry, which is net-positive while LTV stays below the break-even (s/b). See
        self-repay mechanics.
      </p>
    </>
  );
}
