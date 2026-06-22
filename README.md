# OpenCompound

**Same-asset leverage + self-repaying vaults on Aave V3.** ERC-4626 vaults, a wallet-connected dashboard that auto-detects your existing Aave positions, a landing page, and protocol docs.

🔗 **Live demo:** https://opencompound.vercel.app · **Source:** https://github.com/iamvazghen/opencompound

> ⚠️ **Educational / portfolio project. NOT audited. Testnet only** (Base Sepolia + Ethereum Sepolia). Leveraged DeFi positions can be liquidated. Smart-contract bugs can lose funds. Not financial advice.

---

## The honest economics (read this first)

A position is **self-repaying while its LTV stays below the break-even LTV = s / b** (supply rate ÷ borrow rate). Below that line, the yield earned on the (larger) collateral exceeds the interest paid on the (smaller) debt — net interest is positive and the loan pays itself down. Above it, the position bleeds. The dashboard plots this break-even live for any asset.

- **v1 — single-asset, self-repaying.** Supply X, borrow X, re-supply at a managed LTV. Same-asset means no net *price* exposure (collateral and debt cancel), but the rate spread still makes net interest **positive below break-even** — so it self-repays through LTV management, with Aave incentive rewards on top. It lets you draw liquidity against an asset you want to keep, with no taxable sale.
- **v2 — yield-differential.** Supply a yield-bearing asset (wstETH), borrow its base (WETH) in e-mode. The staking yield beats the borrow cost, so the position carries positive and the debt self-repays as collateral outgrows it — the real leveraged-staking carry trade.

| Mode | Collateral | Debt | Self-repay source | Status |
|------|-----------|------|-------------------|--------|
| **v1 — single-asset** | any Aave asset | same asset | rate spread below break-even + incentive rewards | ✅ built · live on Base Sepolia · mainnet-fork tested |
| **v2 — yield-differential** | wstETH | WETH | staking yield > borrow cost (e-mode) | ✅ built · mainnet-fork tested |

See **`FINANCIAL-REVIEW.md`** for the full math and **`DEPLOYMENT.md`** for deploying.

---

## What's in the repo

```
OpenCompound/
├── contracts/        Foundry project — vaults + Aave interfaces + tests      ✅ built, 12/12 green
│   ├── src/LeveragedSelfRepayingVault.sol   v1 single-asset (reward-farming)
│   └── src/YieldDifferentialVault.sol       v2 wstETH/WETH + flash-loan leverage
├── web/              Next.js dashboard + landing + docs                      ✅ built, builds clean
├── FINANCIAL-REVIEW.md  Viability analysis of both strategies                ✅
├── REFINEMENTS.md       Repo-review synthesis → applied efficiency changes    ✅
├── reference/        Cloned repos to learn from (git-ignored, not shipped)
│   ├── aave-vault/        Aave's official ERC-4626 vault
│   ├── v2-foundry/        Alchemix — the self-repaying pioneer
│   └── vault-strategy/    Leverage looping + a frontend to mine
├── README.md
└── ROADMAP.md
```

## Smart contract — `LeveragedSelfRepayingVault`

ERC-4626, single-asset (collateral == debt == the deposit token).

- `deposit` / `mint` — auto-supplies the underlying to Aave V3.
- `leverage()` — loops borrow→re-supply up to `maxCycles` (default 4) at `targetLtvBps` (default 7000 = 70%).
- `harvestAndRepay()` — repays debt from any underlying sitting idle in the vault (claimed rewards). The self-repay sink.
- `deleverage(amount)` / `emergencyUnwind()` — unwind safely; Aave's health-factor check is the backstop.
- `healthFactor()` / `currentLtvBps()` — risk views the dashboard reads.
- Guards: `Ownable`, `Pausable`, `ReentrancyGuard`, hard ceilings (LTV ≤ 90%, cycles ≤ 10).

`totalAssets()` = aToken balance − variable-debt balance, so vault shares track **net equity**, not gross exposure.

### Run the contracts

```bash
cd contracts
forge build
forge test          # 5 passing: deposit, leverage loop, harvest, deleverage, strategy guards
```

## Dashboard / landing / docs

Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui + wagmi/viem + RainbowKit.

- **Landing** → links to **Dashboard** and **Docs**.
- **Dashboard** → connect wallet (Reown AppKit) → auto-detect existing Aave positions → toggle **Leverage** vs **Self-Repaying** mode → simulate cycles/LTV → execute via the vault, with live health-factor and a net-carry warning that blocks looping into a guaranteed loss.

### Run the web app

```bash
cd web
cp .env.local.example .env.local   # optional: set your own Reown projectId + vault addresses
npm install
npm run dev                        # http://localhost:3000
```

Wallet connect uses Reown AppKit (`createAppKit` + `WagmiAdapter`), the same proven pattern as the IceSwap app. The WalletConnect projectId is public (domain-restricted, not a secret) with a dev fallback baked in.

## Tech stack

**Contracts:** Solidity 0.8.24+ · Foundry · Aave V3 · OpenZeppelin v5
**Frontend:** Next.js 15 · TypeScript · Tailwind · shadcn/ui · wagmi · viem · RainbowKit
**Infra:** Vercel (web) · testnet deploy (Sepolia / Base Sepolia)

## Security

Not audited. `nonReentrant` on every state-changing path, pausable, owner-gated leverage, hard config ceilings. Aave enforces health-factor on every withdraw/borrow. **Do not deploy to mainnet with real funds without a professional audit.**
