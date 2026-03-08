/**
 * React hook that polls the LINK-based Swarm contracts
 * on Ethereum Sepolia every 30 seconds.
 *
 * Parallel to useSwarmData.ts (Hedera) — kept fully separate.
 *
 * Usage:
 *   const { tasks, agents, asnRecords, isLoading, error } = useLinkData();
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";
import {
  SEPOLIA_RPC_URL,
  LINK_CONTRACTS,
  LINK_AGENT_REGISTRY_ABI,
  LINK_TASK_BOARD_ABI,
  LINK_ASN_REGISTRY_ABI,
  LINK_TREASURY_ABI,
  toLinkUnits,
  type LinkAgentProfile,
  type LinkASNRecord,
} from "@/lib/link-contracts";
import type { TaskListing, TreasuryPnL } from "@/lib/swarm-contracts";

const POLL_INTERVAL = 30_000;

interface LinkData {
  tasks: TaskListing[];
  agents: LinkAgentProfile[];
  asnRecords: LinkASNRecord[];
  totalTasks: number;
  totalAgents: number;
  treasury: TreasuryPnL | null;
  isLoading: boolean;
  error: string | null;
  lastRefresh: Date | null;
  refetch: () => Promise<void>;
}

export function useLinkData(): LinkData {
  const [tasks, setTasks] = useState<TaskListing[]>([]);
  const [agents, setAgents] = useState<LinkAgentProfile[]>([]);
  const [asnRecords, setAsnRecords] = useState<LinkASNRecord[]>([]);
  const [totalTasks, setTotalTasks] = useState(0);
  const [totalAgents, setTotalAgents] = useState(0);
  const [treasury, setTreasury] = useState<TreasuryPnL | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const providerRef = useRef<ethers.JsonRpcProvider | null>(null);
  const isFetchingRef = useRef(false);

  const getProvider = useCallback(() => {
    if (!providerRef.current) {
      providerRef.current = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
    }
    return providerRef.current;
  }, []);

  const fetchData = useCallback(async () => {
    // Skip if contracts aren't deployed yet
    if (!LINK_CONTRACTS.AGENT_REGISTRY && !LINK_CONTRACTS.TASK_BOARD) {
      setIsLoading(false);
      return;
    }

    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      const provider = getProvider();

      // Build contracts only if addresses are set
      const registry = LINK_CONTRACTS.AGENT_REGISTRY
        ? new ethers.Contract(LINK_CONTRACTS.AGENT_REGISTRY, LINK_AGENT_REGISTRY_ABI, provider)
        : null;
      const board = LINK_CONTRACTS.TASK_BOARD
        ? new ethers.Contract(LINK_CONTRACTS.TASK_BOARD, LINK_TASK_BOARD_ABI, provider)
        : null;
      const asnReg = LINK_CONTRACTS.ASN_REGISTRY
        ? new ethers.Contract(LINK_CONTRACTS.ASN_REGISTRY, LINK_ASN_REGISTRY_ABI, provider)
        : null;
      const treasuryContract = LINK_CONTRACTS.TREASURY
        ? new ethers.Contract(LINK_CONTRACTS.TREASURY, LINK_TREASURY_ABI, provider)
        : null;

      // Fetch all data in parallel
      const [rawTasksBulk, rawAgents, taskCount, agentCount, rawPnL, rawASNRecords] =
        await Promise.all([
          board?.getAllTasks().catch(() => null) ?? Promise.resolve(null),
          registry?.getAllAgents().catch(() => []) ?? Promise.resolve([]),
          board?.taskCount().catch(() => BigInt(0)) ?? Promise.resolve(BigInt(0)),
          registry?.agentCount().catch(() => BigInt(0)) ?? Promise.resolve(BigInt(0)),
          treasuryContract?.getPnL().catch(() => null) ?? Promise.resolve(null),
          asnReg?.getAllRecords().catch(() => []) ?? Promise.resolve([]),
        ]);

      // Batch fallback if getAllTasks() reverted
      let rawTasks: unknown[] = rawTasksBulk ?? [];
      if (!rawTasksBulk && Number(taskCount) > 0 && board) {
        const count = Number(taskCount);
        const BATCH = 20;
        const results: unknown[] = [];
        for (let i = 0; i < count; i += BATCH) {
          const batch = Array.from(
            { length: Math.min(BATCH, count - i) },
            (_, j) => board.getTask(i + j).catch(() => null),
          );
          const batchResults = await Promise.all(batch);
          for (const r of batchResults) {
            if (r) results.push(r);
          }
        }
        rawTasks = results;
      }

      // Parse tasks — same tuple as Hedera but budget is in LINK (18 decimals)
      const parsedTasks: TaskListing[] = (rawTasks as unknown[]).map((t: unknown) => {
        const a = t as [bigint, string, string, string, string, bigint, bigint, string, string, string, bigint, number];
        return {
          taskId: Number(a[0]),
          vault: a[1],
          title: a[2],
          description: a[3],
          requiredSkills: a[4],
          deadline: Number(a[5]),
          budgetRaw: BigInt(a[6]),
          budget: toLinkUnits(a[6]),
          poster: a[7],
          claimedBy: a[8],
          deliveryHash: a[9],
          createdAt: Number(a[10]),
          status: Number(a[11]),
        };
      });

      // Parse agents — extended tuple with asn, creditScore, trustScore
      const parsedAgents: LinkAgentProfile[] = (rawAgents as unknown[]).map((a: unknown) => {
        const r = a as [string, string, string, string, bigint, number, number, boolean, bigint];
        return {
          agentAddress: r[0],
          name: r[1],
          skills: r[2],
          asn: r[3],
          feeRate: Number(r[4]),
          creditScore: Number(r[5]),
          trustScore: Number(r[6]),
          active: Boolean(r[7]),
          registeredAt: Number(r[8]),
        };
      });

      // Parse ASN records
      const parsedASN: LinkASNRecord[] = (rawASNRecords as unknown[]).map((a: unknown) => {
        const r = a as [string, string, string, string, number, number, bigint, bigint, bigint, bigint, boolean];
        return {
          asn: r[0],
          owner: r[1],
          agentName: r[2],
          agentType: r[3],
          creditScore: Number(r[4]),
          trustScore: Number(r[5]),
          tasksCompleted: Number(r[6]),
          totalVolumeWei: BigInt(r[7]),
          registeredAt: Number(r[8]),
          lastActive: Number(r[9]),
          active: Boolean(r[10]),
        };
      });

      // Parse treasury PnL
      let parsedTreasury: TreasuryPnL | null = null;
      if (rawPnL) {
        parsedTreasury = {
          totalRevenue: toLinkUnits(rawPnL[0]),
          computeBalance: toLinkUnits(rawPnL[1]),
          growthBalance: toLinkUnits(rawPnL[2]),
          reserveBalance: toLinkUnits(rawPnL[3]),
        };
      }

      setTasks(parsedTasks);
      setAgents(parsedAgents);
      setAsnRecords(parsedASN);
      setTotalTasks(Number(taskCount));
      setTotalAgents(Number(agentCount));
      setTreasury(parsedTreasury);
      setError(null);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch LINK contract data");
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, [getProvider]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  return {
    tasks,
    agents,
    asnRecords,
    totalTasks,
    totalAgents,
    treasury,
    isLoading,
    error,
    lastRefresh,
    refetch: fetchData,
  };
}
