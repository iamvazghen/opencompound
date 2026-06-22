"use client";

import { useCallback } from "react";
import { useConfig, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import type { Config } from "wagmi";
import { useToast } from "@/components/Toast";
import { explorerBase } from "@/lib/config";

/** Friendly one-liner from a wagmi/viem write error (user-rejection, revert reason, or fallback). */
function shortError(e: unknown): string {
  const m = (e as { shortMessage?: string; message?: string })?.shortMessage ?? (e as Error)?.message ?? "Transaction failed";
  if (/user rejected|denied/i.test(m)) return "Rejected in wallet";
  return m.length > 120 ? m.slice(0, 117) + "…" : m;
}

type WriteParams = Parameters<ReturnType<typeof useWriteContract>["writeContractAsync"]>[0];

/**
 * Returns `run(label, params)` — sends a contract write, toasts pending → confirming (with an
 * explorer link) → confirmed/failed, and AWAITS the receipt so dependent steps (e.g. deposit after
 * approve) don't race. Returns true on confirmed, false on revert/rejection.
 */
export function useTx(chainId: number) {
  const { writeContractAsync } = useWriteContract();
  const config = useConfig() as Config;
  const toast = useToast();

  return useCallback(
    async (label: string, params: WriteParams): Promise<boolean> => {
      const id = toast.push({ kind: "pending", msg: `${label}…` });
      try {
        const hash = await writeContractAsync(params);
        const href = `${explorerBase(chainId)}/tx/${hash}`;
        toast.update(id, { msg: `${label} — confirming…`, href });
        await waitForTransactionReceipt(config, { hash });
        toast.update(id, { kind: "success", msg: `${label} confirmed`, href });
        return true;
      } catch (e) {
        toast.update(id, { kind: "error", msg: `${label}: ${shortError(e)}` });
        return false;
      }
    },
    [writeContractAsync, config, toast, chainId],
  );
}
