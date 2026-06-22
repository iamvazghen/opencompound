// Network + contract addresses. Vault address comes from env after you deploy
// (see contracts/ deploy script). Zero-address fallback => dashboard shows
// "not deployed on this network" instead of crashing.
import { sepolia, baseSepolia, base, mainnet } from "@reown/appkit/networks";

export const ZERO = "0x0000000000000000000000000000000000000000" as const;

// Aave V3 Pool per chain (official deployments) — testnets + mainnets.
export const AAVE_POOL: Record<number, `0x${string}`> = {
  [sepolia.id]: "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951",
  [baseSepolia.id]: "0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b",
  [base.id]: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
  [mainnet.id]: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
};

export type VaultVersion = "v1" | "v2";

// v1 is asset-agnostic — the SAME contract works for any Aave-listed asset (ETH, USDC,
// BTC, USDT, …); you just deploy one vault per asset. This registry lists the v1 vaults
// deployed per chain. Add a row after deploying a new-asset vault.
export type V1Market = { symbol: string; asset: `0x${string}`; vault: `0x${string}`; decimals: number };

export const V1_MARKETS: Record<number, V1Market[]> = {
  // Mainnet markets ([base.id], [mainnet.id]) get added here once their vaults are deployed.
  [baseSepolia.id]: [
    {
      symbol: "WETH",
      asset: "0x4200000000000000000000000000000000000006",
      vault: "0x4b2786AA5a25Caf2EC8bD04ec47313962Bf9Db2A",
      decimals: 18,
    },
    {
      symbol: "USDC",
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      vault: "0x47076D93c063A30F28168c9590Ac58D4a69dCFBe",
      decimals: 6,
    },
  ],
};

// Mainnet assets v1 supports once a vault is deployed (Aave lists all of these on L1/L2s).
// Shown in the UI as "deploy to enable" on chains where no vault exists yet.
export const V1_SUPPORTED_ASSETS = ["WETH", "USDC", "USDT", "WBTC", "DAI", "wstETH"];

export function v1Markets(chainId: number): V1Market[] {
  return V1_MARKETS[chainId] || [];
}

// v2 (wstETH/WETH) — single market per chain, from env after deploy.
export function vaultAddress(chainId: number, version: VaultVersion = "v1"): `0x${string}` {
  const key = `NEXT_PUBLIC_VAULT_${version.toUpperCase()}_${chainId}` as keyof typeof process.env;
  return (process.env[key] as `0x${string}`) || ZERO;
}

export function aavePool(chainId: number): `0x${string}` {
  return AAVE_POOL[chainId] || ZERO;
}

export const SUPPORTED = [base, mainnet, baseSepolia, sepolia] as const;

const EXPLORER: Record<number, string> = {
  [base.id]: "https://basescan.org",
  [mainnet.id]: "https://etherscan.io",
  [baseSepolia.id]: "https://sepolia.basescan.org",
  [sepolia.id]: "https://sepolia.etherscan.io",
};
export function explorerBase(chainId: number): string {
  return EXPLORER[chainId] ?? "https://etherscan.io";
}

// Aave's app, deep-linked to the right market. Note: Aave shows the CONNECTED wallet's position —
// the vault's position lives under the vault address, so verify the vault on the block explorer
// (its aToken / debt-token holdings) rather than via Aave's UI.
const AAVE_MARKET: Record<number, string> = {
  [base.id]: "proto_base_v3",
  [mainnet.id]: "proto_mainnet_v3",
  [baseSepolia.id]: "proto_base_sepolia_v3",
  [sepolia.id]: "proto_sepolia_v3",
};
export function aaveMarketUrl(chainId: number): string {
  return `https://app.aave.com/?marketName=${AAVE_MARKET[chainId] ?? "proto_mainnet_v3"}`;
}
