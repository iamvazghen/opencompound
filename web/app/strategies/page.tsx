import Link from "next/link";
import { Nav } from "@/components/Nav";

// Strategies page — explains both strategies AND how they're implemented on-chain,
// tied to the actual contracts in contracts/src. Numbers below come from the Foundry
// test suite (forge test): geometric leverage sum, and the flash-vs-loop gas/LTV figures.

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-sm leading-relaxed text-emerald-300">
      {children}
    </pre>
  );
}
function Fn({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-emerald-300">{children}</code>;
}
function Section({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 space-y-4 border-t border-neutral-800 pt-10">
      {children}
    </section>
  );
}

export default function Strategies() {
  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12 text-neutral-300">
        <h1 className="text-4xl font-bold text-white">Strategies &amp; implementation</h1>
        <p className="mt-4 text-lg text-neutral-400">
          Two vaults, two economic models. Everything below maps to the actual Solidity in{" "}
          <code className="text-neutral-200">contracts/src/</code> — function names, constants, and
          numbers are taken straight from the code and the passing test suite.
        </p>
        <nav className="mt-6 flex flex-wrap gap-x-6 gap-y-1 text-sm text-emerald-400">
          <a href="#v1">v1 · Reward-Farming Leverage</a>
          <a href="#v2">v2 · Yield-Differential</a>
          <a href="#flash">Flash-loan leverage</a>
          <a href="#honest">The honest economics</a>
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
          <p className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-300">
            ⚠ For a same-asset loop this 2.77× is <strong>not</strong> price exposure — collateral and
            debt are the same token and cancel, so net directional exposure stays at your equity
            (1.0). And the carry is negative. That&apos;s why the contract exposes{" "}
            <Fn>currentRates()</Fn> and the dashboard blocks looping when supply rate &lt; borrow rate.
          </p>
          <Code>{`// the guard the dashboard reads — see test_SingleAssetCarryIsNegative
function currentRates() external view returns (uint256 supplyRateRay, uint256 borrowRateRay) {
    ReserveDataLegacy memory r = pool.getReserveData(asset());
    return (r.currentLiquidityRate, r.currentVariableBorrowRate);
}`}</Code>
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
            <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
              <p className="text-xs text-neutral-500">Iterative loop (4 cycles)</p>
              <p className="text-lg font-medium">~70% LTV · ~701k gas · 4 swaps</p>
            </div>
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
              <p className="text-xs text-neutral-500">leverageFlash()</p>
              <p className="text-lg font-medium text-emerald-300">~80% LTV · ~501k gas · 1 swap</p>
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
            <li><strong>Same-asset loop ≠ leverage on price.</strong> Collateral and debt cancel; you only amplify carry, which is negative. v1 makes sense <em>only</em> with incentive rewards.</li>
            <li><strong>Real leverage needs two assets.</strong> v2&apos;s wstETH/WETH gives positive carry and genuine leveraged-staking exposure.</li>
            <li><strong>Self-repaying = passive equity growth</strong>, not a magic debt eraser. Appreciation is your equity.</li>
          </ul>
          <p className="pt-2">
            Full analysis in <Link href="/docs/self-repay" className="text-emerald-400">Docs → Self-repay</Link>{" "}
            and the repo&apos;s <code className="text-neutral-200">FINANCIAL-REVIEW.md</code> /{" "}
            <code className="text-neutral-200">REFINEMENTS.md</code>.
          </p>
          <div className="flex gap-4 pt-2">
            <Link href="/app" className="rounded bg-emerald-500 px-5 py-2.5 font-medium text-neutral-950 hover:bg-emerald-400">
              Open the dashboard
            </Link>
            <Link href="/docs" className="rounded border border-neutral-700 px-5 py-2.5 font-medium hover:border-neutral-500">
              Read the docs
            </Link>
          </div>
        </Section>
      </main>
    </>
  );
}
