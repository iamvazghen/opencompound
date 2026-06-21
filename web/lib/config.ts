// Network + contract addresses. Vault address comes from env after you deploy
// (see contracts/ deploy script). Zero-address fallback => dashboard shows
// "not deployed on this network" instead of crashing.
import { sepolia, baseSepolia } from "@reown/appkit/networks";

export const ZERO = "0x0000000000000000000000000000000000000000" as const;

// Aave V3 Pool per testnet (official deployments).
export const AAVE_POOL: Record<number, `0x${string}`> = {
  [sepolia.id]: "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951",
  [baseSepolia.id]: "0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b",
};

export type VaultVersion = "v1" | "v2";

// v1 is asset-agnostic — the SAME contract works for any Aave-listed asset (ETH, USDC,
// BTC, USDT, …); you just deploy one vault per asset. This registry lists the v1 vaults
// deployed per chain. Add a row after deploying a new-asset vault.
export type V1Market = { symbol: string; asset: `0x${string}`; vault: `0x${string}`; decimals: number };

export const V1_MARKETS: Record<number, V1Market[]> = {
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

export const SUPPORTED = [sepolia, baseSepolia] as const;

export function explorerBase(chainId: number): string {
  return chainId === baseSepolia.id ? "https://sepolia.basescan.org" : "https://sepolia.etherscan.io";
}

// Aave's testnet app, deep-linked to the right market. Note: Aave shows the CONNECTED
// wallet's position — the vault's position lives under the vault address, so verify the
// vault on the block explorer (its aToken / debt-token holdings) rather than via Aave's UI.
export function aaveMarketUrl(chainId: number): string {
  const market = chainId === baseSepolia.id ? "proto_base_sepolia_v3" : "proto_sepolia_v3";
  return `https://app.aave.com/?marketName=${market}`;
}
