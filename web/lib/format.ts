// Aave base-currency values are 8-decimal; health factor and rates are scaled below.
export const fmtUsd = (base8: bigint) =>
  `$${(Number(base8) / 1e8).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

// Health factor is 1e18-scaled; uint max means "no debt".
export const fmtHealth = (hf: bigint) =>
  hf > 10n ** 30n ? "∞" : (Number(hf) / 1e18).toFixed(2);

// Aave rates are in ray (1e27). Return a percentage number.
export const rayToPct = (ray: bigint) => (Number(ray) / 1e27) * 100;

export const fmtPct = (n: number, dp = 2) => `${n.toFixed(dp)}%`;
