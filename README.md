# OpenCompound

**A strategy & automation layer for on-chain credit — built on top of Aave V3.**

OpenCompound turns the raw supply/borrow primitives of a lending market into managed, self-repaying
positions: leverage in one transaction, draw tax-free liquidity against assets you keep, and let an
on-chain math engine hold your loan-to-value in the self-repaying zone — automatically, and
permissionlessly.

🔗 **Live demo:** https://opencompound.vercel.app · **Source:** https://github.com/iamvazghen/opencompound

> ⚠️ **Educational / portfolio project. NOT audited. Testnet only** (Base Sepolia + Ethereum Sepolia).
> Leveraged DeFi positions can be liquidated. Smart-contract bugs can lose funds. Not financial advice.

---

## The thesis: lending needs a layer above the lending market

Think of on-chain credit as a stack:

- **Base layer — Aave (and peers).** This is the trust-minimized settlement layer for credit:
  audited, deeply liquid, battle-tested risk parameters, oracle-priced collateral, and a
  health-factor invariant that protects every lender. It answers *“can this loan exist safely?”* It
  does **not** answer *“is this loan being managed well?”* — that's left to each user.

- **Strategy layer — OpenCompound.** Sitting on top, OpenCompound is the layer that manages the
  position *well*. The average user supplies and borrows by hand, eyeballs their LTV, forgets to
  rebalance, and gets liquidated in a wick. OpenCompound replaces that with an **algorithmic,
  math-driven** controller: it computes the break-even and the live safe ceiling from on-chain
  rates, reaches an exact target leverage in a single flash-loan transaction, unwinds proportionally
  on exit, and exposes a permissionless guard that anyone (or a keeper) can call to pull a drifting
  position back from liquidation.

Aave gives you **safety and liquidity**. OpenCompound gives you **execution and optimization** on top
of it — the difference between holding a position and *running* one. The base layer stays the source
of truth and custody; OpenCompound never holds idle user funds outside the protocol it builds on.

### Why this helps the wider DeFi ecosystem

- **Composability, not fragmentation.** OpenCompound adds capability *on top of* existing liquidity
  instead of forking it. Every position is a real Aave position — it deepens Aave's TVL and fee flow
  rather than competing with it.
- **Capital efficiency for everyone.** Flash-loan entry, proportional flash-exit, and a live
  break-even read give a retail user the same execution quality a quant desk would build in-house.
- **A safety layer.** Dynamic, non-hardcoded guardrails (computed from each asset's *live* Aave
  liquidation threshold) plus a permissionless `guard()` reduce the population of carelessly-managed,
  liquidation-prone positions — which is good for borrowers, lenders, and the protocol's risk surface.
- **Tax-aware liquidity.** Borrowing against an asset is not a disposal. OpenCompound makes
  "spend without selling, and let the yield repay it" a one-click, self-managed product.

---

## What it actually does

Two models, sharing one math engine:

| Model | Who controls it | What it's for |
|------|-----------------|---------------|
| **Pooled vaults** (ERC-4626) | governance sets the strategy; users are LPs | deposit into a shared, professionally-parameterised self-repaying / leveraged-staking position and earn the managed carry |
| **Isolated positions** (per-user clones) | the user owns their own Aave account | run your *own* leverage, manage your *own* LTV, and **draw tax-free cash** from your own position — fully isolated from everyone else |

### Pooled vaults
- **v1 — single-asset, self-repaying.** Supply X, borrow X, re-supply at a managed LTV. No net price
  exposure (collateral and debt cancel), but the rate spread makes net interest **positive below
  break-even**, so the loan self-repays. Asset-agnostic (ETH, BTC, USDC, USDT, …).
- **v2 — yield-differential (leveraged staking).** Supply wstETH, borrow WETH in e-mode, loop. Staking
  yield beats the borrow cost, so the position carries positive and self-compounds.

### Isolated per-user positions
Each user gets their own Aave account (an EIP-1167 clone from `PositionFactory`). They can `deposit`,
`leverage` (loop, capped at 5), **`drawLiquidity`** (borrow cash to their wallet — a loan, not a sale,
so no taxable event — capped at the live safe LTV), `repay`, `withdraw`, one-shot `close`, and rely on
a permissionless `guard()`. The dashboard shows `drawableSelfRepaying` — exactly how much cash you can
take while the yield still pays it back.

---

## The math engine (why it's "superior to the average user")

For collateral `C`, debt `D`, LTV `L = D/C`, supply APR `s`, borrow APR `b`, equity `E`:

```
net interest  =  E · (s − b·L) / (1 − L)        ← positive ⇒ the position self-repays
break-even LTV =  s / b                          ← stay below this and yield > interest
safe LTV       =  liquidationThreshold · buffer  ← live from Aave, never hardcoded
```

All three are computed **on-chain from live Aave rates** and surfaced in the UI in real time
(auto-refreshed). The contracts use these — not magic numbers — to gate leverage, size the safe
cash-draw, and trigger the guard. See **`FINANCIAL-REVIEW.md`** for the full derivation and
**`DEPLOYMENT.md`** to deploy.

---

## Repository

```
OpenCompound/
├── contracts/                 Foundry — vaults, isolated positions, math, tests
│   ├── src/
│   │   ├── LeveragedSelfRepayingVault.sol   v1 pooled, single-asset, self-repaying
│   │   ├── YieldDifferentialVault.sol       v2 pooled, wstETH/WETH leveraged staking
│   │   ├── LeveragePosition.sol             isolated per-user position (loop + draw cash)
│   │   ├── PositionFactory.sol              one isolated clone per user/asset
│   │   └── libraries/CarryMath.sol          break-even / net-carry / recommended-LTV
│   ├── script/                Deploy.s.sol · DeployV2.s.sol · DeployFactory.s.sol
│   └── test/                  unit · invariant · mainnet-fork
├── web/                       Next.js dashboard, landing, docs, roadmap
├── FINANCIAL-REVIEW.md        viability analysis & math
├── DEPLOYMENT.md              on-chain + Vercel deploy guide + go-live checklist
└── ROADMAP.md                 the four-phase plan (also rendered at /roadmap)
```

## Getting started

```bash
# contracts
cd contracts && forge build && forge test          # 47 unit/invariant green
FORK_RPC_URL=<mainnet RPC> forge test --match-path "test/fork/*"   # 6 live-fork tests

# web
cd web && cp .env.example .env.local               # set Reown projectId + ALCHEMY_API_KEY
npm install && npm run dev                          # http://localhost:3000
```

## Testing

- **47 unit + invariant tests** (deposit/withdraw, leverage loop & flash, proportional unwind,
  ERC-4626 inflation/donation hardening, supply-cap limits, oracle/MEV guards, isolated-position
  isolation + cash-draw, fuzz, and stateful invariants: never-insolvent, shares-always-backed,
  LTV-ceiling).
- **6 mainnet-fork tests** against real Aave V3 + Uniswap V3 (both pooled vaults), verified live.
- Both pooled vaults and the isolated position have been exercised end-to-end on Base Sepolia.

## Tech stack

**Contracts:** Solidity 0.8.33 · Foundry · Aave V3 · Uniswap V3 (SwapRouter02) · OpenZeppelin v5 (ERC-4626, Clones)
**Frontend:** Next.js 16 (App Router) · TypeScript · Tailwind v4 · Reown AppKit · wagmi v3 · viem · TanStack Query
**Infra:** Vercel · server-side RPC proxy (key off the client) · live-rate auto-refresh

## Roadmap (four phases)

1. **Mainnet** — audit, multisig/timelock ownership, keeper automation, and deploy the vaults +
   `PositionFactory` to mainnet (Base first).
2. **More assets** — a vault and isolated-position market for every major Aave reserve
   (WBTC, USDT, DAI, wstETH, …) on each chain.
3. **More base protocols** — extend the strategy layer beyond Aave to Compound, Morpho, Spark and
   others, routing each position to the best available terms.
4. **DEXes + Ondo Finance** — turn drawn liquidity into productive capital: per chain, integrate ≥1
   DEX (ideally 2+) so cash can flow straight into LPs, plus an Ondo bridge so it can buy tokenized
   **RWA** (e.g. treasuries). Users still choose to just withdraw to their wallet — but if they
   deploy it, that yield both smooths the investing experience and **adds a second layer of
   protection** for the underlying Aave position by generating income that can service the debt.

The full four-phase plan is rendered in the app at **`/roadmap`** and in **`ROADMAP.md`**.

## Security

Not audited — testnet only. Mitigations in place: `nonReentrant` / manual reentrancy locks on every
state-changing path, pausable pooled vaults, owner-gated vault strategy, per-user ownership on
isolated positions, ERC-4626 virtual-shares hardening, dynamic (live) safe-LTV guardrails, oracle
sanity checks, and Aave's own health-factor invariant on every borrow/withdraw. Contracts are
size-optimised under EIP-170. **Do not deploy to mainnet with real funds without a professional audit,
a multisig owner, and keeper automation** — see the go-live checklist in `DEPLOYMENT.md`.
