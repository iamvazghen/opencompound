"use client";

import { useMemo, useState } from "react";
import { useAccount, useChainId, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { erc20Abi, parseUnits } from "viem";
import { Nav } from "@/components/Nav";
import { vaultAbi } from "@/lib/vaultAbi";
import { aavePoolAbi } from "@/lib/aaveAbi";
import { aavePool, vaultAddress, ZERO } from "@/lib/config";
import { simulate } from "@/lib/sim";
import { fmtUsd, fmtHealth, rayToPct, fmtPct } from "@/lib/format";

export default function Dashboard() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const pool = aavePool(chainId);
  const vault = vaultAddress(chainId);
  const vaultLive = vault !== ZERO;

  // ── Auto-detect the wallet's existing Aave position ──
  const aave = useReadContract({
    address: pool === ZERO ? undefined : pool,
    abi: aavePoolAbi,
    functionName: "getUserAccountData",
    args: address ? [address] : undefined,
    query: { enabled: isConnected && pool !== ZERO },
  });

  // ── Vault reads (only when deployed on this chain) ──
  const vaultReads = useReadContracts({
    contracts: vaultLive
      ? ([
          { address: vault, abi: vaultAbi, functionName: "totalAssets" },
          { address: vault, abi: vaultAbi, functionName: "healthFactor" },
          { address: vault, abi: vaultAbi, functionName: "currentLtvBps" },
          { address: vault, abi: vaultAbi, functionName: "currentRates" },
          { address: vault, abi: vaultAbi, functionName: "maxCycles" },
          { address: vault, abi: vaultAbi, functionName: "targetLtvBps" },
          { address: vault, abi: vaultAbi, functionName: "asset" },
        ] as const)
      : [],
    query: { enabled: vaultLive },
  });

  const rates = vaultReads.data?.[3]?.result as readonly [bigint, bigint] | undefined;
  const supplyPct = rates ? rayToPct(rates[0]) : undefined;
  const borrowPct = rates ? rayToPct(rates[1]) : undefined;
  const netCarry = supplyPct !== undefined && borrowPct !== undefined ? supplyPct - borrowPct : undefined;

  if (!isConnected) {
    return (
      <>
        <Nav connect />
        <main className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <h1 className="text-2xl font-semibold">Connect your wallet</h1>
          <p className="max-w-md text-sm text-neutral-400">
            We&apos;ll auto-detect any Aave V3 position you already have on this network.
          </p>
          {/* Reown AppKit connect modal */}
          <appkit-button />
        </main>
      </>
    );
  }

  return (
    <>
      <Nav connect />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <h1 className="text-2xl font-semibold">Dashboard</h1>

        {/* Existing Aave position (auto-detected) */}
        <Section title="Your existing Aave position">
          {pool === ZERO ? (
            <Note>Aave V3 isn&apos;t configured for this network — switch to Sepolia or Base Sepolia.</Note>
          ) : aave.isLoading ? (
            <Note>Reading on-chain…</Note>
          ) : aave.data ? (
            <PositionGrid data={aave.data as readonly bigint[]} />
          ) : (
            <Note>No position found.</Note>
          )}
        </Section>

        <ModeAndSimulator
          maxCycles={Number(vaultReads.data?.[4]?.result ?? 4n)}
          targetLtvBps={Number(vaultReads.data?.[5]?.result ?? 7000n)}
          netCarry={netCarry}
          supplyPct={supplyPct}
          borrowPct={borrowPct}
        />

        {/* Vault actions */}
        <Section title="Vault">
          {!vaultLive ? (
            <Note>
              Vault not deployed on this network yet. After deploying, set{" "}
              <code className="text-emerald-400">NEXT_PUBLIC_VAULT_ADDRESS_{chainId}</code> in{" "}
              <code>.env.local</code>.
            </Note>
          ) : (
            <VaultActions vault={vault} assetAddr={vaultReads.data?.[6]?.result as `0x${string}` | undefined} />
          )}
          {vaultLive && vaultReads.data && (
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Net equity" value={`${Number((vaultReads.data[0]?.result as bigint) ?? 0n) / 1e18}`} />
              <Stat label="Health factor" value={fmtHealth((vaultReads.data[1]?.result as bigint) ?? 0n)} />
              <Stat label="Current LTV" value={fmtPct(Number((vaultReads.data[2]?.result as bigint) ?? 0n) / 100)} />
              <Stat label="Net carry" value={netCarry !== undefined ? fmtPct(netCarry) : "—"} />
            </div>
          )}
        </Section>
      </main>
    </>
  );
}

function PositionGrid({ data }: { data: readonly bigint[] }) {
  const [collateral, debt, , , , hf] = data;
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      <Stat label="Collateral" value={fmtUsd(collateral)} />
      <Stat label="Debt" value={fmtUsd(debt)} />
      <Stat label="Health factor" value={fmtHealth(hf)} highlight={hf < 11n * 10n ** 17n} />
    </div>
  );
}

function ModeAndSimulator({
  maxCycles,
  targetLtvBps,
  netCarry,
  supplyPct,
  borrowPct,
}: {
  maxCycles: number;
  targetLtvBps: number;
  netCarry?: number;
  supplyPct?: number;
  borrowPct?: number;
}) {
  const [mode, setMode] = useState<"leverage" | "selfRepay">("leverage");
  const [deposit, setDeposit] = useState(1);
  const [cycles, setCycles] = useState(Math.min(4, maxCycles));
  const [ltv, setLtv] = useState(targetLtvBps);
  const sim = useMemo(() => simulate(deposit, cycles, ltv), [deposit, cycles, ltv]);

  const carryLoses = netCarry !== undefined && netCarry < 0;

  return (
    <Section title="Strategy">
      <div className="mb-4 inline-flex rounded-lg border border-neutral-800 p-1 text-sm">
        {(["leverage", "selfRepay"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded px-4 py-1.5 ${mode === m ? "bg-emerald-500 text-neutral-950" : "text-neutral-400"}`}
          >
            {m === "leverage" ? "Reward-Farming Leverage" : "Self-Repaying"}
          </button>
        ))}
      </div>

      {carryLoses && mode === "leverage" && (
        <div className="mb-4 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-300">
          ⚠ Net carry is {fmtPct(netCarry!)} (supply {supplyPct?.toFixed(2)}% − borrow{" "}
          {borrowPct?.toFixed(2)}%). Same-asset looping <strong>loses</strong> the spread every block
          and gives zero net price exposure. Only loop if reward incentives exceed this. See Docs →
          Self-repay mechanics.
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <Field label={`Deposit: ${deposit}`}>
            <input type="range" min={0.1} max={10} step={0.1} value={deposit}
              onChange={(e) => setDeposit(+e.target.value)} className="w-full" />
          </Field>
          <Field label={`Cycles: ${cycles} (max ${maxCycles})`}>
            <input type="range" min={0} max={maxCycles} step={1} value={cycles}
              onChange={(e) => setCycles(+e.target.value)} className="w-full" />
          </Field>
          <Field label={`Target LTV: ${(ltv / 100).toFixed(0)}%`}>
            <input type="range" min={1000} max={9000} step={500} value={ltv}
              onChange={(e) => setLtv(+e.target.value)} className="w-full" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4 self-start rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
          <Stat label="Gross exposure" value={`${sim.supplied.toFixed(3)}`} />
          <Stat label="Total debt" value={`${sim.debt.toFixed(3)}`} />
          <Stat label="Your equity" value={`${sim.equity.toFixed(3)}`} />
          <Stat label="Leverage" value={`${sim.leverage.toFixed(2)}×`} />
        </div>
      </div>
      {mode === "leverage" && (
        <p className="mt-3 text-xs text-neutral-500">
          Note: gross exposure ≠ price exposure for a same-asset loop. Net directional exposure stays
          at your equity ({sim.equity.toFixed(2)}) — collateral and debt are the same asset and
          cancel.
        </p>
      )}
    </Section>
  );
}

function VaultActions({ vault, assetAddr }: { vault: `0x${string}`; assetAddr?: `0x${string}` }) {
  const { address } = useAccount();
  const { writeContract, isPending } = useWriteContract();
  const [amount, setAmount] = useState("1");

  const deposit = () => {
    if (!assetAddr || !address) return;
    const wad = parseUnits(amount || "0", 18);
    // ponytail: approve-then-deposit as two prompts. A permit2 single-sig flow is the
    // upgrade if the double prompt annoys users.
    writeContract({ address: assetAddr, abi: erc20Abi, functionName: "approve", args: [vault, wad] });
    writeContract({ address: vault, abi: vaultAbi, functionName: "deposit", args: [wad, address] });
  };
  const call = (fn: "leverage" | "harvestAndRepay" | "emergencyUnwind") =>
    writeContract({ address: vault, abi: vaultAbi, functionName: fn });
  const deleverageAll = () =>
    writeContract({ address: vault, abi: vaultAbi, functionName: "deleverage", args: [2n ** 256n - 1n] });

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input value={amount} onChange={(e) => setAmount(e.target.value)}
        className="w-28 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm" placeholder="amount" />
      <Btn onClick={deposit} disabled={isPending}>Deposit</Btn>
      <Btn onClick={() => call("leverage")} disabled={isPending}>Leverage</Btn>
      <Btn onClick={() => call("harvestAndRepay")} disabled={isPending}>Harvest &amp; Repay</Btn>
      <Btn onClick={deleverageAll} disabled={isPending}>Deleverage all</Btn>
      <Btn onClick={() => call("emergencyUnwind")} disabled={isPending} danger>Emergency unwind</Btn>
    </div>
  );
}

// ── small presentational helpers ──
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 rounded-xl border border-neutral-800 bg-neutral-900/30 p-6">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}
function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`text-lg font-medium ${highlight ? "text-amber-400" : ""}`}>{value}</p>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-neutral-400">{label}</span>
      {children}
    </label>
  );
}
function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-neutral-400">{children}</p>;
}
function Btn({ children, onClick, disabled, danger }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`rounded px-4 py-2 text-sm font-medium disabled:opacity-50 ${
        danger ? "border border-red-500/50 text-red-300 hover:bg-red-500/10"
               : "bg-emerald-500 text-neutral-950 hover:bg-emerald-400"}`}>
      {children}
    </button>
  );
}
