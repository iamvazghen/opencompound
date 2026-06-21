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

// Our vault, once deployed. Set NEXT_PUBLIC_VAULT_ADDRESS_<chainId> in .env.local.
export function vaultAddress(chainId: number): `0x${string}` {
  const env =
    process.env[`NEXT_PUBLIC_VAULT_ADDRESS_${chainId}` as keyof typeof process.env];
  return (env as `0x${string}`) || ZERO;
}

export function aavePool(chainId: number): `0x${string}` {
  return AAVE_POOL[chainId] || ZERO;
}

export const SUPPORTED = [sepolia, baseSepolia] as const;
