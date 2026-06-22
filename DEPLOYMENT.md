# Deployment guide

How to deploy OpenCompound — the vault contracts on-chain and the dashboard on Vercel — plus the
checklist that must clear before real (mainnet) funds. A human-readable version of this lives on the
site at **`/deployment`**.

> **Status:** testnet build. The contracts are **not audited**. Use on testnets only until the
> mainnet checklist below is fully green.

---

## 1. Contracts (on-chain)

### Prerequisites
- [Foundry](https://book.getfoundry.sh) installed (`forge`, `cast`).
- A funded deployer key, and `contracts/.env` filled in (see `contracts/.env.example`).
- The target chain's addresses: Aave V3 Pool, the asset(s), and — for v2 — Uniswap **SwapRouter02**
  and the ETH-correlated e-mode id.

| Chain | Aave V3 Pool | SwapRouter02 (v2) |
|---|---|---|
| Base mainnet (8453) | `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5` | `0x2626664c2603336E57B271c5C0b26F421741e481` |
| Ethereum mainnet (1) | `0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2` | `0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45` |
| Base Sepolia (84532) | `0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b` | — |
| Ethereum Sepolia (11155111) | `0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951` | — |

### Deploy v1 (single-asset, self-repaying) — one vault per asset
```bash
cd contracts
# env: AAVE_POOL, ASSET, optional VAULT_NAME/VAULT_SYMBOL/VAULT_OWNER
forge script script/Deploy.s.sol \
  --rpc-url $BASE_MAINNET_RPC --broadcast \
  --private-key $PRIVATE_KEY \
  --verify --etherscan-api-key $BASESCAN_API_KEY
```

### Deploy v2 (yield-differential, e.g. wstETH/WETH)
```bash
# env: AAVE_POOL, COLLATERAL, DEBT_ASSET, SWAP_ROUTER (SwapRouter02), POOL_FEE, EMODE_CATEGORY
forge script script/DeployV2.s.sol \
  --rpc-url $BASE_MAINNET_RPC --broadcast \
  --private-key $PRIVATE_KEY \
  --verify --etherscan-api-key $BASESCAN_API_KEY
```

### After deploy
1. Note each vault address from the script output.
2. Set `NEXT_PUBLIC_VAULT_V1_<chainId>` / `NEXT_PUBLIC_VAULT_V2_<chainId>` in the frontend env.
3. For v1, add a row to `web/lib/config.ts` `V1_MARKETS[<chainId>]` (symbol/asset/vault/decimals).
4. **Production:** set `VAULT_OWNER` to a Safe multisig / timelock so owner-gated actions
   (leverage, setStrategy, pause, emergencyUnwind) aren't a single EOA.

---

## 2. Frontend (Vercel)

- **Root directory:** `web` (set in the Vercel project, or via the root `vercel.json`).
- **Framework:** Next.js (auto-detected).
- **Environment variables** (Vercel → Project → Settings → Environment Variables):

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Your Reown project id (domain-allowlisted in the Reown dashboard). |
| `ALCHEMY_API_KEY` | **Server-only** (no `NEXT_PUBLIC`) — used by the `/api/rpc` proxy so the key stays off the client. |
| `NEXT_PUBLIC_NETWORK_MODE` | `testnet` (default) or `mainnet`. Drives the active chains + which AppKit features are on. |
| `NEXT_PUBLIC_VAULT_V1_<chainId>` | Per deployed v1 vault. |
| `NEXT_PUBLIC_VAULT_V2_<chainId>` | Per deployed v2 vault. |

Deploy: `cd web && vercel --prod` (or connect the GitHub repo in the Vercel dashboard for CI deploys).

After deploy, restrict the Reown projectId and Alchemy key to the production domain in their
dashboards.

---

## 3. Go-live checklist (before mainnet funds)

- [ ] **Professional security audit + bug bounty** — blocker; nothing ships to mainnet without it.
- [ ] Owner set to a **Safe multisig / timelock** (not an EOA); decide immutable vs upgradeable.
- [ ] **Economic validation on live mainnet rates** — confirm v1 self-repaying bands / v2 carry are
      profitable and the target reserve allows the borrow (not isolation/siloed).
- [ ] **Keeper** wired for `guard()` / `rebalance()` (Gelato or Chainlink Automation), funded.
- [ ] Fork-test scenario depth: interest accrual over time, paused reserves, real liquidations.
- [ ] Error tracking (Sentry DSN) and any required geoblocking.
- [ ] Published audit report linked from the site.

### Already done ✓
ERC-4626 inflation/donation hardening · proportional flash-unwind withdrawals · supply-cap-aware
deposits · oracle/MEV guards · dynamic guardrails · invariant suite · live mainnet-fork tests for
both vaults · deploy scripts (v1 + v2) with multisig-aware owner · legal pages · RPC proxy.
