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

### Net interest — correct treatment (CORRECTION)
> An earlier version of this review claimed same-asset positions are "always negative carry." **That was wrong.** It collapsed the whole position into the marginal-loop spread and ignored that the equity portion of the collateral earns supply yield at no borrow cost. The correct treatment:

Supply yield is earned on the **collateral** `C`; borrow interest is paid on the **debt** `D`. With LTV `L = D/C` and equity `E = C − D = C(1−L)`:

```
net interest = s·C − b·D = C·(s − b·L) = E·(s − b·L)/(1 − L)
```

This is **positive whenever `L < s/b`.** The **break-even LTV is `s/b`** (supply rate ÷ borrow rate). Worked example with s = 2%, b = 4%:

```
break-even L = s/b = 0.50
at L = 0.50:  s·C = 2%·1   = 0.02   ==   b·D = 4%·0.5 = 0.02   → net 0
at L < 0.50:  collateral yield exceeds debt interest  → net POSITIVE (self-repaying)
at L > 0.50:  debt interest exceeds collateral yield  → net NEGATIVE (bleeds)
```

On Aave `s = b · utilization · (1 − reserveFactor)`, so `break-even = s/b ≈ utilization·(1−reserveFactor)` — typically **~40–70%** on mainnet, and **84.9%** on the Base Sepolia test market we deployed to. There is a real, usable self-repaying band.

### So it *does* work — as a self-repaying loan, not as leverage
Two honest caveats remain, and both are about framing, not viability:

1. **No leveraged price exposure.** Collateral and debt are the same token and cancel: net directional exposure = your equity (1.0), regardless of cycles. This is a *yield / self-repaying* play, not a directional-leverage play.
2. **Looping doesn't beat plain supplying for raw yield** — `(s−b·L)/(1−L) < s` for any `L>0`. Each loop adds the negative spread on the borrowed slice. So the reason to borrow the same asset is **not** to boost yield.

The genuine product is a **self-repaying loan**: deposit collateral, borrow the same asset to *use as liquidity*, and keep `LTV < s/b` so the collateral's supply yield services (and slowly repays) the debt — no top-ups needed, equity non-decreasing, debt trends to zero. Reward farming is the second use case. Both are real; both require keeping LTV below the live break-even, which floats with utilization — hence "managed properly."

### Fine-tune applied
- Contract now exposes **`breakEvenLtvBps()`** (= s/b) and **`isSelfRepaying()`** (currentLtvBps < break-even), tested in `test_BreakEvenLtvDefinesSelfRepayingBand` / `test_LowLtvLoopIsSelfRepaying`.
- Dashboard now shows the **live break-even LTV**, marks the position **self-repaying (green)** when below it, and warns **only** when the chosen LTV meets/exceeds break-even — not a blanket "don't loop."
- Default target LTV for the self-repaying preset sits below a typical break-even; the aggressive preset can exceed it and is flagged.

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
