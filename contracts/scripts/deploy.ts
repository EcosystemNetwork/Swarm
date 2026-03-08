import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/** LINK token on Sepolia testnet */
const LINK_TOKEN_SEPOLIA = "0x779877A7B0D9E8603169DdbD7836e478b4624789";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // 1. SwarmASNRegistry
  const ASNRegistry = await ethers.getContractFactory("SwarmASNRegistry");
  const asnRegistry = await ASNRegistry.deploy();
  await asnRegistry.waitForDeployment();
  const asnAddr = await asnRegistry.getAddress();
  console.log("SwarmASNRegistry deployed to:", asnAddr);

  // 2. SwarmAgentRegistryLink
  const AgentRegistry = await ethers.getContractFactory("SwarmAgentRegistryLink");
  const agentRegistry = await AgentRegistry.deploy();
  await agentRegistry.waitForDeployment();
  const agentAddr = await agentRegistry.getAddress();
  console.log("SwarmAgentRegistryLink deployed to:", agentAddr);

  // 3. SwarmTaskBoardLink (needs LINK token address)
  const TaskBoard = await ethers.getContractFactory("SwarmTaskBoardLink");
  const taskBoard = await TaskBoard.deploy(LINK_TOKEN_SEPOLIA);
  await taskBoard.waitForDeployment();
  const taskAddr = await taskBoard.getAddress();
  console.log("SwarmTaskBoardLink deployed to:", taskAddr);

  // 4. SwarmTreasuryLink (needs LINK token address)
  const Treasury = await ethers.getContractFactory("SwarmTreasuryLink");
  const treasury = await Treasury.deploy(LINK_TOKEN_SEPOLIA);
  await treasury.waitForDeployment();
  const treasuryAddr = await treasury.getAddress();
  console.log("SwarmTreasuryLink deployed to:", treasuryAddr);

  // ── Output Summary ──
  console.log("\n=== Deployment Summary ===");
  console.log("LINK Token:          ", LINK_TOKEN_SEPOLIA);
  console.log("ASN Registry:        ", asnAddr);
  console.log("Agent Registry:      ", agentAddr);
  console.log("Task Board:          ", taskAddr);
  console.log("Treasury:            ", treasuryAddr);

  // ── Write deployed-addresses.json ──
  const addresses = {
    network: "sepolia",
    chainId: 11155111,
    linkToken: LINK_TOKEN_SEPOLIA,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    contracts: {
      asnRegistry: asnAddr,
      agentRegistry: agentAddr,
      taskBoard: taskAddr,
      treasury: treasuryAddr,
    },
  };
  const jsonPath = path.join(__dirname, "..", "deployed-addresses.json");
  fs.writeFileSync(jsonPath, JSON.stringify(addresses, null, 2));
  console.log("\nSaved to:", jsonPath);

  // ── Output .env snippet ──
  const envSnippet = [
    "",
    "# ── Swarm LINK Contracts (Sepolia) ── deployed " + new Date().toISOString(),
    `NEXT_PUBLIC_LINK_AGENT_REGISTRY=${agentAddr}`,
    `NEXT_PUBLIC_LINK_TASK_BOARD=${taskAddr}`,
    `NEXT_PUBLIC_LINK_ASN_REGISTRY=${asnAddr}`,
    `NEXT_PUBLIC_LINK_TREASURY=${treasuryAddr}`,
    `SEPOLIA_PLATFORM_KEY=${process.env.DEPLOYER_PRIVATE_KEY || "# same key used for deployment"}`,
    "",
  ].join("\n");

  console.log("\n=== Add to LuckyApp/.env.local ===");
  console.log(envSnippet);

  // Auto-append to .env.local if it exists
  const envLocalPath = path.join(__dirname, "..", "..", "LuckyApp", ".env.local");
  if (fs.existsSync(envLocalPath)) {
    const existing = fs.readFileSync(envLocalPath, "utf-8");
    // Remove old LINK contract vars if present
    const cleaned = existing
      .split("\n")
      .filter(line => !line.startsWith("NEXT_PUBLIC_LINK_") && !line.startsWith("SEPOLIA_PLATFORM_KEY="))
      .join("\n");
    fs.writeFileSync(envLocalPath, cleaned.trimEnd() + "\n" + envSnippet);
    console.log("Auto-appended to", envLocalPath);
  } else {
    console.log("(Create LuckyApp/.env.local and paste the snippet above)");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
