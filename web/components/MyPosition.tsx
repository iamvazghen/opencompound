"use client";

import { useState } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { erc20Abi, parseUnits } from "viem";
import { useTx } from "@/lib/useTx";
import { positionAbi, factoryAbi } from "@/lib/positionAbi";
import { ZERO } from "@/lib/config";
import { fmtPct, fmtHealth } from "@/lib/format";

// Self-contained isolated-position console: each user owns a personal Aave position (a clone from
// PositionFactory). Create → deposit → loop leverage → DRAW CASH (tax-free, bounded by the live
// self-repaying limit) → repay → withdraw → close. Fully isolated from other users.
export function MyPosition({
  chainId,
  factory,
  asset,
  symbol,
  decimals,
  user,
}: {
  chainId: number;
  factory: `0x${string}`;
  asset: `0x${string}`;
  symbol: string;
  decimals: number;
  user: `0x${string}`;
}) {
  const run = useTx(chainId);
  const [busy, setBusy] = useState(false);
  const [depositAmt, setDepositAmt] = useState("");
  const [drawAmt, setDrawAmt] = useState("");
  const [repayAmt, setRepayAmt] = useState("");
  const [withdrawAmt, setWithdrawAmt] = useState("");
  const [levTarget, setLevTarget] = useState("50");
  const [levCycles, setLevCycles] = useState("4");

  const posRead = useReadContract({
    address: factory === ZERO ? undefined : factory,
    abi: factoryAbi,
    functionName: "positionOf",
    args: [user, asset],
    query: { enabled: factory !== ZERO },
  });
  const position = posRead.data as `0x${string}` | undefined;
  const hasPosition = !!position && position !== ZERO;

  const fns = ["equity", "currentLtvBps", "breakEvenLtvBps", "maxSafeLtvBps", "drawableSelfRepaying", "isSelfRepaying", "healthFactor"];
  const reads = useReadContracts({
    contracts: hasPosition ? fns.map((functionName) => ({ address: position, abi: positionAbi, functionName })) : [],
    query: { enabled: hasPosition, refetchInterval: 30_000 }, // keep live with Aave rates
  });
  const equity = (reads.data?.[0]?.result as bigint) ?? 0n;
  const ltvBps = Number((reads.data?.[1]?.result as bigint) ?? 0n);
  const breakEvenBps = Number((reads.data?.[2]?.result as bigint) ?? 0n);
  const drawable = (reads.data?.[4]?.result as bigint) ?? 0n;
  const selfRepaying = (reads.data?.[5]?.result as boolean) ?? false;
  const hf = (reads.data?.[6]?.result as bigint) ?? 0n;

  const human = (v: bigint) => (Number(v) / 10 ** decimals).toLocaleString(undefined, { maximumFractionDigits: 6 });
  const refetch = () => {
    posRead.refetch();
    reads.refetch();
  };
  const act = async (steps: () => Promise<void>) => {
    setBusy(true);
    try {
      await steps();
    } finally {
      setBusy(false);
      refetch();
    }
  };

  const createPosition = () =>
    act(() => run("Create position", { address: factory, abi: factoryAbi, functionName: "createPosition", args: [asset] }).then(() => {}));

  const doDeposit = () =>
    act(async () => {
      if (!hasPosition) return;
      const wad = parseUnits(depositAmt || "0", decimals);
      if (wad === 0n) return;
      const ok = await run("Approve", { address: asset, abi: erc20Abi, functionName: "approve", args: [position!, wad] });
      if (ok) await run("Deposit", { address: position!, abi: positionAbi, functionName: "deposit", args: [wad] });
    });

  const doDraw = () =>
    act(async () => {
      const wad = parseUnits(drawAmt || "0", decimals);
      if (wad === 0n) return;
      await run("Draw cash", { address: position!, abi: positionAbi, functionName: "drawLiquidity", args: [wad] });
    });

  const doRepay = () =>
    act(async () => {
      const wad = parseUnits(repayAmt || "0", decimals);
      if (wad === 0n) return;
      const ok = await run("Approve", { address: asset, abi: erc20Abi, functionName: "approve", args: [position!, wad] });
      if (ok) await run("Repay", { address: position!, abi: positionAbi, functionName: "repay", args: [wad] });
    });

  const doWithdraw = () =>
    act(async () => {
      const wad = parseUnits(withdrawAmt || "0", decimals);
      if (wad === 0n) return;
      await run("Withdraw", { address: position!, abi: positionAbi, functionName: "withdraw", args: [wad] });
    });

  const doLeverage = () =>
    act(() =>
      run("Leverage", {
        address: position!,
        abi: positionAbi,
        functionName: "leverage",
        args: [BigInt(Math.round(Number(levTarget) * 100)), BigInt(levCycles)],
      }).then(() => {}),
    );

  const doClose = () => act(() => run("Close position", { address: position!, abi: positionAbi, functionName: "close", args: [] }).then(() => {}));

  if (factory === ZERO) return null;

  return (
    <section className="surface mt-6 rounded-2xl border-[var(--color-accent)]/30 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg">Your isolated position · {symbol}</h2>
        <span className="rounded-full border border-[var(--color-accent)]/40 px-2.5 py-0.5 text-xs text-[var(--color-accent)]">advanced · your own Aave account</span>
      </div>
      <p className="mt-1 text-sm text-[var(--color-ink-3)]">
        A personal position only you control — loop your own leverage and <strong className="text-[var(--color-ink-2)]">draw tax-free cash</strong> to your wallet, while it stays self-repaying. Isolated from every other user.
      </p>

      {!hasPosition ? (
        <div className="mt-5">
          <Btn onClick={createPosition} disabled={busy} primary>Create my {symbol} position</Btn>
          <p className="mt-2 text-xs text-[var(--color-ink-3)]">One-time: deploys your own position contract. Then deposit and draw against it.</p>
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label={`Equity (${symbol})`} value={human(equity)} tone="good" />
            <Stat label="Your LTV" value={ltvBps ? fmtPct(ltvBps / 100) : "0%"} />
            <Stat label="Break-even" value={breakEvenBps ? fmtPct(breakEvenBps / 100) : "—"} tone="good" />
            <Stat label="Health" value={fmtHealth(hf)} />
          </div>
          <p className={`mt-3 text-sm ${selfRepaying ? "text-[var(--color-positive)]" : "text-[var(--color-warning)]"}`}>
            {selfRepaying ? "✓ Self-repaying — yield covers the debt interest." : "⚠ Above break-even — currently bleeding the spread."}
          </p>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            {/* Deposit */}
            <Field label={`Deposit (${symbol})`} value={depositAmt} onChange={setDepositAmt}>
              <Btn onClick={doDeposit} disabled={busy} primary>Deposit</Btn>
            </Field>

            {/* Draw cash — the headline */}
            <Field
              label={`Draw cash (${symbol})`}
              value={drawAmt}
              onChange={setDrawAmt}
              max={human(drawable)}
              onMax={() => setDrawAmt(String(Number(drawable) / 10 ** decimals))}
            >
              <Btn onClick={doDraw} disabled={busy} primary>Draw to wallet</Btn>
            </Field>

            {/* Repay */}
            <Field label={`Repay (${symbol})`} value={repayAmt} onChange={setRepayAmt}>
              <Btn onClick={doRepay} disabled={busy}>Repay</Btn>
            </Field>

            {/* Withdraw */}
            <Field label={`Withdraw collateral (${symbol})`} value={withdrawAmt} onChange={setWithdrawAmt}>
              <Btn onClick={doWithdraw} disabled={busy}>Withdraw</Btn>
            </Field>
          </div>

          {/* Leverage + close */}
          <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-[var(--color-line)] pt-5">
            <label className="text-sm">
              <span className="mb-1 block text-[var(--color-ink-2)]">Loop to LTV %</span>
              <input value={levTarget} onChange={(e) => setLevTarget(e.target.value)} inputMode="decimal" aria-label="Leverage target LTV"
                className="mono-num w-24 rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 text-[var(--color-ink)]" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[var(--color-ink-2)]">Cycles (≤5)</span>
              <select value={levCycles} onChange={(e) => setLevCycles(e.target.value)} aria-label="Leverage cycles"
                className="rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 text-[var(--color-ink)]">
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <Btn onClick={doLeverage} disabled={busy}>Loop leverage</Btn>
            <Btn onClick={doClose} disabled={busy} danger>Close position</Btn>
          </div>
          <p className="mt-3 text-xs text-[var(--color-ink-3)]">
            “Draw to wallet” borrows against your collateral and sends it to you — a loan, not a sale, so no taxable event — capped at the live self-repaying limit ({human(drawable)} {symbol}). Loops are capped at 5.
          </p>
        </>
      )}
    </section>
  );
}

/* ── atoms ── */
function Btn({ children, onClick, disabled, primary, danger }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; primary?: boolean; danger?: boolean }) {
  const base = "rounded-full px-4 py-2 text-sm font-medium transition-colors duration-[var(--dur-fast)] disabled:opacity-40";
  const style = danger
    ? "border border-[var(--color-danger)]/50 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"
    : primary
      ? "bg-[var(--color-accent)] text-[var(--color-paper)] hover:bg-[var(--color-accent-2)]"
      : "border border-[var(--color-line)] text-[var(--color-ink)] hover:border-[var(--color-ink-3)]";
  return <button onClick={onClick} disabled={disabled} className={`${base} ${style}`}>{children}</button>;
}
function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" }) {
  const color = tone === "good" ? "text-[var(--color-positive)]" : tone === "warn" ? "text-[var(--color-warning)]" : "text-[var(--color-ink)]";
  return (
    <div>
      <p className="text-xs text-[var(--color-ink-3)]">{label}</p>
      <p className={`mono-num text-lg ${color}`}>{value}</p>
    </div>
  );
}
function Field({ label, value, onChange, max, onMax, children }: { label: string; value: string; onChange: (v: string) => void; max?: string; onMax?: () => void; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-xl border border-[var(--color-line)] p-4">
      <label className="block text-sm">
        <span className="mb-1 flex items-center justify-between text-[var(--color-ink-2)]">
          {label}
          {max !== undefined && onMax && (
            <button type="button" onClick={onMax} className="text-xs text-[var(--color-accent)] hover:underline">Max {max}</button>
          )}
        </span>
        <input value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" placeholder="0.0" aria-label={label}
          className="mono-num w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 text-[var(--color-ink)]" />
      </label>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}
