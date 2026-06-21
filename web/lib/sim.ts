// Position simulator — mirrors the on-chain leverage loop (see contract test
// test_LeverageLoopsToTargetExposure). Pure + deterministic so the UI can preview
// "deposit X, N cycles at L% LTV" before any transaction.

export type SimResult = {
  supplied: number; // gross collateral on Aave
  debt: number; // total borrowed
  equity: number; // supplied - debt (== deposit, leverage never changes equity)
  leverage: number; // supplied / equity
  endLtv: number; // debt / supplied, as a fraction
};

export function simulate(deposit: number, cycles: number, ltvBps: number): SimResult {
  const r = ltvBps / 10_000;
  let supplied = deposit;
  let debt = 0;
  for (let i = 0; i < cycles; i++) {
    const borrow = supplied * r - debt; // borrow up to target LTV against current collateral
    if (borrow <= 0) break;
    debt += borrow;
    supplied += borrow;
  }
  const equity = supplied - debt;
  return {
    supplied,
    debt,
    equity,
    leverage: equity > 0 ? supplied / equity : 0,
    endLtv: supplied > 0 ? debt / supplied : 0,
  };
}

// Risk presets — map a one-word risk appetite to concrete strategy params, instead of
// making users reason in raw LTV/cycle numbers (pattern borrowed from vault-strategy's tiers).
export type RiskPreset = { key: string; label: string; ltvBps: number; cycles: number; slippageBps: number };
export const RISK_PRESETS: RiskPreset[] = [
  { key: "conservative", label: "Conservative", ltvBps: 5000, cycles: 2, slippageBps: 30 },
  { key: "balanced", label: "Balanced", ltvBps: 7000, cycles: 4, slippageBps: 50 },
  { key: "aggressive", label: "Aggressive", ltvBps: 8500, cycles: 6, slippageBps: 100 },
];

// Net carry for a single-asset loop, on the looped (borrowed) notional.
// Always negative for one asset (supply rate < borrow rate). Positive only with rewards.
export function netCarryPct(supplyRatePct: number, borrowRatePct: number) {
  return supplyRatePct - borrowRatePct;
}
