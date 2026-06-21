"use client";

import { useMemo, useState } from "react";
import { useAccount, useChainId, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { erc20Abi, parseUnits } from "viem";
import { Nav } from "@/components/Nav";
import { vaultAbi } from "@/lib/vaultAbi";
import { yieldVaultAbi } from "@/lib/yieldVaultAbi";
import { aavePoolAbi } from "@/lib/aaveAbi";
import { aavePool, vaultAddress, ZERO, type VaultVersion } from "@/lib/config";
import { simulate, RISK_PRESETS, netCarryPctAtLtv, type RiskPreset } from "@/lib/sim";
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

  // Vault reads — shared carry views (both vaults expose them) + the raw rate pair.
  const fns = [
    "totalAssets",
    "healthFactor",
    "maxCycles",
    "targetLtvBps",
    "asset",
    "breakEvenLtvBps",
    "recommendedLtvBps",
    version === "v1" ? "currentRates" : "aaveRates",
  ];
  if (version === "v2") fns.push("stakingYieldRay"); // index [8], v2 only
  const vaultReads = useReadContracts({
    contracts: vaultLive ? fns.map((functionName) => ({ address: vault, abi, functionName })) : [],
    query: { enabled: vaultLive },
  });

  // Live carry signal — break-even, recommended LTV, and the effective supply/borrow APRs.
  // For v2 the effective supply adds the configured staking yield (mirrors the contract).
  const signal = useMemo(() => {
    const rate = vaultReads.data?.[7]?.result as readonly [bigint, bigint] | undefined;
    if (!rate) return {};
    const borrowPct = rayToPct(rate[1]);
    let supplyPct = rayToPct(rate[0]);
    if (version === "v2") supplyPct += rayToPct((vaultReads.data?.[8]?.result as bigint) ?? 0n);
    return {
      breakEvenBps: Number((vaultReads.data?.[5]?.result as bigint) ?? 0n),
      recommendedBps: Number((vaultReads.data?.[6]?.result as bigint) ?? 0n),
      supplyPct,
      borrowPct,
    };
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
                <Stat
                  label="Break-even LTV"
                  value={signal.breakEvenBps ? fmtPct(signal.breakEvenBps / 100) : "—"}
                  tone="good"
                />
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
          recommendedBps={signal.recommendedBps}
          supplyPct={signal.supplyPct}
          borrowPct={signal.borrowPct}
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
  recommendedBps,
  supplyPct,
  borrowPct,
}: {
  version: VaultVersion;
  vault: `0x${string}`;
  vaultLive: boolean;
  abi: typeof vaultAbi | typeof yieldVaultAbi;
  assetAddr?: `0x${string}`;
  maxCycles: number;
  targetLtvBps: number;
  breakEvenBps?: number;
  recommendedBps?: number;
  supplyPct?: number;
  borrowPct?: number;
}) {
  const { address } = useAccount();
  const { writeContract, isPending } = useWriteContract();
  const [preset, setPreset] = useState<RiskPreset>(RISK_PRESETS[0]);
  const [deposit, setDeposit] = useState("1");

  const sim = useMemo(() => simulate(Number(deposit) || 0, preset.cycles, preset.ltvBps), [deposit, preset]);
  // Live net carry at the chosen LTV, from current APRs (any asset). Self-repaying below break-even.
  const haveRates = supplyPct !== undefined && borrowPct !== undefined;
  const carryAt = (ltvBps: number) => (haveRates ? netCarryPctAtLtv(supplyPct!, borrowPct!, ltvBps) : undefined);
  const presetCarry = carryAt(preset.ltvBps);
  const selfRepaying = breakEvenBps !== undefined && breakEvenBps > 0 && preset.ltvBps < breakEvenBps;
  const bleeds = breakEvenBps !== undefined && breakEvenBps > 0 && preset.ltvBps >= breakEvenBps;

  const w = (functionName: string, args?: readonly unknown[]) =>
    writeContract({ address: vault, abi: abi as never, functionName: functionName as never, args: args as never });

  const doDeposit = () => {
    if (!assetAddr || !address) return;
    const wad = parseUnits(deposit || "0", 18);
    writeContract({ address: assetAddr, abi: erc20Abi, functionName: "approve", args: [vault, wad] });
    w("deposit", [wad, address]);
  };
  const setLtv = (ltvBps: number, cycles: number) =>
    version === "v1"
      ? w("setStrategy", [BigInt(ltvBps), BigInt(cycles)])
      : w("setStrategy", [BigInt(ltvBps), BigInt(cycles), BigInt(RISK_PRESETS[1].slippageBps)]);
  const applyPreset = () => setLtv(preset.ltvBps, preset.cycles);
  const applyRecommended = () => recommendedBps && setLtv(recommendedBps, preset.cycles);

  const carryColor = (c?: number) =>
    c === undefined ? "text-[var(--color-ink-3)]" : c >= 0 ? "text-[var(--color-positive)]" : "text-[var(--color-warning)]";

  return (
    <section className="surface mt-6 rounded-2xl p-6">
      <h2 className="text-lg">Strategy</h2>

      {/* Live recommendation from current Aave rates */}
      {recommendedBps ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5 p-4">
          <div className="text-sm">
            <p className="text-[var(--color-ink)]">
              Recommended LTV{" "}
              <span className="mono-num text-[var(--color-accent)]">{fmtPct(recommendedBps / 100)}</span>{" "}
              <span className="text-[var(--color-ink-3)]">
                — 10% below break-even {fmtPct((breakEvenBps ?? 0) / 100)}; net carry{" "}
                <span className={`mono-num ${carryColor(carryAt(recommendedBps))}`}>
                  {carryAt(recommendedBps) !== undefined ? fmtPct(carryAt(recommendedBps)!) : "—"}
                </span>
              </span>
            </p>
            <p className="mt-1 text-xs text-[var(--color-ink-3)]">
              Highest self-repaying LTV at the current supply {fmtPct(supplyPct ?? 0)} / borrow{" "}
              {fmtPct(borrowPct ?? 0)} rates.
            </p>
          </div>
          <Btn onClick={applyRecommended} disabled={isPending} primary>Apply recommended</Btn>
        </div>
      ) : null}

      {/* Risk presets — each annotated with its live net carry */}
      <div className="mt-4 flex flex-wrap gap-2">
        {RISK_PRESETS.map((p) => {
          const c = carryAt(p.ltvBps);
          return (
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
              <span className="mono-num ml-2 text-xs text-[var(--color-ink-3)]">{p.ltvBps / 100}%</span>
              {c !== undefined && (
                <span className={`mono-num ml-2 text-xs ${carryColor(c)}`}>{c >= 0 ? "+" : ""}{c.toFixed(1)}%</span>
              )}
            </button>
          );
        })}
      </div>

      {selfRepaying && (
        <p className="mt-4 rounded-xl border border-[var(--color-positive)]/40 bg-[var(--color-positive)]/10 p-3 text-sm text-[var(--color-positive)]">
          ✓ Self-repaying at {preset.ltvBps / 100}% LTV — below break-even {fmtPct(breakEvenBps! / 100)}.
          {presetCarry !== undefined && <> Net carry on your equity ≈ {fmtPct(presetCarry)}.</>} Collateral
          yield covers the debt interest, so equity grows and the loan repays itself.
        </p>
      )}
      {bleeds && (
        <p className="mt-4 rounded-xl border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-3 text-sm text-[var(--color-warning)]">
          ⚠ {preset.ltvBps / 100}% LTV is at/above break-even {fmtPct(breakEvenBps! / 100)} — net carry{" "}
          {presetCarry !== undefined ? fmtPct(presetCarry) : "negative"}. The position bleeds unless
          rewards cover the gap. Use a lower preset or the recommended LTV to stay self-repaying.
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
