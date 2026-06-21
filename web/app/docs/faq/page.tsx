const qa: [string, string][] = [
  ["Does same-asset looping increase my ETH exposure?",
   "No. Collateral and debt are the same token and cancel — net directional exposure equals your equity. Looping only amplifies carry (which is negative for one asset)."],
  ["So why offer single-asset mode at all?",
   "Because net interest is positive while LTV stays below break-even (s/b ≈ 40–70%): the collateral yield covers the debt interest, so it works as a self-repaying loan. Reward farming stacks on top. The dashboard shows your live break-even and flags when you cross it."],
  ["How is the self-repaying version different?",
   "It supplies a yield-bearing asset (wstETH) and borrows its base (WETH) in e-mode. Positive carry means the debt is paid down by yield over time."],
  ["Can I get liquidated?",
   "Yes. Below a 1.0 health factor Aave liquidates your collateral at a penalty. Higher leverage = thinner buffer."],
  ["Is this audited?",
   "No. It's a testnet / portfolio project. Do not use real funds on mainnet without a professional audit."],
  ["Which wallets are supported?",
   "Any WalletConnect / injected wallet via Reown AppKit — MetaMask, Rabby, Trust, and mobile deep-links."],
];

export default function FAQ() {
  return (
    <>
      <h1 className="text-3xl font-bold text-white">FAQ</h1>
      <div className="space-y-5">
        {qa.map(([q, a]) => (
          <div key={q}>
            <h3 className="font-semibold text-white">{q}</h3>
            <p className="text-neutral-400">{a}</p>
          </div>
        ))}
      </div>
    </>
  );
}
