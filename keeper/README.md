# OpenCompound keeper

A small, dependency-light bot that delivers the "automatic guardian" promise: it watches every
pooled vault and every isolated position, and calls the **permissionless `guard()`** on any whose
live LTV has drifted above its live safe ceiling — flash-deleveraging it back to safety before Aave
can liquidate it.

## Why it's safe to run
`guard()` (and `rebalance()`) are **permissionless and only reduce risk** — they revert when a
position is already safe, and they can never move user funds or run owner actions. So the keeper:
- needs only a **gas-funded key** (no approvals, no ownership);
- can do no harm if its key leaks — at worst someone pays gas to protect positions;
- is purely additive: anyone can run one, and more keepers = more safety.

## Run
```bash
cd keeper
cp .env.example .env          # set RPC_URL, FACTORY_ADDRESS, POOLED_VAULTS, KEEPER_PRIVATE_KEY
npm install
DRY_RUN=true npm start        # watch only — prints LTV vs safe-LTV, no txs
npm start                     # live — calls guard() on unsafe positions
```

It enumerates positions from `PositionFactory.allPositions`, reads `currentLtvBps` vs
`maxSafeLtvBps` (free view calls), and only sends a `guard()` tx when a position is actually unsafe —
so it spends gas only when it's protecting someone.

## Production
For a decentralised, always-on setup, register the same check with **Gelato** or **Chainlink
Automation** instead of (or alongside) this bot: schedule a job that reads `currentLtvBps` /
`maxSafeLtvBps` and calls `guard()` when unsafe. The logic is identical; the keeper network just
guarantees liveness and pays/relays gas. (A batched on-chain `guardAll(address[])` helper is a
natural next step to guard many positions in one tx.)
