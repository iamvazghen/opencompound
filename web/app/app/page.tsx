"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useChainId, useReadContract, useReadContracts } from "wagmi";
import { erc20Abi, parseUnits, isAddress } from "viem";
import { Nav } from "@/components/Nav";
import { vaultAbi } from "@/lib/vaultAbi";
import { yieldVaultAbi } from "@/lib/yieldVaultAbi";
import { aavePoolAbi } from "@/lib/aaveAbi";
import { aavePool, vaultAddress, ZERO, explorerBase, aaveMarketUrl, v1Markets, type VaultVersion } from "@/lib/config";
import { simulate, netCarryPctAtLtv } from "@/lib/sim";
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
          userShares={userShares}
          userAssets={userAssets}
          symbol={version === "v1" ? (v1Market?.symbol ?? "") : "wstETH"}
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
  userShares,
  userAssets,
  symbol,
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
  userShares: bigint;
  userAssets: bigint;
  symbol: string;
}) {
  const { address } = useAccount();
  const chainId = useChainId();
  const run = useTx(chainId);
  const [busy, setBusy] = useState(false);
  const [deposit, setDeposit] = useState("1");
  const [withdrawAmt, setWithdrawAmt] = useState("");
  const isPending = busy;

  // Each action runs as the connected user and touches only THEIR shares; on settle we refetch so
  // the dashboard reflects the new state. There are deliberately no owner/governance actions here.
  const act = async (steps: () => Promise<void>) => {
    setBusy(true);
    try {
      await steps();
    } finally {
      setBusy(false);
      onUpdated();
    }
  };

  // Read-only view of the vault's (governance-set) strategy applied to the user's deposit.
  const sim = useMemo(() => simulate(Number(deposit) || 0, maxCycles, targetLtvBps), [deposit, maxCycles, targetLtvBps]);
  const haveRates = supplyPct !== undefined && borrowPct !== undefined;
  const carryAt = (ltvBps: number) => (haveRates ? netCarryPctAtLtv(supplyPct!, borrowPct!, ltvBps) : undefined);
  const targetCarry = carryAt(targetLtvBps);
  const vaultSelfRepaying = breakEvenBps !== undefined && breakEvenBps > 0 && targetLtvBps < breakEvenBps;
  const userPos = Number(userAssets) / 10 ** decimals;

  const doDeposit = () =>
    act(async () => {
      if (!assetAddr || !address) return;
      const wad = parseUnits(deposit || "0", decimals);
      const approved = await run("Approve", { address: assetAddr, abi: erc20Abi, functionName: "approve", args: [vault, wad] });
      if (approved) {
        await run("Deposit", { address: vault, abi: abi as never, functionName: "deposit" as never, args: [wad, address] as never });
      }
    });

  // Exit your stake. Full exit redeems all your shares; partial withdraws an exact asset amount.
  // Either way, if the vault is leveraged your slice is flash-unwound proportionally on-chain, so
  // other depositors' LTV is untouched.
  const doWithdraw = (all: boolean) =>
    act(async () => {
      if (!address || userShares === 0n) return;
      if (all) {
        await run("Withdraw all", { address: vault, abi: abi as never, functionName: "redeem" as never, args: [userShares, address, address] as never });
      } else {
        const amt = parseUnits(withdrawAmt || "0", decimals);
        if (amt === 0n) return;
        await run("Withdraw", { address: vault, abi: abi as never, functionName: "withdraw" as never, args: [amt, address, address] as never });
      }
    });

  // Migrate an existing Aave supply position (v1): approve aTokens to the vault, then depositAToken.
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

  return (
    <section className="surface mt-6 rounded-2xl p-6">
      <h2 className="text-lg">Manage your position</h2>
      <p className="mt-1 text-sm text-[var(--color-ink-3)]">
        You manage only your own deposits and withdrawals. The vault&apos;s leverage strategy is set by
        the vault owner / community governance — there are deliberately no owner controls here.
      </p>

      {readOnly ? (
        <p className="mt-5 rounded-xl border border-[var(--color-line)] bg-[var(--color-paper-2)] p-3 text-sm text-[var(--color-ink-3)]">
          👁 Watch-only — all data is visible, but actions are disabled. Connect a wallet to act.
        </p>
      ) : !vaultLive ? (
        <p className="mt-5 text-sm text-[var(--color-ink-3)]">Vault not deployed on this network.</p>
      ) : (
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {/* Deposit / migrate */}
          <div className="space-y-3 rounded-xl border border-[var(--color-line)] p-4">
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--color-ink-2)]">Deposit amount ({symbol})</span>
              <input
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
                inputMode="decimal"
                aria-label="Deposit amount"
                className="mono-num w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 text-[var(--color-ink)]"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Btn onClick={doDeposit} disabled={isPending} primary>Deposit</Btn>
              {version === "v1" && <Btn onClick={migrateATokens} disabled={isPending}>Migrate aTokens</Btn>}
            </div>
            <p className="text-xs text-[var(--color-ink-3)]">
              Deposit supplies to Aave and mints you vault shares. Migrate brings an existing Aave
              position in — no new funds.
            </p>
          </div>

          {/* Withdraw your shares */}
          <div className="space-y-3 rounded-xl border border-[var(--color-line)] p-4">
            <label className="block text-sm">
              <span className="mb-1 flex items-center justify-between text-[var(--color-ink-2)]">
                Withdraw amount ({symbol})
                <button
                  type="button"
                  onClick={() => setWithdrawAmt(userPos > 0 ? String(userPos) : "")}
                  className="text-xs text-[var(--color-accent)] hover:underline"
                >
                  Max {userPos.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                </button>
              </span>
              <input
                value={withdrawAmt}
                onChange={(e) => setWithdrawAmt(e.target.value)}
                inputMode="decimal"
                placeholder="0.0"
                aria-label="Withdraw amount"
                className="mono-num w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 text-[var(--color-ink)]"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Btn onClick={() => doWithdraw(false)} disabled={isPending || userShares === 0n}>Withdraw</Btn>
              <Btn onClick={() => doWithdraw(true)} disabled={isPending || userShares === 0n}>Withdraw all</Btn>
            </div>
            <p className="text-xs text-[var(--color-ink-3)]">
              Exits your shares. If the vault is leveraged, your slice is flash-unwound proportionally
              on-chain — you exit cleanly without affecting other depositors.
            </p>
          </div>
        </div>
      )}

      {/* Vault strategy — read-only (governance-managed) */}
      <div className="mt-6 border-t border-[var(--color-line)] pt-5">
        <h3 className="text-xs uppercase tracking-widest text-[var(--color-ink-3)]">Vault strategy · read-only</h3>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Target LTV" value={fmtPct(targetLtvBps / 100)} />
          <Stat label="Break-even LTV" value={breakEvenBps ? fmtPct(breakEvenBps / 100) : "—"} tone="good" />
          <Stat label="Recommended LTV" value={recommendedBps ? fmtPct(recommendedBps / 100) : "—"} />
          <Stat
            label="Net carry @ target"
            value={targetCarry !== undefined ? fmtPct(targetCarry) : "—"}
            tone={targetCarry !== undefined && targetCarry >= 0 ? "good" : "warn"}
          />
        </div>
        {breakEvenBps ? (
          vaultSelfRepaying ? (
            <p className="mt-4 rounded-xl border border-[var(--color-positive)]/40 bg-[var(--color-positive)]/10 p-3 text-sm text-[var(--color-positive)]">
              ✓ This vault is self-repaying — its target {fmtPct(targetLtvBps / 100)} is below break-even{" "}
              {fmtPct(breakEvenBps / 100)}, so collateral yield covers the debt interest and equity grows.
            </p>
          ) : (
            <p className="mt-4 rounded-xl border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-3 text-sm text-[var(--color-warning)]">
              ⚠ The vault&apos;s target {fmtPct(targetLtvBps / 100)} is at/above break-even {fmtPct(breakEvenBps / 100)} —
              it bleeds unless rewards cover the gap. Changing the target is a governance action, not an LP one.
            </p>
          )
        ) : null}

        <div className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr]">
          <p className="self-center text-xs text-[var(--color-ink-3)]">
            Preview — a deposit of {Number(deposit) || 0} {symbol} into this vault (running at{" "}
            {fmtPct(targetLtvBps / 100)} × {maxCycles} cycles) would look like:
          </p>
          <div className="grid grid-cols-2 gap-4 self-start rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)]/60 p-4">
            <Stat label="Gross exposure" value={sim.supplied.toFixed(3)} />
            <Stat label="Total debt" value={sim.debt.toFixed(3)} />
            <Stat label="Your equity" value={sim.equity.toFixed(3)} />
            <Stat label="Leverage" value={`${sim.leverage.toFixed(2)}×`} />
          </div>
        </div>
      </div>
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
