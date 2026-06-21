const fns: [string, string][] = [
  ["deposit(assets, receiver)", "ERC-4626 deposit; auto-supplies the underlying to Aave and mints shares."],
  ["leverage()", "Loops borrow→re-supply up to maxCycles at targetLtvBps. Owner-only."],
  ["deleverage(amount)", "Withdraw collateral and repay `amount` of debt (max = full unwind). Owner-only."],
  ["harvestAndRepay()", "Repays debt from idle underlying in the vault (claimed rewards). Anyone can call."],
  ["emergencyUnwind()", "Repay all debt, return all collateral to owner. Owner-only break-glass."],
  ["setStrategy(ltvBps, cycles)", "Update target LTV / max cycles, within hard ceilings (90% / 10). Owner-only."],
  ["setEMode(categoryId)", "Opt the vault into an Aave e-mode category. Owner-only."],
  ["totalAssets()", "Net equity = aToken balance − variable-debt balance."],
  ["healthFactor()", "Aave health factor, 1e18-scaled. < 1e18 is liquidatable."],
  ["currentLtvBps()", "Vault position LTV in basis points."],
  ["currentRates()", "(supplyRateRay, borrowRateRay) — used to surface net carry."],
];

export default function ContractRef() {
  return (
    <>
      <h1 className="text-3xl font-bold text-white">Contract reference</h1>
      <p><code>LeveragedSelfRepayingVault</code> — ERC-4626, single-asset (collateral == debt == asset).
        Ownable · Pausable · ReentrancyGuard.</p>
      <table className="w-full text-sm">
        <thead className="text-neutral-500"><tr><th className="text-left">Function</th><th className="text-left">Description</th></tr></thead>
        <tbody>
          {fns.map(([sig, desc]) => (
            <tr key={sig} className="border-t border-neutral-800 align-top">
              <td className="py-2 pr-4 font-mono text-emerald-300">{sig}</td>
              <td className="py-2 text-neutral-400">{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-sm text-neutral-500">Source: <code>contracts/src/LeveragedSelfRepayingVault.sol</code>. Tests: <code>forge test</code> (6 passing).</p>
    </>
  );
}
