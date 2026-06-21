# OpenCompound

**Same-asset leveraged exposure + self-repaying mechanics on Aave V3.** An ERC-4626 vault, a wallet-connected dashboard that auto-detects your existing Aave positions, a landing page, and protocol docs.

> ⚠️ **Educational / portfolio project. NOT audited. Testnet only.** Leveraged DeFi positions can be liquidated. Smart-contract bugs can lose funds. Not financial advice.

---

## The honest economics (read this first)

The original pitch was: "supply ETH, borrow ETH, the supply interest pays the borrow interest with surplus left over." **That cannot work for a single asset.** On Aave, for any one asset the **borrow APY is always higher than the supply APY** — that spread is how suppliers and the protocol get paid. A same-asset loop is therefore **negative carry**: every block it costs you the spread. There is no surplus to harvest.

"Self-repaying" only exists when there is a **yield differential**. OpenCompound ships in two stages:

| Mode | Collateral | Debt | Self-repay source | Status |
|------|-----------|------|-------------------|--------|
| **v1 — Leverage (single-asset)** | ETH | ETH | Harvested Aave **incentive rewards** routed to debt | ✅ contract built |
| **v2 — Yield-differential** | wstETH (staking yield) | WETH | Staking yield > borrow cost in e-mode → real positive carry | 🔜 roadmap |

v1 gives you the leverage loop and an honest reward-funded repay sink. v2 is where "self-repaying" pays for itself from yield. Both are documented as what they actually are — no marketing math.

---

## What's in the repo

```
OpenCompound/
├── contracts/        Foundry project — the vault + Aave interfaces + tests   ✅ built, 5/5 green
│   └── src/LeveragedSelfRepayingVault.sol
├── web/              Next.js dashboard + landing + docs                      🔜 next
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
- **Dashboard** → connect wallet → auto-detect existing Aave positions → toggle **Leverage** vs **Self-Repaying** mode → simulate cycles/LTV → execute via the vault, with live health-factor and liquidation-risk indicators.

Not built yet — see [ROADMAP.md](./ROADMAP.md) for the build order.

## Tech stack

**Contracts:** Solidity 0.8.24+ · Foundry · Aave V3 · OpenZeppelin v5
**Frontend:** Next.js 15 · TypeScript · Tailwind · shadcn/ui · wagmi · viem · RainbowKit
**Infra:** Vercel (web) · testnet deploy (Sepolia / Base Sepolia)

## Security

Not audited. `nonReentrant` on every state-changing path, pausable, owner-gated leverage, hard config ceilings. Aave enforces health-factor on every withdraw/borrow. **Do not deploy to mainnet with real funds without a professional audit.**
