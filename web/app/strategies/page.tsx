import Link from "next/link";
import { Nav } from "@/components/Nav";

// Strategies page — explains both strategies AND how they're implemented on-chain,
// tied to the actual contracts in contracts/src. Numbers below come from the Foundry
// test suite (forge test): geometric leverage sum, and the flash-vs-loop gas/LTV figures.

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="mono-num overflow-x-auto rounded-xl border border-[var(--color-line)] bg-[var(--color-paper-2)] p-4 text-sm leading-relaxed text-[var(--color-accent)]">
      {children}
    </pre>
  );
}
function Fn({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-[var(--color-paper-3)] px-1.5 py-0.5 text-[var(--color-accent)]">{children}</code>;
}
function Section({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-4 border-t border-[var(--color-line)] pt-10">
      {children}
    </section>
  );
}

export default function Strategies() {
  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14 text-[var(--color-ink-2)] [&_h2]:text-[var(--color-ink)] [&_h3]:text-[var(--color-ink)] [&_strong]:text-[var(--color-ink)]">
        <h1 className="text-[var(--text-display-s)] text-[var(--color-ink)]">Strategies &amp; implementation</h1>
        <p className="mt-4 text-lg">
          Two vaults, two economic models. Everything below maps to the actual Solidity in{" "}
          <code className="text-[var(--color-ink)]">contracts/src/</code> — function names, constants,
          and numbers are taken straight from the code and the passing test suite.
        </p>
        <nav className="mt-6 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {[
            ["#v1", "v1 · Reward-Farming Leverage"],
            ["#v2", "v2 · Yield-Differential"],
            ["#flash", "Flash-loan leverage"],
            ["#honest", "The honest economics"],
          ].map(([href, label]) => (
            <a key={href} href={href} className="ulink">{label}</a>
          ))}
        </nav>

        {/* ───────────── v1 ───────────── */}
        <Section id="v1">
          <h2 className="text-2xl font-semibold text-white">
            v1 — Reward-Farming Leverage <span className="text-sm text-neutral-500">(single-asset)</span>
          </h2>
          <p>
            Contract: <code className="text-neutral-200">LeveragedSelfRepayingVault.sol</code> — an
            ERC-4626 vault where collateral and debt are the <em>same</em> asset (supply ETH, borrow
            ETH). Shares track <strong>net equity</strong>:
          </p>
          <Code>{`function totalAssets() public view override returns (uint256) {
    uint256 collateral = aToken.balanceOf(address(this));
    uint256 debt = variableDebtToken.balanceOf(address(this));
    return collateral > debt ? collateral - debt : 0;
}`}</Code>
          <h3 className="pt-2 text-lg font-medium text-white">How a position is built</h3>
          <ol className="list-decimal space-y-1 pl-5">
            <li><Fn>deposit()</Fn> pulls your asset and supplies it to Aave (in the <Fn>_deposit</Fn> hook).</li>
            <li>
              <Fn>leverage()</Fn> loops up to <Fn>maxCycles</Fn> (default 4), each cycle borrowing to{" "}
              <Fn>targetLtvBps</Fn> (default 7000 = 70%) and re-supplying.
            </li>
            <li><Fn>harvestAndRepay()</Fn> repays debt from idle underlying (e.g. claimed rewards).</li>
            <li><Fn>deleverage(amount)</Fn> / <Fn>emergencyUnwind()</Fn> exit; Aave gates on health factor.</li>
          </ol>
          <p>The loop is a geometric series. At 70% LTV over 4 cycles, starting from 1 unit:</p>
          <Code>{`supplied = 1 + 0.7 + 0.49 + 0.343 + 0.2401 = 2.7731   (gross exposure 2.77x)
debt     =     0.7 + 0.49 + 0.343 + 0.2401 = 1.7731
equity   = supplied - debt = 1.0                     (leverage never changes equity)`}</Code>
          <h3 className="pt-2 text-lg font-medium text-white">When it self-repays</h3>
          <p>
            Supply yield is earned on the <em>collateral</em> (the larger base); borrow interest is
            paid on the <em>debt</em> (smaller). So net interest is{" "}
            <Fn>E·(s − b·L)/(1 − L)</Fn>, which is <strong>positive whenever LTV &lt; s/b</strong> — the
            break-even. Below it, collateral yield covers the debt interest, equity grows, and the loan
            repays itself; above it, the position bleeds. The contract computes this live:
          </p>
          <Code>{`function breakEvenLtvBps() public view returns (uint256) {
    (uint256 s, uint256 b) = currentRates();      // live Aave supply & borrow rates
    return b == 0 ? 0 : (s * BPS) / b;            // = s / b
}
function isSelfRepaying() external view returns (bool) {
    return currentLtvBps() < breakEvenLtvBps();   // dashboard reads this
}`}</Code>
          <p>
            On Aave, <Fn>s = b · utilization · (1 − reserveFactor)</Fn>, so break-even ≈
            utilization·(1−reserveFactor) — roughly <strong>40–70%</strong> LTV on mainnet (84.9% on the
            Base Sepolia market we deployed to). The dashboard shows your live break-even and marks the
            position self-repaying while you stay below it. Tests:{" "}
            <Fn>test_BreakEvenLtvDefinesSelfRepayingBand</Fn>, <Fn>test_LowLtvLoopIsSelfRepaying</Fn>.
          </p>
          <p className="rounded border border-[var(--color-line)] bg-[var(--color-paper-2)] p-3 text-sm">
            Two honest caveats: (1) same-asset gives <strong>no leveraged price exposure</strong> —
            collateral and debt cancel, net stays at your equity (1.0); (2) looping never beats plain
            supplying for raw yield. So v1&apos;s real value is a <strong>self-repaying loan</strong>{" "}
            (borrow liquidity to use; collateral yield services it) and reward farming — managed below
            break-even.
          </p>
          <p className="text-sm text-neutral-400">
            Safety: <Fn>nonReentrant</Fn> on every state change, <Fn>Pausable</Fn>, owner-gated
            leverage, and hard ceilings <Fn>MAX_LTV_BPS = 9000</Fn> / <Fn>MAX_CYCLES_LIMIT = 10</Fn>.
          </p>
        </Section>

        {/* ───────────── v2 ───────────── */}
        <Section id="v2">
          <h2 className="text-2xl font-semibold text-white">
            v2 — Yield-Differential <span className="text-sm text-neutral-500">(wstETH / WETH)</span>
          </h2>
          <p>
            Contract: <code className="text-neutral-200">YieldDifferentialVault.sol</code> — the
            financially-real one. Supply a <strong>yield-bearing</strong> collateral (wstETH), borrow
            its correlated base (WETH) in Aave <strong>e-mode</strong>. Staking yield &gt; borrow cost
            ⇒ positive carry. Equity is measured in collateral units, with the WETH debt priced via the
            Aave oracle:
          </p>
          <Code>{`function totalAssets() public view override returns (uint256) {
    uint256 collateral = aCollateral.balanceOf(address(this));
    uint256 debtInColl = _debtInCollateral(vDebt.balanceOf(address(this)));
    return collateral > debtInColl ? collateral - debtInColl : 0;
}
// _debtInCollateral converts WETH debt -> wstETH units via IPriceOracleGetter`}</Code>
          <h3 className="pt-2 text-lg font-medium text-white">Building a position</h3>
          <p>
            <Fn>leverage()</Fn> loops borrow→<strong>swap WETH→wstETH on Uniswap v3</strong>→re-supply.
            The swap is the catch that the original same-asset pitch dodged; min-out is derived from the
            oracle mid and <Fn>slippageBps</Fn> (default 50 = 0.5%):
          </p>
          <Code>{`function _leverageOnce(uint256 pc, uint256 pd) internal returns (uint256 borrowAmt) {
    (uint256 collBase, uint256 debtBase,,,,) = pool.getUserAccountData(address(this));
    uint256 targetDebtBase = (collBase * targetLtvBps) / BPS;
    if (targetDebtBase <= debtBase) return 0;
    borrowAmt = ((targetDebtBase - debtBase) * 1e18) / pd;
    pool.borrow(address(debtAsset), borrowAmt, VARIABLE_RATE, 0, address(this));
    uint256 received = _swap(address(debtAsset), asset(), borrowAmt, pd, pc);
    pool.supply(asset(), received, address(this), 0);
}`}</Code>
          <h3 className="pt-2 text-lg font-medium text-white">Self-repaying is passive</h3>
          <p>
            There is no &quot;free debt repayment.&quot; As wstETH appreciates, the WETH debt gets
            cheaper in collateral terms, so <Fn>totalAssets</Fn> (and the share price) rises on its
            own — your equity compounds with zero transactions
            (<Fn>test_AppreciationCompoundsEquityPassively</Fn>). The active levers are{" "}
            <Fn>deleverage()</Fn> to de-risk and <Fn>rebalance(tolBps)</Fn> to hold target LTV:
          </p>
          <Code>{`function rebalance(uint256 tolBps) external whenNotPaused nonReentrant {
    (uint256 collBase, uint256 debtBase,,,,) = pool.getUserAccountData(address(this));
    uint256 ltv = (debtBase * BPS) / collBase;
    if (ltv > targetLtvBps + tolBps)       _deleverageByDebtValue(...); // over-levered: repay down
    else if (ltv + tolBps < targetLtvBps)  _leverageOnce(...);          // under-levered: step up
}`}</Code>
          <p className="text-sm text-neutral-400">
            Defaults: <Fn>targetLtvBps = 8000</Fn>, ceiling <Fn>MAX_LTV_BPS = 9300</Fn> (e-mode),
            slippage capped at 5%. Both 18-decimal tokens (enforced in the constructor).
          </p>
        </Section>

        {/* ───────────── flash ───────────── */}
        <Section id="flash">
          <h2 className="text-2xl font-semibold text-white">Flash-loan one-shot leverage</h2>
          <p>
            Looping is gas-heavy, pays slippage every cycle, and is cycle-limited (4 cycles only reach
            ~70% of an 80% target). <Fn>leverageFlash()</Fn> flash-loans the extra collateral, deposits
            and borrows once, swaps once, and repays the flash — reaching the <em>exact</em> target.
            Pattern adapted from Alchemix&apos;s <code className="text-neutral-200">AutoleverageBase</code>;
            here the vault flash-loans to itself.
          </p>
          <Code>{`function leverageFlash() external whenNotPaused nonReentrant onlyOwner {
    (uint256 collBase, uint256 debtBase,,,,) = pool.getUserAccountData(address(this));
    require(debtBase == 0, "flash entry requires no existing debt");
    // Debt to reach target LTV:  D = C * L / (1 - L)
    uint256 targetDebtBase = (collBase * targetLtvBps) / (BPS - targetLtvBps);
    uint256 borrowAmt = (targetDebtBase * 1e18) / pd;
    pool.flashLoanSimple(address(this), asset(), flashColl, abi.encode(borrowAmt), 0);
}
// executeOperation(): supply flashed collateral -> borrow -> swap WETH->wstETH
//                     -> re-supply excess -> repay flash (gated to pool + self)`}</Code>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-paper-2)] p-4">
              <p className="text-xs text-neutral-500">Iterative loop (4 cycles)</p>
              <p className="text-lg font-medium">~70% LTV · ~701k gas · 4 swaps</p>
            </div>
            <div className="rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5 p-4">
              <p className="text-xs text-neutral-500">leverageFlash()</p>
              <p className="text-lg font-medium text-[var(--color-accent)]">~80% LTV · ~501k gas · 1 swap</p>
            </div>
          </div>
          <p className="text-xs text-neutral-500">
            Figures from <Fn>test_LeverageFlashReachesTarget</Fn> vs <Fn>test_LeverageBuildsHealthyPosition</Fn>.
          </p>
        </Section>

        {/* ───────────── honest ───────────── */}
        <Section id="honest">
          <h2 className="text-2xl font-semibold text-white">The honest economics</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li><strong>Same-asset loop ≠ leverage on price.</strong> Collateral and debt cancel — no directional exposure. But net interest is positive while LTV &lt; s/b, so v1 self-repays as a managed loan, and reward farming stacks on top.</li>
            <li><strong>Real leverage needs two assets.</strong> v2&apos;s wstETH/WETH gives positive carry and genuine leveraged-staking exposure.</li>
            <li><strong>Self-repaying = passive equity growth</strong>, not a magic debt eraser. Appreciation is your equity.</li>
          </ul>
          <p className="pt-2">
            Full analysis in <Link href="/docs/self-repay" className="text-[var(--color-accent)]">Docs → Self-repay</Link>{" "}
            and the repo&apos;s <code className="text-neutral-200">FINANCIAL-REVIEW.md</code> /{" "}
            <code className="text-neutral-200">REFINEMENTS.md</code>.
          </p>
          <div className="flex gap-4 pt-2">
            <Link href="/app" className="rounded bg-[var(--color-accent)] px-5 py-2.5 font-medium text-[var(--color-paper)] hover:bg-[var(--color-accent-2)]">
              Open the dashboard
            </Link>
            <Link href="/docs" className="rounded border border-[var(--color-line)] px-5 py-2.5 font-medium hover:border-[var(--color-ink-3)]">
              Read the docs
            </Link>
          </div>
        </Section>
      </main>
    </>
  );
}
