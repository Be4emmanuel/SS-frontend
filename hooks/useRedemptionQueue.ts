"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { API_BASE, readApiJson } from "@/lib/api/shared";
import { useWallet } from "@/context/WalletContext";

export type RedemptionRequestStatus =
  | "queued"
  | "processing"
  | "processed"
  | "cancelled";

export interface RedemptionRequest {
  id: string;
  pool_id: string;
  shares: number;
  status: RedemptionRequestStatus;
  queue_position: number | null;
  estimated_epoch: number | null;
  payout_amount?: number | null;
  nav_used?: number | null;
  created_at: string;
  processed_at?: string | null;
}

export interface EpochCapacity {
  epoch_number: number;
  filled_shares: number;
  cap_shares: number;
  next_epoch_at?: string | null;
}

export interface RedemptionQueueState {
  pool_id: string;
  user_shares: number;
  current_nav: number;
  queue_position: number | null;
  epoch: EpochCapacity;
  requests: RedemptionRequest[];
}

export function redemptionQueueQueryKey(poolId: string, address?: string | null) {
  return ["redemption-queue", poolId, address ?? "anonymous"] as const;
}

async function fetchRedemptionQueue(
  poolId: string,
  address?: string | null,
): Promise<RedemptionQueueState> {
  const query = address ? `?wallet=${encodeURIComponent(address)}` : "";
  const res = await fetch(
    `${API_BASE}/pools/${encodeURIComponent(poolId)}/redemptions${query}`,
  );
  const data = await readApiJson<RedemptionQueueState & { message?: string }>(res);
  if (!res.ok) {
    throw new Error(data.message ?? "Failed to fetch redemption queue");
  }
  return data;
}

async function submitRedemptionRequest(
  poolId: string,
  shares: number,
  wallet?: string | null,
): Promise<RedemptionRequest> {
  const res = await fetch(
    `${API_BASE}/pools/${encodeURIComponent(poolId)}/redemptions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shares, ...(wallet ? { wallet } : {}) }),
    },
  );
  const data = await readApiJson<RedemptionRequest & { message?: string }>(res);
  if (!res.ok) {
    throw new Error(data.message ?? "Failed to submit redemption request");
  }
  return data;
}

async function cancelRedemptionRequest(
  poolId: string,
  requestId: string,
  wallet?: string | null,
): Promise<{ id: string; status: "cancelled" }> {
  const res = await fetch(
    `${API_BASE}/pools/${encodeURIComponent(poolId)}/redemptions/${encodeURIComponent(requestId)}/cancel`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(wallet ? { wallet } : {}),
    },
  );
  const data = await readApiJson<{ id: string; status: "cancelled"; message?: string }>(res);
  if (!res.ok) {
    throw new Error(data.message ?? "Failed to cancel redemption request");
  }
  return data;
}

/**
 * Reads the user's pooled redemption requests, contract queue position, and
 * current epoch cap usage (#614).
 */
export function useRedemptionQueue(poolId: string) {
  const { address } = useWallet();
  const queryKey = redemptionQueueQueryKey(poolId, address);

  const query = useQuery({
    queryKey,
    queryFn: () => fetchRedemptionQueue(poolId, address),
    enabled: Boolean(poolId),
    staleTime: 15_000,
  });

  return {
    ...query,
    requests: query.data?.requests ?? [],
    userShares: query.data?.user_shares ?? 0,
    currentNav: query.data?.current_nav ?? 1,
    queuePosition: query.data?.queue_position ?? null,
    epoch: query.data?.epoch ?? {
      epoch_number: 1,
      filled_shares: 0,
      cap_shares: 0,
    },
  };
}

export function useRequestRedemption(poolId: string) {
  const { address } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (shares: number) =>
      submitRedemptionRequest(poolId, shares, address),
    onSuccess: () => {
      toast.success("Redemption request queued");
      queryClient.invalidateQueries({
        queryKey: redemptionQueueQueryKey(poolId, address),
      });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to queue redemption request");
    },
  });
}

export function useCancelRedemption(poolId: string) {
  const { address } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (requestId: string) =>
      cancelRedemptionRequest(poolId, requestId, address),
    onSuccess: () => {
      toast.success("Redemption request cancelled");
      queryClient.invalidateQueries({
        queryKey: redemptionQueueQueryKey(poolId, address),
      });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to cancel redemption request");
    },
  });
}
