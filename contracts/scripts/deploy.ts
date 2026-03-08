import { ethers } from "hardhat";

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

  console.log("\n=== Deployment Summary ===");
  console.log("LINK Token:          ", LINK_TOKEN_SEPOLIA);
  console.log("ASN Registry:        ", asnAddr);
  console.log("Agent Registry:      ", agentAddr);
  console.log("Task Board:          ", taskAddr);
  console.log("Treasury:            ", treasuryAddr);
  console.log("\nUpdate these addresses in LuckyApp/src/lib/chains.ts → CHAIN_CONFIGS.sepolia.contracts");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
