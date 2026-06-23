// OpenCompound keeper — permissionless liquidation protection.
//
// Monitors the pooled vaults + every isolated position (enumerated from PositionFactory) and calls
// guard() on any whose live LTV has drifted above its live safe ceiling. guard() is permissionless
// and ONLY reduces risk (it flash-deleverages back to safety and reverts when already safe), so:
//   • this bot can never move user funds or run owner actions — it can only protect positions;
//   • a leaked keeper key costs at most gas. Fund it with a little gas and nothing else.
//
// Run:  cp .env.example .env && <edit> && node keeper.mjs        (set DRY_RUN=true to only watch)

import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPC = process.env.RPC_URL;
const FACTORY = process.env.FACTORY_ADDRESS?.trim();
const VAULTS = (process.env.POOLED_VAULTS || "").split(",").map((s) => s.trim()).filter(Boolean);
const INTERVAL = Number(process.env.POLL_INTERVAL_MS || 60_000);
const DRY = process.env.DRY_RUN === "true";
const PK = process.env.KEEPER_PRIVATE_KEY;

if (!RPC) throw new Error("set RPC_URL");

// Minimal ABIs — both vaults and isolated positions expose these identical risk views + guard().
const guardableAbi = [
  { type: "function", name: "currentLtvBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "maxSafeLtvBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "guard", stateMutability: "nonpayable", inputs: [], outputs: [] },
];
const factoryAbi = [
  { type: "function", name: "positionsCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allPositions", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "address" }] },
];

const pub = createPublicClient({ transport: http(RPC) });
const chainId = await pub.getChainId();
const chain = { id: chainId, name: `chain-${chainId}`, nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const account = PK ? privateKeyToAccount(PK) : null;
const wallet = account ? createWalletClient({ account, chain, transport: http(RPC) }) : null;

async function listPositions() {
  if (!FACTORY) return [];
  const count = await pub.readContract({ address: FACTORY, abi: factoryAbi, functionName: "positionsCount" });
  const out = [];
  for (let i = 0n; i < count; i++) {
    out.push(await pub.readContract({ address: FACTORY, abi: factoryAbi, functionName: "allPositions", args: [i] }));
  }
  return out;
}

async function checkOne(target) {
  const [ltv, safe] = await Promise.all([
    pub.readContract({ address: target, abi: guardableAbi, functionName: "currentLtvBps" }),
    pub.readContract({ address: target, abi: guardableAbi, functionName: "maxSafeLtvBps" }),
  ]);
  const unsafe = ltv > safe;
  console.log(`  ${target}  LTV ${(Number(ltv) / 100).toFixed(2)}%  safe ${(Number(safe) / 100).toFixed(2)}%  ${unsafe ? "⚠ UNSAFE → guard()" : "ok"}`);
  if (!unsafe) return;
  if (!wallet || DRY) {
    console.log(`    ${DRY ? "[dry-run]" : "[no key]"} would call guard()`);
    return;
  }
  try {
    const hash = await wallet.writeContract({ address: target, abi: guardableAbi, functionName: "guard" });
    console.log(`    guarded — tx ${hash}`);
  } catch (e) {
    console.log(`    guard reverted: ${e.shortMessage || e.message}`);
  }
}

async function tick() {
  try {
    const positions = await listPositions();
    const targets = [...VAULTS, ...positions];
    console.log(`[${new Date().toISOString()}] ${targets.length} target(s) (${VAULTS.length} vault(s) + ${positions.length} position(s))`);
    for (const t of targets) {
      try {
        await checkOne(t);
      } catch (e) {
        console.log(`  ${t}  read error: ${e.shortMessage || e.message}`);
      }
    }
  } catch (e) {
    console.log(`tick error: ${e.shortMessage || e.message}`);
  }
}

console.log(`OpenCompound keeper · chain ${chainId} · ${DRY ? "DRY-RUN" : account ? `live as ${account.address}` : "watch-only (no key)"} · every ${INTERVAL}ms`);
await tick();
setInterval(tick, INTERVAL);
