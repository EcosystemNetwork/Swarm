/**
 * Contract Test Suite — PRD 4
 *
 * Tests: SwarmAgentRegistryLink, SwarmTaskBoardLink
 *
 * Run: npx hardhat test --network hardhat
 */

import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

// ── Fixtures ─────────────────────────────────────────────────────────────────

async function deployRegistryFixture() {
  const [owner, agent1, agent2, other] = await ethers.getSigners();

  const Registry = await ethers.getContractFactory("SwarmAgentRegistryLink");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();

  return { registry, owner, agent1, agent2, other };
}

async function deployTaskBoardFixture() {
  const [owner, poster, agent, other] = await ethers.getSigners();

  // Deploy MockLINK
  const MockLINK = await ethers.getContractFactory("MockLINK");
  const link = await MockLINK.deploy();
  await link.waitForDeployment();

  // Deploy TaskBoard with LINK address
  const TaskBoard = await ethers.getContractFactory("SwarmTaskBoardLink");
  const board = await TaskBoard.deploy(await link.getAddress());
  await board.waitForDeployment();

  // Fund poster with 1000 LINK
  const LINK_1000 = ethers.parseEther("1000");
  await link.transfer(poster.address, LINK_1000);

  return { board, link, owner, poster, agent, other };
}

// ═══════════════════════════════════════════════════════════════════════════
// SwarmAgentRegistryLink
// ═══════════════════════════════════════════════════════════════════════════

describe("SwarmAgentRegistryLink", () => {
  // ── Deployment ─────────────────────────────────────────────────────────

  it("deploys and sets owner", async () => {
    const { registry, owner } = await loadFixture(deployRegistryFixture);
    expect(await registry.owner()).to.equal(owner.address);
  });

  it("starts with zero agents", async () => {
    const { registry } = await loadFixture(deployRegistryFixture);
    expect(await registry.agentCount()).to.equal(0n);
  });

  // ── registerAgent ───────────────────────────────────────────────────────

  it("registers an agent and emits AgentRegistered", async () => {
    const { registry, agent1 } = await loadFixture(deployRegistryFixture);

    await expect(
      registry.connect(agent1).registerAgent("Alpha", "nlp,code", "ASN-001", 100n)
    )
      .to.emit(registry, "AgentRegistered")
      .withArgs(agent1.address, "Alpha", "ASN-001", await latestTimestamp());
  });

  it("stores correct defaults after registration (creditScore 680, trustScore 50)", async () => {
    const { registry, agent1 } = await loadFixture(deployRegistryFixture);

    await registry.connect(agent1).registerAgent("Alpha", "nlp", "ASN-001", 0n);
    const a = await registry.getAgent(agent1.address);

    expect(a.creditScore).to.equal(680);
    expect(a.trustScore).to.equal(50);
    expect(a.active).to.equal(true);
  });

  it("increments agentCount", async () => {
    const { registry, agent1, agent2 } = await loadFixture(deployRegistryFixture);

    await registry.connect(agent1).registerAgent("A1", "code", "ASN-001", 0n);
    await registry.connect(agent2).registerAgent("A2", "nlp", "ASN-002", 0n);

    expect(await registry.agentCount()).to.equal(2n);
  });

  it("rejects double-registration", async () => {
    const { registry, agent1 } = await loadFixture(deployRegistryFixture);

    await registry.connect(agent1).registerAgent("Alpha", "nlp", "ASN-001", 0n);

    await expect(
      registry.connect(agent1).registerAgent("Alpha2", "code", "ASN-002", 0n)
    ).to.be.revertedWith("Already registered");
  });

  it("rejects duplicate ASN", async () => {
    const { registry, agent1, agent2 } = await loadFixture(deployRegistryFixture);

    await registry.connect(agent1).registerAgent("A1", "nlp", "ASN-DUP", 0n);

    await expect(
      registry.connect(agent2).registerAgent("A2", "code", "ASN-DUP", 0n)
    ).to.be.revertedWith("ASN already taken");
  });

  it("rejects empty ASN", async () => {
    const { registry, agent1 } = await loadFixture(deployRegistryFixture);

    await expect(
      registry.connect(agent1).registerAgent("A1", "nlp", "", 0n)
    ).to.be.revertedWith("ASN required");
  });

  // ── Permission checks ────────────────────────────────────────────────────

  it("registerAgentFor is owner-only", async () => {
    const { registry, agent1, agent2 } = await loadFixture(deployRegistryFixture);

    await expect(
      registry.connect(agent1).registerAgentFor(agent2.address, "A2", "nlp", "ASN-003", 0n)
    ).to.be.reverted;
  });

  it("owner can register on behalf of another address", async () => {
    const { registry, owner, agent1 } = await loadFixture(deployRegistryFixture);

    await registry.connect(owner).registerAgentFor(agent1.address, "A1", "nlp", "ASN-004", 0n);
    expect(await registry.isRegistered(agent1.address)).to.equal(true);
  });

  // ── updateSkills ─────────────────────────────────────────────────────────

  it("registered agent can update skills", async () => {
    const { registry, agent1 } = await loadFixture(deployRegistryFixture);

    await registry.connect(agent1).registerAgent("A1", "nlp", "ASN-001", 0n);

    await expect(registry.connect(agent1).updateSkills("nlp,code,vision"))
      .to.emit(registry, "SkillsUpdated")
      .withArgs(agent1.address, "nlp,code,vision", await latestTimestamp());

    const a = await registry.getAgent(agent1.address);
    expect(a.skills).to.equal("nlp,code,vision");
  });

  it("unregistered address cannot update skills", async () => {
    const { registry, agent1 } = await loadFixture(deployRegistryFixture);

    await expect(registry.connect(agent1).updateSkills("nlp")).to.be.revertedWith("Not registered");
  });

  // ── updateCredit ──────────────────────────────────────────────────────────

  it("owner can update credit score within bounds (300-900)", async () => {
    const { registry, owner, agent1 } = await loadFixture(deployRegistryFixture);

    await registry.connect(agent1).registerAgent("A1", "nlp", "ASN-001", 0n);
    await registry.connect(owner).updateCredit(agent1.address, 750, 80);

    const a = await registry.getAgent(agent1.address);
    expect(a.creditScore).to.equal(750);
    expect(a.trustScore).to.equal(80);
  });

  it("rejects credit score below 300", async () => {
    const { registry, owner, agent1 } = await loadFixture(deployRegistryFixture);

    await registry.connect(agent1).registerAgent("A1", "nlp", "ASN-001", 0n);

    await expect(registry.connect(owner).updateCredit(agent1.address, 299, 50))
      .to.be.revertedWith("Credit 300-900");
  });

  it("rejects trust score above 100", async () => {
    const { registry, owner, agent1 } = await loadFixture(deployRegistryFixture);

    await registry.connect(agent1).registerAgent("A1", "nlp", "ASN-001", 0n);

    await expect(registry.connect(owner).updateCredit(agent1.address, 700, 101))
      .to.be.revertedWith("Trust 0-100");
  });

  it("non-owner cannot update credit", async () => {
    const { registry, agent1, agent2 } = await loadFixture(deployRegistryFixture);

    await registry.connect(agent1).registerAgent("A1", "nlp", "ASN-001", 0n);

    await expect(registry.connect(agent2).updateCredit(agent1.address, 700, 70))
      .to.be.reverted;
  });

  // ── deactivateAgent ───────────────────────────────────────────────────────

  it("agent can deactivate itself", async () => {
    const { registry, agent1 } = await loadFixture(deployRegistryFixture);

    await registry.connect(agent1).registerAgent("A1", "nlp", "ASN-001", 0n);
    await registry.connect(agent1).deactivateAgent();

    expect(await registry.isRegistered(agent1.address)).to.equal(false);
  });

  it("deactivation emits AgentDeactivated", async () => {
    const { registry, agent1 } = await loadFixture(deployRegistryFixture);

    await registry.connect(agent1).registerAgent("A1", "nlp", "ASN-001", 0n);

    await expect(registry.connect(agent1).deactivateAgent())
      .to.emit(registry, "AgentDeactivated")
      .withArgs(agent1.address, await latestTimestamp());
  });

  it("unregistered agent cannot deactivate", async () => {
    const { registry, agent1 } = await loadFixture(deployRegistryFixture);

    await expect(registry.connect(agent1).deactivateAgent())
      .to.be.revertedWith("Not registered");
  });

  // ── getAgentByASN ─────────────────────────────────────────────────────────

  it("looks up agent by ASN", async () => {
    const { registry, agent1 } = await loadFixture(deployRegistryFixture);

    await registry.connect(agent1).registerAgent("Alpha", "nlp", "ASN-LOOKUP", 0n);
    const a = await registry.getAgentByASN("ASN-LOOKUP");

    expect(a.agentAddress).to.equal(agent1.address);
    expect(a.name).to.equal("Alpha");
  });

  it("reverts for unknown ASN", async () => {
    const { registry } = await loadFixture(deployRegistryFixture);

    await expect(registry.getAgentByASN("NONEXISTENT")).to.be.revertedWith("ASN not found");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SwarmTaskBoardLink
// ═══════════════════════════════════════════════════════════════════════════

describe("SwarmTaskBoardLink", () => {
  const BUDGET = ethers.parseEther("10");
  const ONE_DAY = 86400;

  async function postTask(board: any, link: any, poster: any, title = "Test Task") {
    const deadline = (await time.latest()) + ONE_DAY;
    await link.connect(poster).approve(await board.getAddress(), BUDGET);
    await board.connect(poster).postTask(
      poster.address,
      title,
      "Description",
      "nlp,code",
      deadline,
      BUDGET
    );
    return { taskId: 0, deadline };
  }

  // ── Deployment ─────────────────────────────────────────────────────────

  it("deploys with correct LINK address", async () => {
    const { board, link } = await loadFixture(deployTaskBoardFixture);
    expect(await board.linkToken()).to.equal(await link.getAddress());
  });

  it("starts with zero tasks", async () => {
    const { board } = await loadFixture(deployTaskBoardFixture);
    expect(await board.taskCount()).to.equal(0n);
  });

  // ── postTask ────────────────────────────────────────────────────────────

  it("posts a task, transfers LINK, emits TaskPosted", async () => {
    const { board, link, poster } = await loadFixture(deployTaskBoardFixture);
    const { deadline } = await postTask(board, link, poster);

    await expect(
      (async () => {
        const deadline2 = (await time.latest()) + ONE_DAY;
        await link.connect(poster).approve(await board.getAddress(), BUDGET);
        return board.connect(poster).postTask(poster.address, "Task 2", "Desc", "nlp", deadline2, BUDGET);
      })()
    ).to.emit(board, "TaskPosted");

    expect(await board.taskCount()).to.be.greaterThan(0n);
  });

  it("task starts in Open status", async () => {
    const { board, link, poster } = await loadFixture(deployTaskBoardFixture);
    await postTask(board, link, poster);
    const task = await board.getTask(0);
    expect(task.status).to.equal(0); // TaskStatus.Open
  });

  it("rejects zero budget", async () => {
    const { board, link, poster } = await loadFixture(deployTaskBoardFixture);
    const deadline = (await time.latest()) + ONE_DAY;

    await expect(
      board.connect(poster).postTask(poster.address, "Task", "Desc", "nlp", deadline, 0n)
    ).to.be.revertedWith("Budget must be > 0");
  });

  it("rejects past deadline", async () => {
    const { board, link, poster } = await loadFixture(deployTaskBoardFixture);
    const pastDeadline = (await time.latest()) - 1;
    await link.connect(poster).approve(await board.getAddress(), BUDGET);

    await expect(
      board.connect(poster).postTask(poster.address, "Task", "Desc", "nlp", pastDeadline, BUDGET)
    ).to.be.revertedWith("Deadline must be in the future");
  });

  // ── claimTask ───────────────────────────────────────────────────────────

  it("agent can claim an open task, emits TaskClaimed", async () => {
    const { board, link, poster, agent } = await loadFixture(deployTaskBoardFixture);
    await postTask(board, link, poster);

    await expect(board.connect(agent).claimTask(0))
      .to.emit(board, "TaskClaimed")
      .withArgs(0, agent.address, await latestTimestamp());

    const task = await board.getTask(0);
    expect(task.status).to.equal(1); // TaskStatus.Claimed
    expect(task.claimedBy).to.equal(agent.address);
  });

  it("poster cannot claim own task", async () => {
    const { board, link, poster } = await loadFixture(deployTaskBoardFixture);
    await postTask(board, link, poster);

    await expect(board.connect(poster).claimTask(0))
      .to.be.revertedWith("Cannot claim own task");
  });

  it("cannot claim already-claimed task", async () => {
    const { board, link, poster, agent, other } = await loadFixture(deployTaskBoardFixture);
    await postTask(board, link, poster);
    await board.connect(agent).claimTask(0);

    await expect(board.connect(other).claimTask(0))
      .to.be.revertedWith("Not open");
  });

  it("cannot claim expired task", async () => {
    const { board, link, poster, agent } = await loadFixture(deployTaskBoardFixture);
    const deadline = (await time.latest()) + ONE_DAY;
    await link.connect(poster).approve(await board.getAddress(), BUDGET);
    await board.connect(poster).postTask(poster.address, "T", "D", "nlp", deadline, BUDGET);

    await time.increase(ONE_DAY + 1);

    await expect(board.connect(agent).claimTask(0))
      .to.be.revertedWith("Expired");
  });

  // ── submitDelivery / approveDelivery ─────────────────────────────────────

  it("full happy path: post → claim → submit → approve → payout", async () => {
    const { board, link, poster, agent } = await loadFixture(deployTaskBoardFixture);
    const boardAddr = await board.getAddress();

    await postTask(board, link, poster);
    await board.connect(agent).claimTask(0);

    const deliveryHash = ethers.keccak256(ethers.toUtf8Bytes("delivery-content"));
    await expect(board.connect(agent).submitDelivery(0, deliveryHash))
      .to.emit(board, "DeliverySubmitted")
      .withArgs(0, agent.address, deliveryHash, await latestTimestamp());

    const agentBalanceBefore = await link.balanceOf(agent.address);

    await expect(board.connect(poster).approveDelivery(0))
      .to.emit(board, "DeliveryApproved")
      .withArgs(0, agent.address, BUDGET, await latestTimestamp());

    const agentBalanceAfter = await link.balanceOf(agent.address);
    expect(agentBalanceAfter - agentBalanceBefore).to.equal(BUDGET);

    const task = await board.getTask(0);
    expect(task.status).to.equal(2); // TaskStatus.Completed
  });

  it("only poster can approve delivery", async () => {
    const { board, link, poster, agent, other } = await loadFixture(deployTaskBoardFixture);
    await postTask(board, link, poster);
    await board.connect(agent).claimTask(0);
    await board.connect(agent).submitDelivery(0, ethers.keccak256(ethers.toUtf8Bytes("d")));

    await expect(board.connect(other).approveDelivery(0))
      .to.be.revertedWith("Only poster can approve");
  });

  it("cannot approve without delivery", async () => {
    const { board, link, poster, agent } = await loadFixture(deployTaskBoardFixture);
    await postTask(board, link, poster);
    await board.connect(agent).claimTask(0);

    await expect(board.connect(poster).approveDelivery(0))
      .to.be.revertedWith("No delivery submitted");
  });

  it("only assigned agent can submit delivery", async () => {
    const { board, link, poster, agent, other } = await loadFixture(deployTaskBoardFixture);
    await postTask(board, link, poster);
    await board.connect(agent).claimTask(0);

    await expect(
      board.connect(other).submitDelivery(0, ethers.keccak256(ethers.toUtf8Bytes("d")))
    ).to.be.revertedWith("Not assigned agent");
  });

  // ── disputeDelivery ───────────────────────────────────────────────────────

  it("poster can dispute a claimed task", async () => {
    const { board, link, poster, agent } = await loadFixture(deployTaskBoardFixture);
    await postTask(board, link, poster);
    await board.connect(agent).claimTask(0);

    await expect(board.connect(poster).disputeDelivery(0))
      .to.emit(board, "DeliveryDisputed")
      .withArgs(0, poster.address, await latestTimestamp());

    const task = await board.getTask(0);
    expect(task.status).to.equal(4); // TaskStatus.Disputed
  });

  it("non-poster cannot dispute", async () => {
    const { board, link, poster, agent, other } = await loadFixture(deployTaskBoardFixture);
    await postTask(board, link, poster);
    await board.connect(agent).claimTask(0);

    await expect(board.connect(other).disputeDelivery(0))
      .to.be.revertedWith("Only poster can dispute");
  });

  // ── getOpenTasks ──────────────────────────────────────────────────────────

  it("getOpenTasks returns only non-expired open tasks", async () => {
    const { board, link, poster, agent } = await loadFixture(deployTaskBoardFixture);

    // Post 2 tasks
    const deadline1 = (await time.latest()) + ONE_DAY;
    await link.connect(poster).approve(await board.getAddress(), BUDGET * 2n);
    await board.connect(poster).postTask(poster.address, "T1", "D", "nlp", deadline1, BUDGET);
    await board.connect(poster).postTask(poster.address, "T2", "D", "nlp", deadline1, BUDGET);

    // Claim task 0 → removes from open
    await board.connect(agent).claimTask(0);

    const open = await board.getOpenTasks();
    expect(open.length).to.equal(1);
    expect(open[0].title).to.equal("T2");
  });
});

// ── helpers ───────────────────────────────────────────────────────────────────

async function latestTimestamp(): Promise<bigint> {
  return BigInt(await time.latest());
}
