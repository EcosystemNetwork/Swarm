/**
 * React hook for write operations on Hedera Testnet contracts.
 * Uses ethers.js with BrowserProvider (window.ethereum) for signing.
 *
 * IMPORTANT: All write calls use gasLimit: 3_000_000 — Hedera gas estimation fails silently.
 */

"use client";

import { useState, useCallback } from "react";
import { ethers } from "ethers";

declare global {
  interface Window {
    ethereum?: ethers.Eip1193Provider;
  }
}
import {
  CONTRACTS,
  TASK_BOARD_ABI,
  AGENT_REGISTRY_ABI,
  HEDERA_GAS_LIMIT,
} from "@/lib/swarm-contracts";

interface WriteState {
  isLoading: boolean;
  error: string | null;
  txHash: string | null;
}

interface SwarmWrite {
  claimTask: (taskId: number) => Promise<string | null>;
  submitDelivery: (taskId: number, deliveryHash: string) => Promise<string | null>;
  postTask: (vaultAddress: string, title: string, description: string, requiredSkills: string, deadlineUnix: number, budgetHbar: string) => Promise<string | null>;
  registerAgent: (name: string, skills: string, feeRate: number) => Promise<string | null>;
  state: WriteState;
  reset: () => void;
}

async function getSigner(): Promise<ethers.Signer> {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No wallet detected. Please connect your wallet.");
  }
  const provider = new ethers.BrowserProvider(window.ethereum);
  return provider.getSigner();
}

export function useSwarmWrite(): SwarmWrite {
  const [state, setState] = useState<WriteState>({
    isLoading: false,
    error: null,
    txHash: null,
  });

  const reset = useCallback(() => {
    setState({ isLoading: false, error: null, txHash: null });
  }, []);

  const claimTask = useCallback(async (taskId: number): Promise<string | null> => {
    setState({ isLoading: true, error: null, txHash: null });
    try {
      const signer = await getSigner();
      const board = new ethers.Contract(CONTRACTS.TASK_BOARD, TASK_BOARD_ABI, signer);
      const tx = await board.claimTask(taskId, { gasLimit: HEDERA_GAS_LIMIT, type: 0 });
      const receipt = await tx.wait();
      setState({ isLoading: false, error: null, txHash: receipt.hash });
      return receipt.hash;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to claim task";
      setState({ isLoading: false, error: msg, txHash: null });
      return null;
    }
  }, []);

  const submitDelivery = useCallback(async (taskId: number, deliveryHash: string): Promise<string | null> => {
    setState({ isLoading: true, error: null, txHash: null });
    try {
      const signer = await getSigner();
      const board = new ethers.Contract(CONTRACTS.TASK_BOARD, TASK_BOARD_ABI, signer);
      const tx = await board.submitDelivery(taskId, deliveryHash, { gasLimit: HEDERA_GAS_LIMIT, type: 0 });
      const receipt = await tx.wait();
      setState({ isLoading: false, error: null, txHash: receipt.hash });
      return receipt.hash;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to submit delivery";
      setState({ isLoading: false, error: msg, txHash: null });
      return null;
    }
  }, []);

  const postTask = useCallback(async (
    vaultAddress: string,
    title: string,
    description: string,
    requiredSkills: string,
    deadlineUnix: number,
    budgetHbar: string,
  ): Promise<string | null> => {
    setState({ isLoading: true, error: null, txHash: null });
    try {
      if (parseFloat(budgetHbar) < 100) {
        throw new Error("Minimum budget is 100 HBAR");
      }
      const signer = await getSigner();
      const board = new ethers.Contract(CONTRACTS.TASK_BOARD, TASK_BOARD_ABI, signer);
      const tx = await board.postTask(
        vaultAddress,
        title,
        description,
        requiredSkills,
        deadlineUnix,
        { value: ethers.parseEther(budgetHbar), gasLimit: HEDERA_GAS_LIMIT, type: 0 },
      );
      const receipt = await tx.wait();
      setState({ isLoading: false, error: null, txHash: receipt.hash });
      return receipt.hash;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to post task";
      setState({ isLoading: false, error: msg, txHash: null });
      return null;
    }
  }, []);

  const registerAgent = useCallback(async (name: string, skills: string, feeRate: number): Promise<string | null> => {
    setState({ isLoading: true, error: null, txHash: null });
    try {
      const signer = await getSigner();
      const registry = new ethers.Contract(CONTRACTS.AGENT_REGISTRY, AGENT_REGISTRY_ABI, signer);
      const tx = await registry.registerAgent(name, skills, feeRate, { gasLimit: HEDERA_GAS_LIMIT, type: 0 });
      const receipt = await tx.wait();
      setState({ isLoading: false, error: null, txHash: receipt.hash });
      return receipt.hash;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to register agent";
      setState({ isLoading: false, error: msg, txHash: null });
      return null;
    }
  }, []);

  return { claimTask, submitDelivery, postTask, registerAgent, state, reset };
}
