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

## Phase 3 — Frontend scaffold 🔜
- 🔜 `create-next-app` (TS, Tailwind, App Router) in `web/`.
- 🔜 wagmi + viem + RainbowKit; network = testnet; typed vault ABI from `forge build` artifacts.
- 🔜 shadcn/ui + dark finance theme.
- 🔜 Routing: `/` landing → `/app` dashboard → `/docs`.

## Phase 4 — Dashboard 🔜
- 🔜 Connect wallet; **auto-detect existing Aave positions** via `getUserAccountData` + reserve data.
- 🔜 Mode toggle: **Leverage** vs **Self-Repaying**.
- 🔜 Position simulator: deposit → exposure after N cycles at chosen LTV → projected debt/equity.
- 🔜 Live health-factor + liquidation-risk indicator; current LTV gauge.
- 🔜 Actions wired to vault: deposit, leverage, harvest, deleverage, emergency unwind.
- 💤 Transaction history (event indexing; Supabase optional, only if a server need appears).

## Phase 5 — Landing + docs 🔜
- 🔜 Landing: hero, the honest-economics explainer, two-mode pitch, CTA → dashboard, link → docs.
- 🔜 Docs pages: how it works, leverage math, self-repay mechanics, risks/liquidation, contract reference, FAQ.

## Phase 6 — v2 yield-differential mode 💤
- 💤 Two-asset vault: supply **wstETH**, borrow **WETH**, e-mode — real positive carry.
- 💤 Oracle-based `totalAssets` (net equity across two assets).
- 💤 Keeper automation (Gelato / Chainlink Automation) for scheduled harvest + rebalance.

## Phase 7 — Polish 💤
- 💤 Subgraph for history/analytics. Audit prep. Mainnet only after audit.

---

### Decisions on record
- **Single-asset first.** Matches the original "supply ETH / borrow ETH" spec and keeps ERC-4626 accounting honest.
- **No false self-repay math.** Same-asset is negative carry; v1 self-repays from rewards, v2 from a yield differential. See README.
- **Supabase deferred.** No server-side need yet; on-chain reads + event logs cover the dashboard. Add only when a real need appears.
