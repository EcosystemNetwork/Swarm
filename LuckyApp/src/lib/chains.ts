/**
 * Multi-Chain Registry — Swarm Protocol
 *
 * Central config for all supported chains.
 * Import this everywhere instead of hardcoding chain IDs, RPCs, or currency symbols.
 */

import { defineChain, type Chain } from "thirdweb/chains";
import { avalanche, base } from "thirdweb/chains";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface ChainConfig {
    /** Internal key */
    key: "avalanche" | "base" | "hedera" | "filecoin";
    /** Human-readable name */
    name: string;
    /** EVM chain ID */
    chainId: number;
    /** Thirdweb Chain object for wallet / contract interactions */
    thirdwebChain: Chain;
    /** Public RPC endpoint */
    rpc: string;
    /** Native currency */
    nativeCurrency: {
        name: string;
        symbol: string;
        decimals: number;
    };
    /** Block explorer */
    explorer: {
        name: string;
        baseUrl: string;
        txUrl: (hash: string) => string;
        addressUrl: (addr: string) => string;
        contractUrl: (addr: string) => string;
    };
    /** Deployed contract addresses (empty until deployed) */
    contracts: {
        taskBoard?: string;
        agentRegistry?: string;
        brandVault?: string;
        agentTreasury?: string;
    };
    /** Whether this chain is active in the UI */
    enabled: boolean;
    /** Logo path for UI */
    logo: string;
}

// ═══════════════════════════════════════════════════════════════
// Chain Definitions
// ═══════════════════════════════════════════════════════════════

const hedera = defineChain({
    id: 295,
    name: "Hedera",
    rpc: "https://mainnet.hashio.io/api",
});

const hederaTestnet = defineChain({
    id: 296,
    name: "Hedera Testnet",
    rpc: "https://testnet.hashio.io/api",
});

const filecoin = defineChain({
    id: 314,
    name: "Filecoin",
    rpc: "https://api.node.glif.io/rpc/v1",
});

// ═══════════════════════════════════════════════════════════════
// Chain Configs
// ═══════════════════════════════════════════════════════════════

export const CHAIN_CONFIGS: Record<string, ChainConfig> = {
    avalanche: {
        key: "avalanche",
        name: "Avalanche",
        chainId: 43114,
        thirdwebChain: avalanche,
        rpc: "https://api.avax.network/ext/bc/C/rpc",
        nativeCurrency: { name: "Avalanche", symbol: "AVAX", decimals: 18 },
        explorer: {
            name: "Snowtrace",
            baseUrl: "https://snowtrace.io",
            txUrl: (h) => `https://snowtrace.io/tx/${h}`,
            addressUrl: (a) => `https://snowtrace.io/address/${a}`,
            contractUrl: (a) => `https://snowtrace.io/address/${a}`,
        },
        contracts: {},
        enabled: true,
        logo: "/chains/avalanche.svg",
    },

    base: {
        key: "base",
        name: "Base",
        chainId: 8453,
        thirdwebChain: base,
        rpc: "https://mainnet.base.org",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        explorer: {
            name: "BaseScan",
            baseUrl: "https://basescan.org",
            txUrl: (h) => `https://basescan.org/tx/${h}`,
            addressUrl: (a) => `https://basescan.org/address/${a}`,
            contractUrl: (a) => `https://basescan.org/address/${a}`,
        },
        contracts: {},
        enabled: true,
        logo: "/chains/base.svg",
    },

    hedera: {
        key: "hedera",
        name: "Hedera",
        chainId: 295,
        thirdwebChain: hedera,
        rpc: "https://mainnet.hashio.io/api",
        nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 8 },
        explorer: {
            name: "HashScan",
            baseUrl: "https://hashscan.io/mainnet",
            txUrl: (h) => `https://hashscan.io/mainnet/transaction/${h}`,
            addressUrl: (a) => `https://hashscan.io/mainnet/account/${a}`,
            contractUrl: (a) => `https://hashscan.io/mainnet/contract/${a}`,
        },
        contracts: {
            // Hedera Testnet contracts — will migrate to mainnet
            taskBoard: "0xC02EcE9c48E20Fb5a3D59b2ff143a0691694b9a9",
            agentRegistry: "0x1C56831b3413B916CEa6321e0C113cc19fD250Bd",
            brandVault: "0x2254185AB8B6AC995F97C769a414A0281B42853b",
            agentTreasury: "0x1AC9C959459ED904899a1d52f493e9e4A879a9f4",
        },
        enabled: true,
        logo: "/chains/hedera.svg",
    },

    filecoin: {
        key: "filecoin",
        name: "Filecoin",
        chainId: 314,
        thirdwebChain: filecoin,
        rpc: "https://api.node.glif.io/rpc/v1",
        nativeCurrency: { name: "Filecoin", symbol: "FIL", decimals: 18 },
        explorer: {
            name: "Filfox",
            baseUrl: "https://filfox.info/en",
            txUrl: (h) => `https://filfox.info/en/message/${h}`,
            addressUrl: (a) => `https://filfox.info/en/address/${a}`,
            contractUrl: (a) => `https://filfox.info/en/address/${a}`,
        },
        contracts: {},
        enabled: true,
        logo: "/chains/filecoin.svg",
    },
};

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/** All enabled chains */
export const ENABLED_CHAINS = Object.values(CHAIN_CONFIGS).filter((c) => c.enabled);

/** Thirdweb chain objects for wallet ConnectButton */
export const WALLET_CHAINS: Chain[] = ENABLED_CHAINS.map((c) => c.thirdwebChain);

/** Get chain config by EVM chain ID */
export function getChainById(chainId: number): ChainConfig | undefined {
    return ENABLED_CHAINS.find((c) => c.chainId === chainId);
}

/** Get chain config by key */
export function getChain(key: string): ChainConfig | undefined {
    return CHAIN_CONFIGS[key];
}

/** Get native currency symbol for a chain (default: "HBAR" for backwards compat) */
export function getCurrencySymbol(chainId?: number): string {
    if (!chainId) return "HBAR"; // default for existing code
    return getChainById(chainId)?.nativeCurrency.symbol ?? "ETH";
}

/** Get native currency decimals for a chain */
export function getCurrencyDecimals(chainId?: number): number {
    if (!chainId) return 8; // HBAR default
    return getChainById(chainId)?.nativeCurrency.decimals ?? 18;
}

/** Convert raw amount to human-readable using chain-specific decimals */
export function toNative(rawAmount: bigint | number, chainId?: number): number {
    const decimals = getCurrencyDecimals(chainId);
    return Number(rawAmount) / Math.pow(10, decimals);
}

/** Get explorer TX link for a chain */
export function getExplorerTxUrl(hash: string, chainId?: number): string {
    if (!chainId) return `https://hashscan.io/testnet/transaction/${hash}`;
    const chain = getChainById(chainId);
    return chain?.explorer.txUrl(hash) ?? `#`;
}

/** Get explorer contract link for a chain */
export function getExplorerContractUrl(addr: string, chainId?: number): string {
    if (!chainId) return `https://hashscan.io/testnet/contract/${addr}`;
    const chain = getChainById(chainId);
    return chain?.explorer.contractUrl(addr) ?? `#`;
}

/** Get deployed contract addresses for a chain (returns empty object if none) */
export function getContracts(chainId?: number) {
    if (!chainId) return CHAIN_CONFIGS.hedera.contracts;
    return getChainById(chainId)?.contracts ?? {};
}

/** Shorten an address: 0x1234...5678 */
export function shortAddress(addr: string): string {
    if (!addr || addr === "0x0000000000000000000000000000000000000000") return "—";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// ═══════════════════════════════════════════════════════════════
// Chainlink Services (oracle / CCIP — not a separate chain)
// ═══════════════════════════════════════════════════════════════

export const CHAINLINK = {
    /** Price feed contract addresses per chain */
    priceFeeds: {
        avalanche: {
            "AVAX/USD": "0x0A77230d17318075983913bC2145DB16C7366156",
        },
        base: {
            "ETH/USD": "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70",
        },
        hedera: {},
        filecoin: {},
    } as Record<string, Record<string, string>>,

    /** CCIP router addresses per chain (for cross-chain messaging) */
    ccipRouters: {
        avalanche: "0xF4c7E640EdA248ef95972845a62bdC74237805dB",
        base: "0xD3b06cEbF099CE7DA4AcCf578aaebFDBd6e88a93",
    } as Record<string, string>,
};
