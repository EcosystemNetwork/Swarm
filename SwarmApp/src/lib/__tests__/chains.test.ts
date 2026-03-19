import { describe, it, expect } from "vitest";
import {
  toNative,
  shortAddress,
  getCurrencySymbol,
  getCurrencyDecimals,
  getChainById,
  getExplorerTxUrl,
  LINK_TOKEN_SEPOLIA,
} from "../chains";

describe("toNative", () => {
  it("converts wei to ETH (18 decimals, default)", () => {
    expect(toNative(1_000_000_000_000_000_000n)).toBeCloseTo(1);
  });

  it("converts tinybars to HBAR (8 decimals, chainId 295)", () => {
    // Hedera mainnet is chainId 295 in chains.ts
    expect(toNative(100_000_000, 295)).toBeCloseTo(1);
  });

  it("handles zero", () => {
    expect(toNative(0)).toBe(0);
  });

  it("defaults to 18 decimals for unknown chainId", () => {
    expect(toNative(1_000_000_000_000_000_000n, 999999)).toBeCloseTo(1);
  });
});

describe("shortAddress", () => {
  it("shortens a valid address", () => {
    expect(shortAddress("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd")).toBe(
      "0xabcd...abcd"
    );
  });

  it("returns dash for zero address", () => {
    expect(shortAddress("0x0000000000000000000000000000000000000000")).toBe(
      "—"
    );
  });

  it("returns dash for empty input", () => {
    expect(shortAddress("")).toBe("—");
  });
});

describe("getCurrencySymbol", () => {
  it("returns ETH for undefined chainId", () => {
    expect(getCurrencySymbol()).toBe("ETH");
  });

  it("returns HBAR for Hedera (295)", () => {
    expect(getCurrencySymbol(295)).toBe("HBAR");
  });

  it("returns ETH for Sepolia (11155111)", () => {
    expect(getCurrencySymbol(11155111)).toBe("ETH");
  });

  it("returns ETH for unknown chainId", () => {
    expect(getCurrencySymbol(999999)).toBe("ETH");
  });
});

describe("getCurrencyDecimals", () => {
  it("returns 18 for ETH chains", () => {
    expect(getCurrencyDecimals(11155111)).toBe(18);
  });

  it("returns 8 for Hedera (295)", () => {
    expect(getCurrencyDecimals(295)).toBe(8);
  });

  it("defaults to 18 for unknown", () => {
    expect(getCurrencyDecimals(999999)).toBe(18);
  });
});

describe("getChainById", () => {
  it("finds Hedera by chainId (295)", () => {
    const chain = getChainById(295);
    expect(chain).toBeDefined();
    expect(chain!.key).toBe("hedera");
  });

  it("finds Sepolia by chainId", () => {
    const chain = getChainById(11155111);
    expect(chain).toBeDefined();
    expect(chain!.key).toBe("sepolia");
  });

  it("returns undefined for unknown chainId", () => {
    expect(getChainById(999999)).toBeUndefined();
  });
});

describe("getExplorerTxUrl", () => {
  it("returns etherscan URL for undefined chainId", () => {
    const url = getExplorerTxUrl("0xabc");
    expect(url).toBe("https://etherscan.io/tx/0xabc");
  });

  it("returns HashScan URL for Hedera (295)", () => {
    const url = getExplorerTxUrl("0xabc", 295);
    expect(url).toContain("hashscan.io");
    expect(url).toContain("0xabc");
  });
});

describe("constants", () => {
  it("LINK_TOKEN_SEPOLIA is a valid address", () => {
    expect(LINK_TOKEN_SEPOLIA).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });
});
