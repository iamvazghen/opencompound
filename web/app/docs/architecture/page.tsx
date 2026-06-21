export default function Architecture() {
  return (
    <>
      <h1 className="text-3xl font-bold text-white">Architecture — how the vault works with Aave</h1>
      <p>
        The single most important thing to understand: <strong>OpenCompound uses real Aave V3
        positions.</strong> Nothing here is simulated. When you deposit, your funds are genuinely
        supplied to Aave; when the vault leverages, it genuinely borrows real liquidity from Aave&apos;s
        pool. The vault is a <strong>custodial wrapper</strong> that holds and automates that Aave
        position on your behalf.
      </p>

      <h2 className="pt-4 text-xl font-semibold text-white">The fund flow</h2>
      <pre className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-300">
{`Your wallet  ──deposit──▶  OpenCompound Vault  ──supply()──▶  Aave V3 Pool
     ▲                          │  (holds the position)            │
     │                          │                                  ├─ mints aTokens to the vault
     └──withdraw/redeem─────────┘  ◀──────────── borrow()/repay() ─┘`}
      </pre>
      <p>
        Money moves <strong>wallet → vault → Aave</strong>. The vault is the account-holder on Aave,
        so the position lives under the <em>vault&apos;s</em> address, not your wallet&apos;s. Your
        claim on it is represented by the ERC-4626 shares the vault mints to you.
      </p>

      <h2 className="pt-4 text-xl font-semibold text-white">Are we really supplying & borrowing? Yes.</h2>
      <p>Three pieces of proof, all readable on-chain:</p>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          When the vault supplies, Aave mints it an <strong>aToken</strong> (an interest-bearing receipt,
          e.g. aBasSepWETH). The vault&apos;s aToken balance is exactly what Aave has on deposit for it,
          and it grows block by block with supply interest.
        </li>
        <li>
          When the vault borrows, Aave mints it a <strong>variable-debt token</strong>. That balance is
          the real debt, growing with borrow interest.
        </li>
        <li>
          Aave&apos;s own <code>getUserAccountData(vault)</code> returns the collateral, debt, and health
          factor — and it matches what our vault reports (LTV, health factor) to the digit.
        </li>
      </ul>
      <p>
        It is not a passthrough to your wallet either: your wallet never holds the aTokens or debt. The
        vault does. That is why connecting your wallet to Aave&apos;s own app shows nothing — Aave&apos;s
        UI displays the connected wallet&apos;s position, and the position is the vault&apos;s.
      </p>

      <h2 className="pt-4 text-xl font-semibold text-white">What each action does on Aave</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li><strong>Deposit</strong> → vault calls Aave <code>supply()</code>; Aave pulls the asset and mints aTokens to the vault; you receive vault shares.</li>
        <li><strong>Leverage</strong> → vault calls Aave <code>borrow()</code> (real liquidity leaves Aave&apos;s pool to the vault), then <code>supply()</code> again. v1 re-supplies the same asset; v2 swaps the borrow into the collateral asset first.</li>
        <li><strong>Harvest / repay</strong> → vault calls Aave <code>repay()</code>, burning debt tokens.</li>
        <li><strong>Deleverage / withdraw</strong> → vault calls Aave <code>withdraw()</code> (burns aTokens, returns the asset) and <code>repay()</code>; Aave enforces the health factor on every withdrawal.</li>
      </ul>

      <h2 className="pt-4 text-xl font-semibold text-white">Shares and net equity (ERC-4626)</h2>
      <p>
        The vault is an ERC-4626 tokenised vault. Your shares represent your slice of the vault&apos;s{" "}
        <strong>net equity</strong> = collateral minus debt. Leverage doesn&apos;t change your equity (it
        grows both sides together); yield does. As the position earns net interest, the share price rises,
        and that is how your return accrues.
      </p>

      <h2 className="pt-4 text-xl font-semibold text-white">Flash loans for one-shot execution</h2>
      <p>
        To avoid slow, costly looping, the vault can take an Aave <strong>flash loan</strong>: it borrows
        the shortfall for a single transaction, builds (or fully unwinds) the position at once, and repays
        the flash loan from the proceeds — paying only a ~0.09% fee. This is how the vault reaches an exact
        target LTV, or clears all debt, in one transaction.
      </p>

      <h2 className="pt-4 text-xl font-semibold text-white">Custody & control</h2>
      <p>
        The vault owns the Aave position; you own vault shares redeemable for the underlying at any time
        via <code>withdraw</code> / <code>redeem</code>. Risk-management actions (leverage, strategy
        settings, pause, emergency unwind) are owner-gated. Because everything is on-chain, you can verify
        the vault&apos;s exact Aave position on the block explorer — see{" "}
        <a className="text-emerald-400" href="/docs/dashboard">Using the dashboard</a>.
      </p>
    </>
  );
}
