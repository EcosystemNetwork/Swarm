/**
 * Testnet-launch audit tests.
 *
 * Covers every fix introduced in the security-audit PR:
 *   1. SwarmASNRegistry — asnCount() alias
 *   2. SwarmTreasuryLink — withdraw() updates bucket balances
 *   3. SwarmTaskBoardLink — cancelTask() refunds, resolveDispute() unlocks funds
 *   4. SwarmAgentIdentityNFT — emergencyTransfer works; batchUpdateReputation validates
 */

import { ethers } from "hardhat";
import { expect } from "chai";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

// ─── helpers ────────────────────────────────────────────────────────────────

/** Deploy a fresh MockLINK + SwarmTaskBoardLink pair */
async function deployTaskBoard(owner: HardhatEthersSigner) {
  const MockLINK = await ethers.getContractFactory("MockLINK", owner);
  const link = await MockLINK.deploy();

  const TaskBoard = await ethers.getContractFactory("SwarmTaskBoardLink", owner);
  const board = await TaskBoard.deploy(await link.getAddress());

  return { link, board };
}

/** Deploy a fresh MockLINK + SwarmTreasuryLink pair */
async function deployTreasury(owner: HardhatEthersSigner) {
  const MockLINK = await ethers.getContractFactory("MockLINK", owner);
  const link = await MockLINK.deploy();

  const Treasury = await ethers.getContractFactory("SwarmTreasuryLink", owner);
  const treasury = await Treasury.deploy(await link.getAddress());

  return { link, treasury };
}

// ─── SwarmASNRegistry ────────────────────────────────────────────────────────

describe("SwarmASNRegistry — asnCount alias", () => {
  it("asnCount() returns the same value as totalRecords()", async () => {
    const [owner, user] = await ethers.getSigners();
    const ASN = await ethers.getContractFactory("SwarmASNRegistry", owner);
    const asn = await ASN.deploy();

    expect(await asn.asnCount()).to.equal(0n);
    expect(await asn.totalRecords()).to.equal(0n);

    await asn
      .connect(user)
      .registerASN("ASN-SWM-2026-0001-0001-01", "Bot A", "validator");

    expect(await asn.asnCount()).to.equal(1n);
    expect(await asn.totalRecords()).to.equal(1n);
  });
});

// ─── SwarmTreasuryLink ───────────────────────────────────────────────────────

describe("SwarmTreasuryLink — withdraw updates bucket balances", () => {
  it("reduces bucket balances proportionally on withdrawal", async () => {
    const [owner] = await ethers.getSigners();
    const { link, treasury } = await deployTreasury(owner);
    const treasuryAddr = await treasury.getAddress();

    // Deposit 1 000 LINK (18 decimals)
    const depositAmount = ethers.parseEther("1000");
    await link.approve(treasuryAddr, depositAmount);
    await treasury.depositRevenue(depositAmount);

    const [, initialCompute, initialGrowth, initialReserve] =
      await treasury.getPnL();

    // Withdraw exactly half
    const withdrawAmount = ethers.parseEther("500");
    await treasury.withdraw(owner.address, withdrawAmount);

    const [, computeAfter, growthAfter, reserveAfter] = await treasury.getPnL();

    // Each bucket should be approximately halved (proportional deduction)
    expect(computeAfter).to.be.closeTo(
      initialCompute / 2n,
      ethers.parseEther("1"), // allow 1 LINK rounding tolerance
    );
    expect(growthAfter).to.be.closeTo(
      initialGrowth / 2n,
      ethers.parseEther("1"),
    );
    expect(reserveAfter).to.be.closeTo(
      initialReserve / 2n,
      ethers.parseEther("1"),
    );

    // Sum of buckets must not exceed remaining token balance
    const remainingBalance = await link.balanceOf(treasuryAddr);
    expect(computeAfter + growthAfter + reserveAfter).to.be.lte(
      remainingBalance,
    );
  });

  it("drains all buckets when withdrawal exceeds tracked allocation", async () => {
    const [owner] = await ethers.getSigners();
    const { link, treasury } = await deployTreasury(owner);
    const treasuryAddr = await treasury.getAddress();

    // Deposit 100 LINK through the normal path (tracked in buckets)
    const depositAmount = ethers.parseEther("100");
    await link.approve(treasuryAddr, depositAmount);
    await treasury.depositRevenue(depositAmount);

    // Send extra 100 LINK directly — NOT tracked in buckets
    await link.transfer(treasuryAddr, ethers.parseEther("100"));

    // Withdraw the full 200 LINK (more than the 100 LINK tracked in buckets)
    await treasury.withdraw(owner.address, ethers.parseEther("200"));

    const [, computeAfter, growthAfter, reserveAfter] = await treasury.getPnL();

    // All buckets must be zeroed — no inflated figures
    expect(computeAfter).to.equal(0n);
    expect(growthAfter).to.equal(0n);
    expect(reserveAfter).to.equal(0n);
  });


    const [owner] = await ethers.getSigners();
    const { link, treasury } = await deployTreasury(owner);
    const treasuryAddr = await treasury.getAddress();

    const depositAmount = ethers.parseEther("100");
    await link.approve(treasuryAddr, depositAmount);
    await treasury.depositRevenue(depositAmount);

    await expect(
      treasury.withdraw(owner.address, ethers.parseEther("200")),
    ).to.be.revertedWith("Insufficient balance");
  });
});

// ─── SwarmTaskBoardLink ──────────────────────────────────────────────────────

describe("SwarmTaskBoardLink — cancelTask", () => {
  async function postTask(
    board: Awaited<ReturnType<typeof deployTaskBoard>>["board"],
    link: Awaited<ReturnType<typeof deployTaskBoard>>["link"],
    poster: HardhatEthersSigner,
    deadlineOffset: number,
  ) {
    const boardAddr = await board.getAddress();
    const budget = ethers.parseEther("10");
    await link.connect(poster).approve(boardAddr, budget);

    const deadline = Math.floor(Date.now() / 1000) + deadlineOffset;
    await board
      .connect(poster)
      .postTask(ethers.ZeroAddress, "Test", "Desc", "skill", deadline, budget);
    return { budget, deadline };
  }

  it("poster can cancel an open task before deadline and receives refund", async () => {
    const [owner, poster] = await ethers.getSigners();
    const { link, board } = await deployTaskBoard(owner);

    // Mint LINK to poster
    await link.transfer(poster.address, ethers.parseEther("100"));

    const { budget } = await postTask(board, link, poster, 3600); // 1h deadline

    const balanceBefore = await link.balanceOf(poster.address);
    await board.connect(poster).cancelTask(0);
    const balanceAfter = await link.balanceOf(poster.address);

    expect(balanceAfter - balanceBefore).to.equal(budget);

    const task = await board.getTask(0);
    expect(task.status).to.equal(4); // TaskStatus.Expired
  });

  it("non-poster cannot cancel before deadline", async () => {
    const [owner, poster, other] = await ethers.getSigners();
    const { link, board } = await deployTaskBoard(owner);

    await link.transfer(poster.address, ethers.parseEther("100"));
    await postTask(board, link, poster, 3600);

    await expect(board.connect(other).cancelTask(0)).to.be.revertedWith(
      "Only poster can cancel before deadline",
    );
  });

  it("anyone can cancel an expired open task (past deadline)", async () => {
    const [owner, poster, other] = await ethers.getSigners();
    const { link, board } = await deployTaskBoard(owner);

    await link.transfer(poster.address, ethers.parseEther("100"));
    // Use a 1 second deadline so it expires immediately after mining
    await postTask(board, link, poster, 1);

    // Advance time past deadline
    await ethers.provider.send("evm_increaseTime", [10]);
    await ethers.provider.send("evm_mine", []);

    const balanceBefore = await link.balanceOf(poster.address);
    await board.connect(other).cancelTask(0); // third party triggers sweep
    const balanceAfter = await link.balanceOf(poster.address);

    expect(balanceAfter).to.be.gt(balanceBefore);
  });
});

describe("SwarmTaskBoardLink — resolveDispute", () => {
  async function createDisputedTask(
    board: Awaited<ReturnType<typeof deployTaskBoard>>["board"],
    link: Awaited<ReturnType<typeof deployTaskBoard>>["link"],
    poster: HardhatEthersSigner,
    agent: HardhatEthersSigner,
  ) {
    const boardAddr = await board.getAddress();
    const budget = ethers.parseEther("10");
    await link.connect(poster).approve(boardAddr, budget);

    const deadline = Math.floor(Date.now() / 1000) + 3600;
    await board
      .connect(poster)
      .postTask(ethers.ZeroAddress, "T", "D", "s", deadline, budget);

    await board.connect(agent).claimTask(0);
    await board
      .connect(agent)
      .submitDelivery(0, ethers.keccak256(ethers.toUtf8Bytes("work")));
    await board.connect(poster).disputeDelivery(0);

    return { budget };
  }

  it("owner can resolve dispute in favour of poster (refund)", async () => {
    const [owner, poster, agent] = await ethers.getSigners();
    const { link, board } = await deployTaskBoard(owner);
    await link.transfer(poster.address, ethers.parseEther("100"));

    const { budget } = await createDisputedTask(board, link, poster, agent);

    const posterBefore = await link.balanceOf(poster.address);
    await board.connect(owner).resolveDispute(0, true);
    const posterAfter = await link.balanceOf(poster.address);

    expect(posterAfter - posterBefore).to.equal(budget);

    const task = await board.getTask(0);
    expect(task.status).to.equal(2); // TaskStatus.Completed
  });

  it("owner can resolve dispute in favour of agent (pay out)", async () => {
    const [owner, poster, agent] = await ethers.getSigners();
    const { link, board } = await deployTaskBoard(owner);
    await link.transfer(poster.address, ethers.parseEther("100"));

    const { budget } = await createDisputedTask(board, link, poster, agent);

    const agentBefore = await link.balanceOf(agent.address);
    await board.connect(owner).resolveDispute(0, false);
    const agentAfter = await link.balanceOf(agent.address);

    expect(agentAfter - agentBefore).to.equal(budget);
  });

  it("non-owner cannot resolve disputes", async () => {
    const [owner, poster, agent] = await ethers.getSigners();
    const { link, board } = await deployTaskBoard(owner);
    await link.transfer(poster.address, ethers.parseEther("100"));

    await createDisputedTask(board, link, poster, agent);

    await expect(
      board.connect(poster).resolveDispute(0, true),
    ).to.be.revertedWithCustomError(board, "OwnableUnauthorizedAccount");
  });

  it("resolveDispute reverts for non-disputed tasks", async () => {
    const [owner, poster] = await ethers.getSigners();
    const { link, board } = await deployTaskBoard(owner);
    await link.transfer(poster.address, ethers.parseEther("100"));

    const boardAddr = await board.getAddress();
    const budget = ethers.parseEther("10");
    await link.connect(poster).approve(boardAddr, budget);
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    await board
      .connect(poster)
      .postTask(ethers.ZeroAddress, "T", "D", "s", deadline, budget);

    await expect(
      board.connect(owner).resolveDispute(0, true),
    ).to.be.revertedWith("Task not disputed");
  });
});

// ─── SwarmAgentIdentityNFT ───────────────────────────────────────────────────

describe("SwarmAgentIdentityNFT — emergencyTransfer", () => {
  async function deployNFT(owner: HardhatEthersSigner) {
    const NFT = await ethers.getContractFactory(
      "SwarmAgentIdentityNFT",
      owner,
    );
    return NFT.deploy("https://example.com/api/nft");
  }

  it("owner can emergency-transfer an NFT to a new wallet", async () => {
    const [owner, agent, newWallet] = await ethers.getSigners();
    const nft = await deployNFT(owner);

    await nft.mintAgentNFT(agent.address, "ASN-001", 680, 50);
    const tokenId = await nft.getTokenId(agent.address);

    await nft.connect(owner).emergencyTransfer(tokenId, newWallet.address);

    // Mappings updated
    expect(await nft.getTokenId(newWallet.address)).to.equal(tokenId);
    expect(await nft.getTokenId(agent.address)).to.equal(0n);

    // ERC-721 owner updated
    expect(await nft.ownerOf(tokenId)).to.equal(newWallet.address);
  });

  it("non-owner cannot call emergencyTransfer", async () => {
    const [owner, agent, attacker] = await ethers.getSigners();
    const nft = await deployNFT(owner);

    await nft.mintAgentNFT(agent.address, "ASN-001", 680, 50);
    const tokenId = await nft.getTokenId(agent.address);

    await expect(
      nft.connect(attacker).emergencyTransfer(tokenId, attacker.address),
    ).to.be.revertedWithCustomError(nft, "OwnableUnauthorizedAccount");
  });

  it("regular users cannot transfer NFTs (soulbound)", async () => {
    const [owner, agent, other] = await ethers.getSigners();
    const nft = await deployNFT(owner);

    await nft.mintAgentNFT(agent.address, "ASN-001", 680, 50);
    const tokenId = await nft.getTokenId(agent.address);

    await expect(
      nft.connect(agent).transferFrom(agent.address, other.address, tokenId),
    ).to.be.revertedWith("SwarmAgentIdentityNFT: non-transferable");
  });
});

describe("SwarmAgentIdentityNFT — batchUpdateReputation validation", () => {
  async function deployNFT(owner: HardhatEthersSigner) {
    const NFT = await ethers.getContractFactory(
      "SwarmAgentIdentityNFT",
      owner,
    );
    return NFT.deploy("https://example.com/api/nft");
  }

  it("accepts valid batch scores", async () => {
    const [owner, a1, a2] = await ethers.getSigners();
    const nft = await deployNFT(owner);

    await nft.mintAgentNFT(a1.address, "ASN-001", 680, 50);
    await nft.mintAgentNFT(a2.address, "ASN-002", 680, 50);

    await expect(
      nft.batchUpdateReputation(
        [a1.address, a2.address],
        [700, 850],
        [60, 90],
      ),
    ).to.not.be.reverted;
  });

  it("reverts if any credit score is out of range", async () => {
    const [owner, a1, a2] = await ethers.getSigners();
    const nft = await deployNFT(owner);

    await nft.mintAgentNFT(a1.address, "ASN-001", 680, 50);
    await nft.mintAgentNFT(a2.address, "ASN-002", 680, 50);

    await expect(
      nft.batchUpdateReputation(
        [a1.address, a2.address],
        [700, 950], // 950 is out of range
        [60, 90],
      ),
    ).to.be.revertedWith("Invalid credit score");
  });

  it("reverts if any trust score exceeds 100", async () => {
    const [owner, a1] = await ethers.getSigners();
    const nft = await deployNFT(owner);

    await nft.mintAgentNFT(a1.address, "ASN-001", 680, 50);

    await expect(
      nft.batchUpdateReputation([a1.address], [700], [101]),
    ).to.be.revertedWith("Invalid trust score");
  });
});
