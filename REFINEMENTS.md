# OpenCompound — Refinements from Repo Review × Financial Review

What the three reference repos actually do, cross-referenced with `FINANCIAL-REVIEW.md`, and the concrete contract/strategy changes that follow. Applied items are in the code; deferred items are in the roadmap.

## What each repo taught us

### `aave/aave-vault` (ATokenVault) — production ERC-4626 over Aave
- **Deposit/withdraw bounded by Aave limits.** `maxDeposit` = `_maxAssetsSuppliableToAave()` (respects the reserve **supply cap**); `maxWithdraw`/`maxRedeem` = `_maxAssetsWithdrawableFromAave()` (respects available **liquidity**). `previewX` mirror these. Our vaults assumed deposits/withdrawals always succeed.
- **Performance fee via yield checkpoint.** `_accrueYield()` stores `lastVaultBalance`, computes `newYield = aToken.balanceOf − lastVaultBalance`, skims `fee` of it into `accumulatedFees`; `totalAssets` nets fees out. Clean, no per-user accounting.
- **Reward claiming with balance-delta accounting** (`ATokenVaultMerklRewardClaimer`): snapshot reward-token balances, `claim()` via Merkl proofs, forward only the delta. This is exactly the on-chain source for v1's "reward-farming" self-repay.

### `alchemix/v2-foundry` (AutoleverageBase) — flash-loan one-shot leverage ⭐
- Instead of looping N times, it: flash-loans the extra collateral → deposits the **full** target collateral once → mints/borrows `targetDebt` → swaps debt→collateral → repays the flash loan, re-depositing any excess.
- **One deposit, one borrow, one swap → exact target leverage.** Our iterative loop needs N borrows + N swaps + N supplies, pays slippage N times, and only reaches ~83–90% of target in 4 cycles (it's cycle-limited, not LTV-limited — see leverage-math docs).
- Safety patterns worth copying: `executeOperation` gated on `msg.sender == flashLender && initiator == self`; **exact-repayment assertion** (`InexactTokens`); EOA/whitelist gate on the entrypoint.

### `arifintahu/vault-strategy` (LeverageStrategy) — directional, signal-driven
- A **different-asset** leverage demo (supply BTC, borrow stablecoin, buy more BTC) driven by EMA oracle signals, with **risk tiers** (`Low/Med/High` → `maxBps`, `stepBps`) that step leverage up/down incrementally.
- Confirms the financial review's core point: **real leverage needs two different assets.** Its same-mechanism-but-different-asset design is exactly why our v2 (wstETH/WETH) is the legitimate product and v1 (same-asset) is not.
- Borrowable idea: **risk presets** (conservative/balanced/aggressive → target LTV + slippage) instead of raw bps sliders.

## Cross-referenced conclusions

1. **Looping is the wrong primitive for v2.** Negative carry isn't the issue here (v2 carries positive), but gas + N× slippage + cycle-limited leverage are. Flash-loan entry dominates. → **APPLIED: `leverageFlash()`.**
2. **v1 self-repay should claim rewards on-chain**, not depend on a keeper hand-delivering underlying. → deferred (Merkl proofs are off-chain anyway; keeper passes them) — documented.
3. **ERC-4626 must respect Aave caps/liquidity** or `deposit`/`withdraw` can revert opaquely. → evaluated; **deferred** — Aave already reverts unsafe withdrawals and over-cap supplies, so a precise `maxWithdraw`/`maxDeposit` override is a UX nicety, not a safety fix. Roadmapped.
4. **Monetization** via the yield-checkpoint performance fee is the clean pattern when/if this goes beyond a portfolio piece. → deferred (roadmap), not needed on testnet.
5. **Risk presets** improve UX over raw LTV/cycle sliders. → frontend follow-up (roadmap).

## Applied in this pass
- **`YieldDifferentialVault.leverageFlash()`** — Aave `flashLoanSimple` one-shot leverage to exact target LTV; `executeOperation` callback gated to pool+self; premium+slippage buffer so flash repayment always clears; excess re-supplied. Iterative `leverage()` kept as the no-flash fallback / incremental top-up.
- v2 self-repay corrected to **passive equity compounding** + `rebalance()` (the muddled `harvestAndRepay` was removed — appreciation is equity, not spare cash to repay with).

## Deferred (roadmap)
- On-chain Merkl reward claim for v1 (`claimRewards` + balance-delta + swap→repay).
- Performance fee (yield-checkpoint pattern from ATokenVault).
- Supply-cap-aware `maxDeposit` (Aave reserve-config bitmask decode).
- Risk presets in the dashboard (conservative/balanced/aggressive).
