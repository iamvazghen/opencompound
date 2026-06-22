"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useChainId, useReadContract, useReadContracts } from "wagmi";
import { erc20Abi, parseUnits, isAddress } from "viem";
import { Nav } from "@/components/Nav";
import { vaultAbi } from "@/lib/vaultAbi";
import { yieldVaultAbi } from "@/lib/yieldVaultAbi";
import { aavePoolAbi } from "@/lib/aaveAbi";
import { aavePool, vaultAddress, ZERO, explorerBase, aaveMarketUrl, v1Markets, type VaultVersion } from "@/lib/config";
import { simulate, RISK_PRESETS, netCarryPctAtLtv, type RiskPreset } from "@/lib/sim";
import { fmtUsd, fmtHealth, rayToPct, fmtPct } from "@/lib/format";
import { useTx } from "@/lib/useTx";

export default function Dashboard() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [version, setVersion] = useState<VaultVersion>("v1");
  const [assetIdx, setAssetIdx] = useState(0);
  // Watch-only: paste any address to view its activity without connecting; no actions possible.
  const [watchInput, setWatchInput] = useState("");
  const [watchAddress, setWatchAddress] = useState<`0x${string}` | undefined>();
  const viewAddress = watchAddress ?? address;
  const readOnly = !!watchAddress; // watching = read-only even if a wallet is also connected

  const pool = aavePool(chainId);
  const markets = v1Markets(chainId);
  const v1Market = markets[assetIdx] ?? markets[0];
  // v1: pick the per-asset vault; v2: the single wstETH/WETH market.
  const vault = version === "v1" ? (v1Market?.vault ?? ZERO) : vaultAddress(chainId, "v2");
  const decimals = version === "v1" ? (v1Market?.decimals ?? 18) : 18;
  const vaultLive = vault !== ZERO;
  const abi = version === "v1" ? vaultAbi : yieldVaultAbi;

  // Aave position of the viewed address (connected wallet, or a watched address).
  const aave = useReadContract({
    address: pool === ZERO ? undefined : pool,
    abi: aavePoolAbi,
    functionName: "getUserAccountData",
    args: viewAddress ? [viewAddress] : undefined,
    query: { enabled: !!viewAddress && pool !== ZERO },
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
    "maxSafeLtvBps", // index [8] — DYNAMIC: live liquidation threshold × safety buffer
  ];
  if (version === "v2") fns.push("stakingYieldRay"); // index [9], v2 only
  const vaultReads = useReadContracts({
    contracts: vaultLive ? fns.map((functionName) => ({ address: vault, abi, functionName })) : [],
    query: { enabled: vaultLive },
  });

  // The viewed address's stake IN the vault (its shares × share price). This is the position
  // a user actually holds through OpenCompound — distinct from any direct Aave position.
  const userVault = useReadContracts({
    contracts:
      vaultLive && viewAddress
        ? [
            { address: vault, abi, functionName: "balanceOf", args: [viewAddress] },
            { address: vault, abi, functionName: "totalSupply" },
          ]
        : [],
    query: { enabled: vaultLive && !!viewAddress },
  });
  const userShares = (userVault.data?.[0]?.result as bigint) ?? 0n;
  const totalSupplyBn = (userVault.data?.[1]?.result as bigint) ?? 0n;
  const totalAssetsBn = (vaultReads.data?.[0]?.result as bigint) ?? 0n;
  const userAssets = totalSupplyBn > 0n ? (totalAssetsBn * userShares) / totalSupplyBn : 0n;

  // Live carry signal — break-even, recommended LTV, and the effective supply/borrow APRs.
  // For v2 the effective supply adds the configured staking yield (mirrors the contract).
  const signal = useMemo(() => {
    const rate = vaultReads.data?.[7]?.result as readonly [bigint, bigint] | undefined;
    if (!rate) return {};
    const borrowPct = rayToPct(rate[1]);
    let supplyPct = rayToPct(rate[0]);
    if (version === "v2") supplyPct += rayToPct((vaultReads.data?.[9]?.result as bigint) ?? 0n);
    return {
      breakEvenBps: Number((vaultReads.data?.[5]?.result as bigint) ?? 0n),
      recommendedBps: Number((vaultReads.data?.[6]?.result as bigint) ?? 0n),
      safeBps: Number((vaultReads.data?.[8]?.result as bigint) ?? 0n),
      supplyPct,
      borrowPct,
    };
  }, [vaultReads.data, version]);

  const startWatch = () => {
    if (isAddress(watchInput.trim())) setWatchAddress(watchInput.trim() as `0x${string}`);
  };

  // Refresh every on-chain read after a transaction confirms, so the dashboard stops going stale.
  const refetchAll = () => {
    vaultReads.refetch();
    userVault.refetch();
    aave.refetch();
  };

  // Render a stable shell until mounted so the first client paint matches the server
  // (wallet connection state is only known client-side → otherwise a hydration mismatch).
  const [mounted, setMounted] = useState(false);
  // Flip to client-only after first paint so SSR and first client render agree (wallet state is
  // client-only) — avoids a hydration mismatch. The cascading-render the lint rule warns about is
  // exactly the intent here (one extra render to swap the shell for the real UI).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <>
        <Nav connect />
        <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
          {/* Branded skeleton — mirrors the dashboard layout to avoid layout shift on load. */}
          <div className="flex items-center gap-3">
            <span className="text-2xl text-[var(--color-accent)]">◇</span>
            <div className="h-9 w-48 animate-pulse rounded bg-[var(--color-paper-2)]" />
          </div>
          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
            <Skeleton h="h-40" />
            <Skeleton h="h-40" />
          </div>
          <Skeleton h="h-64" className="mt-6" />
          <p className="mt-6 flex items-center gap-2 text-sm text-[var(--color-ink-3)]">
            <span className="size-3 animate-spin rounded-full border-2 border-[var(--color-line)] border-t-[var(--color-accent)]" />
            Loading on-chain data…
          </p>
        </main>
      </>
    );
  }

  if (!isConnected && !watchAddress) {
    return (
      <>
        <Nav connect />
        <main id="main-content" className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
          <h1 className="text-[var(--text-display-s)]">Connect or watch</h1>
          <p className="max-w-md text-[var(--color-ink-2)]">
            Connect a wallet to act — or paste any address to watch its activity read-only, no
            connection needed.
          </p>
          <appkit-button balance="hide" />
          <div className="mt-2 flex w-full max-w-md gap-2">
            <input
              value={watchInput}
              onChange={(e) => setWatchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && startWatch()}
              placeholder="0x… address to watch"
              aria-label="Address to watch"
              className="mono-num flex-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 text-sm text-[var(--color-ink)]"
            />
            <button
              onClick={startWatch}
              disabled={!isAddress(watchInput.trim())}
              className="rounded-lg border border-[var(--color-line)] px-4 py-2 text-sm text-[var(--color-ink)] hover:border-[var(--color-ink-3)] disabled:opacity-40"
            >
              Watch
            </button>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Nav connect />
      <main id="main-content" className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        {readOnly && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 p-3 text-sm">
            <span className="text-[var(--color-ink)]">
              👁 Watch-only — viewing <span className="mono-num text-[var(--color-accent)]">{watchAddress?.slice(0, 6)}…{watchAddress?.slice(-4)}</span>. No actions possible.
            </span>
            <button
              onClick={() => { setWatchAddress(undefined); setWatchInput(""); }}
              className="rounded-full border border-[var(--color-line)] px-3 py-1 text-[var(--color-ink-2)] hover:border-[var(--color-ink-3)]"
            >
              Exit watch
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[var(--text-display-s)]">Dashboard</h1>
            <p className="mt-1 text-sm text-[var(--color-ink-3)]">
              {version === "v1"
                ? `Self-repaying loan · ${v1Market?.symbol ?? "—"}`
                : "Yield-Differential · wstETH / WETH"}
            </p>
          </div>
          <VersionToggle version={version} setVersion={setVersion} />
        </div>

        {/* v1 asset selector — the same vault logic works for any Aave-listed asset */}
        {version === "v1" && markets.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="text-sm text-[var(--color-ink-3)]">Asset:</span>
            {markets.map((m, i) => (
              <button
                key={m.symbol}
                onClick={() => setAssetIdx(i)}
                aria-pressed={i === assetIdx}
                className={`rounded-full border px-4 py-1.5 text-sm transition-colors duration-[var(--dur-fast)] ${
                  i === assetIdx
                    ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                    : "border-[var(--color-line)] text-[var(--color-ink-2)] hover:border-[var(--color-ink-3)]"
                }`}
              >
                {m.symbol}
              </button>
            ))}
            <span className="text-xs text-[var(--color-ink-3)]">
              + any Aave asset (USDT, WBTC, DAI…) once a vault is deployed for it
            </span>
          </div>
        )}

        {/* Workbench: position rail + strategy/actions */}
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <Panel title="Your direct Aave position">
            {pool === ZERO ? (
              <Muted>Switch to Sepolia or Base Sepolia.</Muted>
            ) : aave.isLoading ? (
              <Muted>Reading on-chain…</Muted>
            ) : aave.data ? (
              <PositionGrid data={aave.data as readonly bigint[]} />
            ) : (
              <Muted>No position found.</Muted>
            )}
            <p className="mt-3 text-xs text-[var(--color-ink-3)]">
              This is what {readOnly ? "this address holds" : "you hold"} on Aave <em>directly</em>. Funds
              you put through a vault show as $0 here — they live under the vault&apos;s address (see Vault
              status). Already supplied to Aave yourself? You can migrate that position in below.
            </p>
          </Panel>

          <Panel title="Vault status">
            {!vaultLive ? (
              <Muted>
                Vault {version} not deployed on this network. After deploying, set{" "}
                <code className="text-[var(--color-accent)]">NEXT_PUBLIC_VAULT_{version.toUpperCase()}_{chainId}</code>.
              </Muted>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat
                  label={`Your position (${version === "v1" ? v1Market?.symbol ?? "" : "wstETH"})`}
                  value={(Number(userAssets) / 10 ** decimals).toLocaleString(undefined, { maximumFractionDigits: 6 })}
                  tone="good"
                />
                <Stat
                  label="Vault total equity"
                  value={(Number(totalAssetsBn) / 10 ** decimals).toLocaleString(undefined, { maximumFractionDigits: 6 })}
                />
                <Stat label="Health" value={fmtHealth((vaultReads.data?.[1]?.result as bigint) ?? 0n)} />
                <Stat label="Target LTV" value={fmtPct(Number((vaultReads.data?.[3]?.result as bigint) ?? 0n) / 100)} />
                <Stat
                  label="Break-even LTV"
                  value={signal.breakEvenBps ? fmtPct(signal.breakEvenBps / 100) : "—"}
                  tone="good"
                />
                <Stat
                  label="Safe LTV (live)"
                  value={signal.safeBps ? fmtPct(signal.safeBps / 100) : "—"}
                  tone="warn"
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
          decimals={decimals}
          maxCycles={Number((vaultReads.data?.[2]?.result as bigint) ?? 4n)}
          targetLtvBps={Number((vaultReads.data?.[3]?.result as bigint) ?? 7000n)}
          breakEvenBps={signal.breakEvenBps}
          recommendedBps={signal.recommendedBps}
          supplyPct={signal.supplyPct}
          borrowPct={signal.borrowPct}
          readOnly={readOnly}
          onUpdated={refetchAll}
        />

        {vaultLive && (
          <section className="surface mt-6 rounded-2xl p-6">
            <h2 className="mb-3 text-lg">Verify on-chain</h2>
            <p className="text-sm text-[var(--color-ink-2)]">
              The vault holds the Aave position <strong>under its own address</strong> (not your wallet),
              so check the vault on the explorer — its aToken balance is what Aave has supplied, the
              variable-debt-token balance is what it borrowed.
            </p>
            <div className="mt-4 flex flex-wrap gap-2.5 text-sm">
              <a
                href={`${explorerBase(chainId)}/address/${vault}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-[var(--color-line)] px-4 py-2 text-[var(--color-ink)] hover:border-[var(--color-ink-3)]"
              >
                Vault on explorer ↗
              </a>
              <a
                href={`${explorerBase(chainId)}/address/${vault}#tokentxns`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-[var(--color-line)] px-4 py-2 text-[var(--color-ink)] hover:border-[var(--color-ink-3)]"
              >
                Aave token transfers ↗
              </a>
              <a
                href={aaveMarketUrl(chainId)}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-[var(--color-line)] px-4 py-2 text-[var(--color-ink)] hover:border-[var(--color-ink-3)]"
              >
                Aave testnet market ↗
              </a>
            </div>
            <p className="mono-num mt-3 text-xs text-[var(--color-ink-3)]">vault: {vault}</p>
          </section>
        )}
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
          aria-pressed={version === v}
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
  decimals,
  maxCycles,
  targetLtvBps,
  breakEvenBps,
  recommendedBps,
  supplyPct,
  borrowPct,
  readOnly,
  onUpdated,
}: {
  version: VaultVersion;
  vault: `0x${string}`;
  vaultLive: boolean;
  abi: typeof vaultAbi | typeof yieldVaultAbi;
  assetAddr?: `0x${string}`;
  decimals: number;
  maxCycles: number;
  targetLtvBps: number;
  breakEvenBps?: number;
  recommendedBps?: number;
  supplyPct?: number;
  borrowPct?: number;
  readOnly: boolean;
  onUpdated: () => void;
}) {
  const { address } = useAccount();
  const chainId = useChainId();
  const run = useTx(chainId);
  const [busy, setBusy] = useState(false);
  const [preset, setPreset] = useState<RiskPreset>(RISK_PRESETS[0]);
  const [deposit, setDeposit] = useState("1");
  const isPending = busy;

  // Run one or more writes with toasts; `busy` disables the action buttons until they settle.
  // After they settle, refetch the on-chain reads so the dashboard (and the recommended-LTV
  // banner) reflect the new state instead of going stale.
  const act = async (steps: () => Promise<void>) => {
    setBusy(true);
    try {
      await steps();
    } finally {
      setBusy(false);
      onUpdated();
    }
  };

  const sim = useMemo(() => simulate(Number(deposit) || 0, preset.cycles, preset.ltvBps), [deposit, preset]);
  // Live net carry at the chosen LTV, from current APRs (any asset). Self-repaying below break-even.
  const haveRates = supplyPct !== undefined && borrowPct !== undefined;
  const carryAt = (ltvBps: number) => (haveRates ? netCarryPctAtLtv(supplyPct!, borrowPct!, ltvBps) : undefined);
  const presetCarry = carryAt(preset.ltvBps);
  const selfRepaying = breakEvenBps !== undefined && breakEvenBps > 0 && preset.ltvBps < breakEvenBps;
  const bleeds = breakEvenBps !== undefined && breakEvenBps > 0 && preset.ltvBps >= breakEvenBps;
  // Only nudge the user when the vault's target LTV isn't already at the recommended value
  // (within 0.5%). Once "Apply recommended" confirms and the reads refetch, targetLtvBps catches
  // up to recommendedBps and the banner disappears on its own.
  const recAvailable = recommendedBps !== undefined && recommendedBps > 0;
  const recApplied = recAvailable && Math.abs(targetLtvBps - recommendedBps!) <= 50;

  // Single vault write, wrapped in a toast + receipt wait.
  const w = (label: string, functionName: string, args?: readonly unknown[]) =>
    act(() =>
      run(label, { address: vault, abi: abi as never, functionName: functionName as never, args: args as never }).then(() => {}),
    );

  const doDeposit = () =>
    act(async () => {
      if (!assetAddr || !address) return;
      const wad = parseUnits(deposit || "0", decimals);
      // Approve first; only deposit once the approval has actually confirmed (no more racing).
      const approved = await run("Approve", {
        address: assetAddr,
        abi: erc20Abi,
        functionName: "approve",
        args: [vault, wad],
      });
      if (approved) {
        await run("Deposit", { address: vault, abi: abi as never, functionName: "deposit" as never, args: [wad, address] as never });
      }
    });

  // Migrate an existing Aave supply position: approve the vault for the user's aTokens, then
  // depositAToken — no new funds (v1 only). aToken address read from the vault.
  const aTokenRead = useReadContract({
    address: version === "v1" && vaultLive ? vault : undefined,
    abi: vaultAbi,
    functionName: "aToken",
    query: { enabled: version === "v1" && vaultLive },
  });
  const migrateATokens = () =>
    act(async () => {
      const aTok = aTokenRead.data as `0x${string}` | undefined;
      if (!aTok || !address) return;
      const wad = parseUnits(deposit || "0", decimals);
      const approved = await run("Approve aTokens", { address: aTok, abi: erc20Abi, functionName: "approve", args: [vault, wad] });
      if (approved) {
        await run("Migrate aTokens", { address: vault, abi: abi as never, functionName: "depositAToken" as never, args: [wad, address] as never });
      }
    });
  const setLtv = (ltvBps: number, cycles: number) =>
    version === "v1"
      ? w("Set strategy", "setStrategy", [BigInt(ltvBps), BigInt(cycles)])
      : w("Set strategy", "setStrategy", [BigInt(ltvBps), BigInt(cycles), BigInt(RISK_PRESETS[1].slippageBps)]);
  const applyPreset = () => setLtv(preset.ltvBps, preset.cycles);
  const applyRecommended = () => recommendedBps && setLtv(recommendedBps, preset.cycles);

  const carryColor = (c?: number) =>
    c === undefined ? "text-[var(--color-ink-3)]" : c >= 0 ? "text-[var(--color-positive)]" : "text-[var(--color-warning)]";

  return (
    <section className="surface mt-6 rounded-2xl p-6">
      <h2 className="text-lg">Strategy</h2>

      {/* Live recommendation from current Aave rates — hidden once the target is already there */}
      {recommendedBps && !recApplied ? (
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
      ) : recApplied ? (
        <p className="mt-4 rounded-xl border border-[var(--color-positive)]/30 bg-[var(--color-positive)]/10 p-3 text-sm text-[var(--color-positive)]">
          ✓ Target LTV is at the recommended {fmtPct(recommendedBps! / 100)} — no change needed.
        </p>
      ) : null}

      {/* Risk presets — each annotated with its live net carry */}
      <div className="mt-4 flex flex-wrap gap-2">
        {RISK_PRESETS.map((p) => {
          const c = carryAt(p.ltvBps);
          return (
            <button
              key={p.key}
              onClick={() => setPreset(p)}
              aria-pressed={preset.key === p.key}
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
      {readOnly ? (
        <p className="mt-6 rounded-xl border border-[var(--color-line)] bg-[var(--color-paper-2)] p-3 text-sm text-[var(--color-ink-3)]">
          👁 Watch-only — all data is visible, but actions are disabled. Connect a wallet to act.
        </p>
      ) : !vaultLive ? (
        <p className="mt-6 text-sm text-[var(--color-ink-3)]">Deploy the vault to enable actions.</p>
      ) : (
        <div className="mt-6 flex flex-wrap gap-2.5">
          <Btn onClick={doDeposit} disabled={isPending} primary>Deposit</Btn>
          {version === "v1" && (
            <Btn onClick={migrateATokens} disabled={isPending}>Migrate aTokens</Btn>
          )}
          <Btn onClick={applyPreset} disabled={isPending}>Apply {preset.label}</Btn>
          <Btn onClick={() => w("Flash leverage", "leverageFlash")} disabled={isPending} primary>Flash leverage</Btn>
          <Btn onClick={() => w("Leverage", "leverage")} disabled={isPending}>Leverage (loop)</Btn>
          {version === "v1" && <Btn onClick={() => w("Harvest", "harvestAndRepay")} disabled={isPending}>Harvest</Btn>}
          {version === "v2" && <Btn onClick={() => w("Rebalance", "rebalance", [0n])} disabled={isPending}>Rebalance</Btn>}
          {version === "v1" ? (
            <Btn onClick={() => w("Flash unwind", "deleverageFlash")} disabled={isPending}>Flash unwind</Btn>
          ) : (
            <Btn onClick={() => w("Deleverage", "deleverage", [2n ** 256n - 1n])} disabled={isPending}>Deleverage</Btn>
          )}
          <Btn onClick={() => w("Guard", "guard")} disabled={isPending}>Guard</Btn>
          <Btn onClick={() => w("Emergency unwind", "emergencyUnwind")} disabled={isPending} danger>Emergency unwind</Btn>
        </div>
      )}
      {!readOnly && (
        <p className="mt-3 text-xs text-[var(--color-ink-3)]">
          Flash leverage hits the exact target LTV in one tx; Flash unwind clears all debt in one tx.
          <strong className="text-[var(--color-ink-2)]"> Guard</strong> is permissionless — anyone (or a
          keeper bot) can call it to deleverage the position back to target if LTV ever rises above the
          Safe LTV, protecting it from liquidation even when you&apos;re away. It reverts if the position
          is already safe.
        </p>
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
function Skeleton({ h, className = "" }: { h: string; className?: string }) {
  return <div className={`${h} ${className} animate-pulse rounded-2xl border border-[var(--color-line)] bg-[var(--color-paper-2)]`} />;
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
