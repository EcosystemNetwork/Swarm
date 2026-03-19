/**
 * React hook for write operations on Ethereum Sepolia LINK contracts.
 * Uses ethers.js with BrowserProvider (window.ethereum) for signing.
 *
 * Parallel to useSwarmWrite.ts (Hedera) — kept fully separate.
 *
 * Key differences from Hedera:
 * - No fixed gasLimit (Sepolia supports normal gas estimation)
 * - No type: 0 override (Sepolia supports EIP-1559)
 * - postTask requires 2-step flow: approve LINK → postTask
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
  LINK_CONTRACTS,
  LINK_TOKEN,
  LINK_AGENT_REGISTRY_ABI,
  LINK_TASK_BOARD_ABI,
  LINK_ASN_REGISTRY_ABI,
  ERC20_ABI,
} from "@/lib/link-contracts";

interface WriteState {
  isLoading: boolean;
  error: string | null;
  txHash: string | null;
}

interface LinkWrite {
  registerAgent: (name: string, skills: string, asn: string, feeRate: number) => Promise<string | null>;
  registerASN: (asn: string, agentName: string, agentType: string) => Promise<string | null>;
  postTask: (vaultAddress: string, title: string, description: string, requiredSkills: string, deadlineUnix: number, budgetLink: string) => Promise<string | null>;
  claimTask: (taskId: number) => Promise<string | null>;
  submitDelivery: (taskId: number, deliveryHash: string) => Promise<string | null>;
  approveDelivery: (taskId: number) => Promise<string | null>;
  updateCredit: (agentAddr: string, creditScore: number, trustScore: number) => Promise<string | null>;
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

export function useLinkWrite(): LinkWrite {
  const [state, setState] = useState<WriteState>({
    isLoading: false,
    error: null,
    txHash: null,
  });

  const reset = useCallback(() => {
    setState({ isLoading: false, error: null, txHash: null });
  }, []);

  const registerAgent = useCallback(
    async (name: string, skills: string, asn: string, feeRate: number): Promise<string | null> => {
      setState({ isLoading: true, error: null, txHash: null });
      try {
        const signer = await getSigner();
        const registry = new ethers.Contract(LINK_CONTRACTS.AGENT_REGISTRY, LINK_AGENT_REGISTRY_ABI, signer);
        const tx = await registry.registerAgent(name, skills, asn, feeRate);
        const receipt = await tx.wait();
        setState({ isLoading: false, error: null, txHash: receipt.hash });
        return receipt.hash;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to register agent";
        setState({ isLoading: false, error: msg, txHash: null });
        return null;
      }
    },
    [],
  );

  const registerASN = useCallback(
    async (asn: string, agentName: string, agentType: string): Promise<string | null> => {
      setState({ isLoading: true, error: null, txHash: null });
      try {
        const signer = await getSigner();
        const asnRegistry = new ethers.Contract(LINK_CONTRACTS.ASN_REGISTRY, LINK_ASN_REGISTRY_ABI, signer);
        const tx = await asnRegistry.registerASN(asn, agentName, agentType);
        const receipt = await tx.wait();
        setState({ isLoading: false, error: null, txHash: receipt.hash });
        return receipt.hash;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to register ASN";
        setState({ isLoading: false, error: msg, txHash: null });
        return null;
      }
    },
    [],
  );

  /**
   * Post a task with LINK payment.
   * 2-step flow: approve LINK → postTask
   */
  const postTask = useCallback(
    async (
      vaultAddress: string,
      title: string,
      description: string,
      requiredSkills: string,
      deadlineUnix: number,
      budgetLink: string,
    ): Promise<string | null> => {
      setState({ isLoading: true, error: null, txHash: null });
      try {
        const budgetWei = ethers.parseEther(budgetLink);
        if (budgetWei <= BigInt(0)) {
          throw new Error("Budget must be greater than 0 LINK");
        }

        const signer = await getSigner();

        // Step 1: Approve LINK token transfer
        const linkToken = new ethers.Contract(LINK_TOKEN, ERC20_ABI, signer);
        const approveTx = await linkToken.approve(LINK_CONTRACTS.TASK_BOARD, budgetWei);
        await approveTx.wait();

        // Step 2: Post the task
        const board = new ethers.Contract(LINK_CONTRACTS.TASK_BOARD, LINK_TASK_BOARD_ABI, signer);
        const tx = await board.postTask(
          vaultAddress,
          title,
          description,
          requiredSkills,
          deadlineUnix,
          budgetWei,
        );
        const receipt = await tx.wait();
        setState({ isLoading: false, error: null, txHash: receipt.hash });
        return receipt.hash;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to post task";
        setState({ isLoading: false, error: msg, txHash: null });
        return null;
      }
    },
    [],
  );

  const claimTask = useCallback(async (taskId: number): Promise<string | null> => {
    setState({ isLoading: true, error: null, txHash: null });
    try {
      const signer = await getSigner();
      const board = new ethers.Contract(LINK_CONTRACTS.TASK_BOARD, LINK_TASK_BOARD_ABI, signer);
      const tx = await board.claimTask(taskId);
      const receipt = await tx.wait();
      setState({ isLoading: false, error: null, txHash: receipt.hash });
      return receipt.hash;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to claim task";
      setState({ isLoading: false, error: msg, txHash: null });
      return null;
    }
  }, []);

  const submitDelivery = useCallback(
    async (taskId: number, deliveryHash: string): Promise<string | null> => {
      setState({ isLoading: true, error: null, txHash: null });
      try {
        const signer = await getSigner();
        const board = new ethers.Contract(LINK_CONTRACTS.TASK_BOARD, LINK_TASK_BOARD_ABI, signer);
        const tx = await board.submitDelivery(taskId, deliveryHash);
        const receipt = await tx.wait();
        setState({ isLoading: false, error: null, txHash: receipt.hash });
        return receipt.hash;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to submit delivery";
        setState({ isLoading: false, error: msg, txHash: null });
        return null;
      }
    },
    [],
  );

  const approveDelivery = useCallback(async (taskId: number): Promise<string | null> => {
    setState({ isLoading: true, error: null, txHash: null });
    try {
      const signer = await getSigner();
      const board = new ethers.Contract(LINK_CONTRACTS.TASK_BOARD, LINK_TASK_BOARD_ABI, signer);
      const tx = await board.approveDelivery(taskId);
      const receipt = await tx.wait();
      setState({ isLoading: false, error: null, txHash: receipt.hash });
      return receipt.hash;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to approve delivery";
      setState({ isLoading: false, error: msg, txHash: null });
      return null;
    }
  }, []);

  const updateCredit = useCallback(
    async (agentAddr: string, creditScore: number, trustScore: number): Promise<string | null> => {
      setState({ isLoading: true, error: null, txHash: null });
      try {
        const signer = await getSigner();
        const registry = new ethers.Contract(LINK_CONTRACTS.AGENT_REGISTRY, LINK_AGENT_REGISTRY_ABI, signer);
        const tx = await registry.updateCredit(agentAddr, creditScore, trustScore);
        const receipt = await tx.wait();
        setState({ isLoading: false, error: null, txHash: receipt.hash });
        return receipt.hash;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to update credit";
        setState({ isLoading: false, error: msg, txHash: null });
        return null;
      }
    },
    [],
  );

  return {
    registerAgent,
    registerASN,
    postTask,
    claimTask,
    submitDelivery,
    approveDelivery,
    updateCredit,
    state,
    reset,
  };
}
