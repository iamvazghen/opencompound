# Roadmap

OpenCompound is the **strategy layer** above on-chain credit. Aave (and peers) provide the
trust-minimised base layer for supplying and borrowing; OpenCompound manages those positions
algorithmically — reaching exact leverage in one transaction, holding LTV in the self-repaying zone
from live rates, and letting users draw tax-free liquidity they actually control.

This is the product roadmap. It's rendered in the app at **`/roadmap`**.

> Forward-looking, not a commitment. OpenCompound is currently testnet-only and unaudited.

## Phase 1 — Mainnet  *(up next)*
- Professional security audit + public bug bounty.
- Ownership → Safe multisig / timelock (no single-EOA control).
- Keeper automation for `guard()` / `rebalance()` (Gelato / Chainlink).
- Deploy the pooled vaults + `PositionFactory` to mainnet — Base first, then Ethereum and L2s.

## Phase 2 — More assets
- A vault and an isolated-position market for every major Aave reserve (WBTC, USDT, DAI, wstETH, cbETH, …).
- The same self-repaying / leveraged-staking strategies across the full asset list.
- Per-asset live break-even and safe-LTV, parameterised from each reserve's real rates.

## Phase 3 — More base protocols
- Extend beyond Aave: Compound, Morpho, Spark, and others.
- The layer becomes protocol-agnostic, routing each position to the best supply/borrow terms and caps.
- More base liquidity → deeper, safer, more efficient positions.

## Phase 4 — DEXes + Ondo Finance (RWA)
- Per chain, integrate at least one DEX (ideally 2+) so drawn liquidity can flow straight into LP positions.
- An Ondo Finance bridge to acquire tokenized real-world assets (RWA, e.g. treasuries) with drawn cash.
- Drawing cash stays optional — withdraw to your wallet as today.
- If deployed, the yield makes investing seamless **and adds a second layer of protection** for the
  underlying Aave position by generating income that can service the debt.

---

## Current status (testnet)
- ✅ v1 pooled vault (single-asset, self-repaying) — live on Base Sepolia, mainnet-fork tested.
- ✅ v2 pooled vault (wstETH/WETH leveraged staking) — mainnet-fork tested.
- ✅ Isolated per-user positions + `PositionFactory` — live on Base Sepolia, cash-draw verified.
- ✅ Dashboard (pooled LP console + "My Position" isolated panel), live rates, docs, legal, deployed to Vercel.
- 47 unit/invariant + 6 mainnet-fork tests green. See `DEPLOYMENT.md` for the go-live checklist.
