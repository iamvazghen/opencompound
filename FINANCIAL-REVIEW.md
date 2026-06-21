# OpenCompound — Financial Review of the Strategies

Honest assessment of whether the two advertised strategies actually make money. Short version: **one is broken as pitched, one is real and good.** Both are fixable.

---

## Strategy 1 — Same-asset leverage loop (supply ETH → borrow ETH, 70% LTV, 4 cycles)

### The math
Deposit `D = 1`, loop factor `r = 0.70`, 4 cycles:

| Cycle | Borrow | Cumulative supplied | Cumulative debt |
|------:|-------:|--------------------:|----------------:|
| 0 (deposit) | – | 1.0000 | 0.0000 |
| 1 | 0.7000 | 1.7000 | 0.7000 |
| 2 | 0.4900 | 2.1900 | 1.1900 |
| 3 | 0.3430 | 2.5330 | 1.5330 |
| 4 | 0.2401 | 2.7731 | 1.7731 |

- **Exposure (gross supplied): 2.77×.** Max possible at 70% LTV is `1/(1−0.7) = 3.33×`; 4 cycles reaches 83% of that.
- **Net equity stays 1.0** — leverage never changes equity, only gross size.

### Why it's broken as pitched
The README sells this as "amplify your exposure to a single asset (e.g. ETH)." **It does not.** When collateral and debt are the *same* asset, your **net directional exposure is zero**:

```
net ETH = 2.7731 collateral − 1.7731 debt = 1.0 ETH  (exactly your deposit)
```

You are simultaneously long 2.77 ETH and short 1.77 ETH. If ETH doubles, your collateral and your debt both double — they cancel. Same-asset looping gives you **no leveraged price exposure at all.** The only thing it amplifies is the **carry** (rate differential) on the looped notional — and that carry is **negative**:

```
net carry ≈ (supply_APY − borrow_APY) × looped_notional   →   supply_APY < borrow_APY  ALWAYS
```

On Aave the borrow rate always exceeds the supply rate for the same asset (the spread funds suppliers + reserve factor). So same-asset looping **bleeds the spread every block and buys you nothing.** It is strictly worse than just holding.

### When it *is* rational
Exactly one case: **incentive rewards.** If supplying earns reward tokens (Aave Merit, an LM campaign, a points program) at rate `reward_APR`, the loop multiplies the reward-earning notional. It's profitable iff:

```
supply_APY + reward_APR − borrow_APY  >  0
```

That's "leveraged reward/points farming," not "leveraged ETH exposure." Legitimate, but a completely different product with a different pitch.

### Fine-tune applied
- **Relabel** v1 single-asset mode as **Reward-Farming Leverage**, not "amplify exposure." Done in README/ROADMAP.
- **Surface net carry in the UI.** Contract now exposes `currentRates()` (supply + borrow rate). The dashboard computes net carry and **blocks/warns** before a user loops into a guaranteed loss.
- Keep the contract mechanics — they're correct; only the framing and a safety indicator were wrong.

---

## Strategy 2 — Yield-bearing differential (supply wstETH → borrow WETH, e-mode)

### Why this is the real product
Use two *correlated* assets with a yield gap:

- Supply **wstETH** — appreciates vs ETH via the staking exchange rate (~3–4%/yr), plus a small Aave supply rate.
- Borrow **WETH** — pay the ETH borrow rate (~2–3%/yr).
- Run it in Aave **e-mode** (ETH-correlated category): LTV up to ~93%, liquidation threshold ~95%.

```
net carry ≈ wstETH_staking_yield + wstETH_supply_APY − WETH_borrow_APY   →   historically POSITIVE (~0.5–1.5%)
```

Now leverage *helps*: at ~90% LTV you reach ~4× over 4 cycles (10× at the infinite-loop limit), turning a ~1% spread into a ~4% yield on equity **plus** leveraged exposure to staking-yield accrual. This is the well-trodden **leveraged staking / ETH carry trade** (Instadapp Lite, Contango, DeFi Saver, Summer.fi all ship it).

### The catch the original pitch dodged
Each loop must **swap WETH → wstETH** before re-supplying (you borrow WETH but supply wstETH). That adds:
- DEX slippage + swap fee per cycle (mitigate: flash-loan the whole position and swap once).
- wstETH/ETH **depeg risk** (withdrawal-queue stress can push wstETH below peg → liquidation even though "correlated").
- **Rate risk**: if WETH borrow APY spikes above the staking yield, carry flips negative — the position must be unwound or it slowly bleeds.

### Self-repaying — only here is it real
With positive carry, collateral value grows faster than debt → the effective LTV **drifts down on its own**, and harvesting the surplus collateral to repay WETH debt is genuine self-repayment. (Strategy 1 can only "self-repay" from reward tokens, not from carry.)

### Verdict
**Viable and good.** Promoted from "later" to a core roadmap phase (Phase 6). It needs the two-asset vault + a swap/flash-loan path, so it's a real build, not a relabel.

---

## Alchemix model (the true self-repaying pioneer) — why we can't copy it 1:1

Alchemix: deposit → yield strategy (Yearn) → mint a **0%-interest synthetic** (alETH) up to 50% LTV → external yield repays the synthetic, no liquidation (debt is denominated in the same unit, never accrues interest). Self-repaying works because **debt is interest-free and yield > 0.**

On Aave we **borrow at a positive interest rate**, so we can't replicate the no-liquidation, guaranteed-payoff property. The closest honest analog is Strategy 2's positive-carry drift. Worth studying (`reference/v2-foundry`) for the yield-routing architecture, not for a direct fork.

---

## Recommendations (what we're actually doing)

1. **Reframe Strategy 1** as reward-farming leverage; gate it behind a live net-carry check so nobody loops into a loss. ✅ contract view added, UI to surface it.
2. **Make Strategy 2 the flagship** leveraged product (Phase 6): two-asset wstETH/WETH vault, e-mode, flash-loan-assisted single-swap entry.
3. **"Self-repaying" only claimed where true** — rewards (v1) or positive carry (v2). No "supply interest pays borrow interest with surplus" math anywhere; it's false for one asset.
4. **Risk tuning:** target LTV should derive from the e-mode liquidation threshold with a fixed HF buffer (e.g. target HF ≥ 1.10), not a flat 70/90%. The flat 70% on single-asset is harmless but pointless; the meaningful tuning lives in Strategy 2.
5. **4-cycle cap** is a fine gas/complexity bound — just know it reaches ~83–90% of theoretical max leverage, not 100%.
