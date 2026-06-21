# OpenCompound Roadmap

Status legend: ✅ done · 🔨 in progress · 🔜 next · 💤 later

## Phase 0 — Foundation ✅
- ✅ Monorepo on `D:\OpenCompound` (`contracts/`, `web/`, `reference/`).
- ✅ Foundry project, OpenZeppelin v5, minimal hand-rolled Aave V3 interfaces.
- ✅ Reference repos cloned: `aave-vault`, Alchemix `v2-foundry`, `vault-strategy`.

## Phase 1 — Core contract (v1, single-asset) ✅
- ✅ `LeveragedSelfRepayingVault` — ERC-4626, deposit auto-supplies to Aave.
- ✅ `leverage()` loop to target LTV × max cycles; `deleverage()` / `emergencyUnwind()`.
- ✅ `harvestAndRepay()` self-repay sink from idle/reward balance.
- ✅ Risk views: `healthFactor()`, `currentLtvBps()`. Guards + hard ceilings.
- ✅ 5 passing tests against a mock Aave pool.

## Phase 2 — Mainnet-fork hardening 🔜
- 🔜 Fork tests against **real Aave V3** (Sepolia/Base) — replace the mock pool.
- 🔜 Wire Aave `RewardsController` directly into `harvestAndRepay()` (claim on-chain, drop the off-chain keeper step).
- 🔜 Deploy script + addresses config per network; verify on Etherscan.
- 🔜 Proportional `redeemAndUnwind` so a leveraged user can exit in one tx (flash-loan-assisted unwind).
- 💤 Fee switch (performance fee on harvested rewards).

## Phase 3 — Frontend scaffold ✅
- ✅ `create-next-app` (TS, Tailwind, App Router) in `web/` (Next 16 / React 19).
- ✅ **Reown AppKit** (`createAppKit` + `WagmiAdapter`) + wagmi + viem + react-query; testnet networks (Sepolia, Base Sepolia); typed vault ABI extracted from `forge build` artifacts.
- ✅ Dark finance theme. Turbopack optional-dep aliases (matched IceSwap's fix). `npm run build` green.
- ✅ Routing: `/` landing → `/app` dashboard → `/docs`.

## Phase 4 — Dashboard ✅
- ✅ Connect wallet (Reown); **auto-detect existing Aave position** via `getUserAccountData`.
- ✅ Mode toggle: Reward-Farming Leverage vs Self-Repaying.
- ✅ Position simulator (`lib/sim.ts`, self-checked against on-chain math): deposit → exposure/debt/equity/leverage at N cycles × LTV.
- ✅ Live health-factor + current LTV; **net-carry warning** that flags negative-carry loops.
- ✅ Actions wired to vault: deposit (approve+deposit), leverage, harvest, deleverage, emergency unwind.
- 💤 Per-asset position breakdown (UiPoolDataProvider) + tx history. Supabase only if a server need appears.

## Phase 5 — Landing + docs ✅
- ✅ Landing: hero, honest-economics explainer, two-mode pitch, CTA → dashboard, link → docs.
- ✅ Docs: overview, leverage math, self-repay mechanics, risks/liquidation, contract reference, FAQ.
- ✅ Foundry deploy script (`script/Deploy.s.sol`) — deploy the vault, then wire its address into the dashboard env.

## Phase 6 — v2 yield-differential vault ✅
- ✅ `YieldDifferentialVault`: two-asset, supply **wstETH** / borrow **WETH** in e-mode — real positive carry.
- ✅ Oracle-based `totalAssets` (net equity in collateral units via Aave price oracle).
- ✅ Iterative `leverage()` + Uniswap-v3 swaps; `deleverage()`, `rebalance()`, `emergencyUnwind()`.
- ✅ **`leverageFlash()`** — Aave flash-loan one-shot leverage to exact target LTV (Alchemix pattern). 6 tests green.
- ✅ Self-repay corrected to **passive equity compounding** (appreciation = equity, not free cash).
- 💤 Keeper automation (Gelato / Chainlink Automation) for scheduled `rebalance()`.

## Phase 7 — Refinements backlog (from REFINEMENTS.md) 💤
- 💤 On-chain Merkl reward claim for v1 (claim + balance-delta + swap→repay).
- 💤 Performance fee (yield-checkpoint pattern from Aave's ATokenVault).
- 💤 Supply-cap-aware `maxDeposit` / withdrawable-aware `maxWithdraw`.
- 💤 Dashboard risk presets (conservative/balanced/aggressive) + wire `leverageFlash` + v2 vault into the UI.

## Phase 8 — Polish 💤
- 💤 Subgraph for history/analytics. Mainnet-fork test suite. Audit prep. Mainnet only after audit.

---

### Decisions on record
- **Single-asset first.** Matches the original "supply ETH / borrow ETH" spec and keeps ERC-4626 accounting honest.
- **No false self-repay math.** Same-asset is negative carry; v1 self-repays from rewards, v2 from a yield differential. See README.
- **Supabase deferred.** No server-side need yet; on-chain reads + event logs cover the dashboard. Add only when a real need appears.
