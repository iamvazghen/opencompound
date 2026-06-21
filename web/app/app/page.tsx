"use client";

import { useMemo, useState } from "react";
import { useAccount, useChainId, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { erc20Abi, parseUnits } from "viem";
import { Nav } from "@/components/Nav";
import { vaultAbi } from "@/lib/vaultAbi";
import { yieldVaultAbi } from "@/lib/yieldVaultAbi";
import { aavePoolAbi } from "@/lib/aaveAbi";
import { aavePool, vaultAddress, ZERO, type VaultVersion } from "@/lib/config";
import { simulate, RISK_PRESETS, type RiskPreset } from "@/lib/sim";
import { fmtUsd, fmtHealth, rayToPct, fmtPct } from "@/lib/format";

export default function Dashboard() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [version, setVersion] = useState<VaultVersion>("v1");

  const pool = aavePool(chainId);
  const vault = vaultAddress(chainId, version);
  const vaultLive = vault !== ZERO;
  const abi = version === "v1" ? vaultAbi : yieldVaultAbi;

  // Auto-detect the connected wallet's existing Aave position.
  const aave = useReadContract({
    address: pool === ZERO ? undefined : pool,
    abi: aavePoolAbi,
    functionName: "getUserAccountData",
    args: address ? [address] : undefined,
    query: { enabled: isConnected && pool !== ZERO },
  });

  // Vault reads (shared + version-specific rate signal).
  const vaultReads = useReadContracts({
    contracts: vaultLive
      ? ([
          { address: vault, abi, functionName: "totalAssets" },
          { address: vault, abi, functionName: "healthFactor" },
          { address: vault, abi, functionName: "maxCycles" },
          { address: vault, abi, functionName: "targetLtvBps" },
          { address: vault, abi, functionName: "asset" },
          version === "v1"
            ? { address: vault, abi: vaultAbi, functionName: "currentRates" }
            : { address: vault, abi: yieldVaultAbi, functionName: "aaveRateSpread" },
        ] as const)
      : [],
    query: { enabled: vaultLive },
  });

  // v1: break-even LTV (bps) = supplyRate/borrowRate — self-repaying below it.
  // v2: net rate spread (%) — positive is the goal.
  const signal = useMemo(() => {
    const r = vaultReads.data?.[5]?.result;
    if (r === undefined) return {};
    if (version === "v1") {
      const [s, b] = r as readonly [bigint, bigint];
      return { breakEvenBps: b > 0n ? Number((s * 10000n) / b) : 0 };
    }
    return { netCarryPct: rayToPct(BigInt(r as bigint)) };
  }, [vaultReads.data, version]);

  if (!isConnected) {
    return (
      <>
        <Nav connect />
        <main className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
          <h1 className="text-[var(--text-display-s)]">Connect your wallet</h1>
          <p className="max-w-md text-[var(--color-ink-2)]">
            We&apos;ll auto-detect any Aave V3 position you already hold on this network.
          </p>
          <appkit-button />
        </main>
      </>
    );
  }

  return (
    <>
      <Nav connect />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[var(--text-display-s)]">Dashboard</h1>
            <p className="mt-1 text-sm text-[var(--color-ink-3)]">
              Vault {version} · {version === "v1" ? "Reward-Farming Leverage" : "Yield-Differential"}
            </p>
          </div>
          <VersionToggle version={version} setVersion={setVersion} />
        </div>

        {/* Workbench: position rail + strategy/actions */}
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <Panel title="Your Aave position">
            {pool === ZERO ? (
              <Muted>Switch to Sepolia or Base Sepolia.</Muted>
            ) : aave.isLoading ? (
              <Muted>Reading on-chain…</Muted>
            ) : aave.data ? (
              <PositionGrid data={aave.data as readonly bigint[]} />
            ) : (
              <Muted>No position found.</Muted>
            )}
          </Panel>

          <Panel title="Vault status">
            {!vaultLive ? (
              <Muted>
                Vault {version} not deployed on this network. After deploying, set{" "}
                <code className="text-[var(--color-accent)]">NEXT_PUBLIC_VAULT_{version.toUpperCase()}_{chainId}</code>.
              </Muted>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Net equity" value={`${Number((vaultReads.data?.[0]?.result as bigint) ?? 0n) / 1e18}`} />
                <Stat label="Health" value={fmtHealth((vaultReads.data?.[1]?.result as bigint) ?? 0n)} />
                <Stat label="Target LTV" value={fmtPct(Number((vaultReads.data?.[3]?.result as bigint) ?? 0n) / 100)} />
                {version === "v1" ? (
                  <Stat
                    label="Break-even LTV"
                    value={signal.breakEvenBps !== undefined ? fmtPct(signal.breakEvenBps / 100) : "—"}
                    tone="good"
                  />
                ) : (
                  <Stat
                    label="Net carry"
                    value={signal.netCarryPct !== undefined ? fmtPct(signal.netCarryPct) : "—"}
                    tone={signal.netCarryPct !== undefined ? (signal.netCarryPct < 0 ? "warn" : "good") : undefined}
                  />
                )}
              </div>
            )}
          </Panel>
        </div>

        <StrategyPanel
          version={version}
          vault={vault}
          vaultLive={vaultLive}
          abi={abi}
          assetAddr={vaultReads.data?.[4]?.result as `0x${string}` | undefined}
          maxCycles={Number((vaultReads.data?.[2]?.result as bigint) ?? 4n)}
          targetLtvBps={Number((vaultReads.data?.[3]?.result as bigint) ?? 7000n)}
          breakEvenBps={signal.breakEvenBps}
          netCarryPct={signal.netCarryPct}
        />
      </main>
    </>
  );
}

function VersionToggle({ version, setVersion }: { version: VaultVersion; setVersion: (v: VaultVersion) => void }) {
  return (
    <div className="inline-flex rounded-full border border-[var(--color-line)] p-1 text-sm">
      {(["v1", "v2"] as const).map((v) => (
        <button
          key={v}
          onClick={() => setVersion(v)}
          className={`rounded-full px-4 py-1.5 transition-colors duration-[var(--dur-fast)] ${
            version === v ? "bg-[var(--color-accent)] text-[var(--color-paper)]" : "text-[var(--color-ink-2)]"
          }`}
        >
          {v === "v1" ? "v1 · Single-asset" : "v2 · Yield-diff"}
        </button>
      ))}
    </div>
  );
}

function PositionGrid({ data }: { data: readonly bigint[] }) {
  const [collateral, debt, , , , hf] = data;
  return (
    <div className="grid grid-cols-2 gap-4">
      <Stat label="Collateral" value={fmtUsd(collateral)} />
      <Stat label="Debt" value={fmtUsd(debt)} />
      <Stat label="Health factor" value={fmtHealth(hf)} tone={hf < 11n * 10n ** 17n ? "warn" : undefined} />
    </div>
  );
}

function StrategyPanel({
  version,
  vault,
  vaultLive,
  abi,
  assetAddr,
  maxCycles,
  targetLtvBps,
  breakEvenBps,
  netCarryPct,
}: {
  version: VaultVersion;
  vault: `0x${string}`;
  vaultLive: boolean;
  abi: typeof vaultAbi | typeof yieldVaultAbi;
  assetAddr?: `0x${string}`;
  maxCycles: number;
  targetLtvBps: number;
  breakEvenBps?: number;
  netCarryPct?: number;
}) {
  const { address } = useAccount();
  const { writeContract, isPending } = useWriteContract();
  const [preset, setPreset] = useState<RiskPreset>(RISK_PRESETS[0]);
  const [deposit, setDeposit] = useState("1");

  const sim = useMemo(() => simulate(Number(deposit) || 0, preset.cycles, preset.ltvBps), [deposit, preset]);
  // v1: self-repaying while the chosen LTV stays below the live break-even (s/b).
  const selfRepaying = version === "v1" && breakEvenBps !== undefined && preset.ltvBps < breakEvenBps;
  const v1Bleeds = version === "v1" && breakEvenBps !== undefined && preset.ltvBps >= breakEvenBps;

  const w = (functionName: string, args?: readonly unknown[]) =>
    writeContract({ address: vault, abi: abi as never, functionName: functionName as never, args: args as never });

  const doDeposit = () => {
    if (!assetAddr || !address) return;
    const wad = parseUnits(deposit || "0", 18);
    writeContract({ address: assetAddr, abi: erc20Abi, functionName: "approve", args: [vault, wad] });
    w("deposit", [wad, address]);
  };
  const applyPreset = () =>
    version === "v1"
      ? w("setStrategy", [BigInt(preset.ltvBps), BigInt(preset.cycles)])
      : w("setStrategy", [BigInt(preset.ltvBps), BigInt(preset.cycles), BigInt(preset.slippageBps)]);

  return (
    <section className="surface mt-6 rounded-2xl p-6">
      <h2 className="text-lg">Strategy</h2>

      {/* Risk presets */}
      <div className="mt-4 flex flex-wrap gap-2">
        {RISK_PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPreset(p)}
            className={`rounded-full border px-4 py-1.5 text-sm transition-colors duration-[var(--dur-fast)] ${
              preset.key === p.key
                ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                : "border-[var(--color-line)] text-[var(--color-ink-2)] hover:border-[var(--color-ink-3)]"
            }`}
          >
            {p.label}
            <span className="mono-num ml-2 text-xs text-[var(--color-ink-3)]">
              {p.ltvBps / 100}% · {p.cycles}c
            </span>
          </button>
        ))}
      </div>

      {selfRepaying && (
        <p className="mt-4 rounded-xl border border-[var(--color-positive)]/40 bg-[var(--color-positive)]/10 p-3 text-sm text-[var(--color-positive)]">
          ✓ Self-repaying: {preset.ltvBps / 100}% LTV is below the live break-even of{" "}
          {fmtPct(breakEvenBps! / 100)} (supply ÷ borrow). Collateral yield covers the debt interest —
          equity grows and the loan repays itself. No net price exposure (same asset).
        </p>
      )}
      {v1Bleeds && (
        <p className="mt-4 rounded-xl border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-3 text-sm text-[var(--color-warning)]">
          ⚠ {preset.ltvBps / 100}% LTV is at/above the live break-even of {fmtPct(breakEvenBps! / 100)}.
          Debt interest outruns collateral yield — the position bleeds unless reward incentives cover
          the gap. Drop to a lower-LTV preset to stay self-repaying.
        </p>
      )}
      {version === "v2" && netCarryPct !== undefined && netCarryPct < 0 && (
        <p className="mt-4 rounded-xl border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-3 text-sm text-[var(--color-warning)]">
          ⚠ Aave rate spread is {fmtPct(netCarryPct)} right now — the staking yield must cover this gap
          for positive carry.
        </p>
      )}

      {/* Simulator */}
      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--color-ink-2)]">Deposit amount</span>
            <input
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              inputMode="decimal"
              className="mono-num w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 text-[var(--color-ink)]"
            />
          </label>
          <p className="text-xs text-[var(--color-ink-3)]">
            Preview at {preset.label.toLowerCase()} — {preset.ltvBps / 100}% LTV × {preset.cycles} cycles
            {version === "v2" && ` · ${preset.slippageBps / 100}% max slippage`}.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 self-start rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)]/60 p-4">
          <Stat label="Gross exposure" value={sim.supplied.toFixed(3)} />
          <Stat label="Total debt" value={sim.debt.toFixed(3)} />
          <Stat label="Your equity" value={sim.equity.toFixed(3)} />
          <Stat label="Leverage" value={`${sim.leverage.toFixed(2)}×`} />
        </div>
      </div>
      {version === "v1" && (
        <p className="mt-3 text-xs text-[var(--color-ink-3)]">
          Gross exposure ≠ price exposure for a same-asset loop — net directional exposure stays at your
          equity ({sim.equity.toFixed(2)}).
        </p>
      )}

      {/* Actions */}
      {!vaultLive ? (
        <p className="mt-6 text-sm text-[var(--color-ink-3)]">Deploy the vault to enable actions.</p>
      ) : (
        <div className="mt-6 flex flex-wrap gap-2.5">
          <Btn onClick={doDeposit} disabled={isPending} primary>Deposit</Btn>
          <Btn onClick={applyPreset} disabled={isPending}>Apply {preset.label}</Btn>
          <Btn onClick={() => w("leverage")} disabled={isPending}>Leverage</Btn>
          {version === "v2" && <Btn onClick={() => w("leverageFlash")} disabled={isPending}>Flash leverage</Btn>}
          {version === "v1" && <Btn onClick={() => w("harvestAndRepay")} disabled={isPending}>Harvest</Btn>}
          {version === "v2" && <Btn onClick={() => w("rebalance", [0n])} disabled={isPending}>Rebalance</Btn>}
          <Btn onClick={() => w("deleverage", [2n ** 256n - 1n])} disabled={isPending}>Deleverage</Btn>
          <Btn onClick={() => w("emergencyUnwind")} disabled={isPending} danger>Emergency unwind</Btn>
        </div>
      )}
    </section>
  );
}

/* ── atoms ── */
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="surface rounded-2xl p-6">
      <h2 className="mb-4 text-lg">{title}</h2>
      {children}
    </section>
  );
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
function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-[var(--color-ink-2)]">{children}</p>;
}
function Btn({ children, onClick, disabled, primary, danger }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; primary?: boolean; danger?: boolean;
}) {
  const base = "rounded-full px-4 py-2 text-sm font-medium transition-colors duration-[var(--dur-fast)] disabled:opacity-40";
  const style = danger
    ? "border border-[var(--color-danger)]/50 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"
    : primary
      ? "bg-[var(--color-accent)] text-[var(--color-paper)] hover:bg-[var(--color-accent-2)]"
      : "border border-[var(--color-line)] text-[var(--color-ink)] hover:border-[var(--color-ink-3)]";
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${style}`}>
      {children}
    </button>
  );
}
