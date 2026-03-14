# Swarm Agent Monitor — Chainlink CRE Workflow

A Chainlink Runtime Environment (CRE) workflow that monitors the Swarm multi-agent platform by combining offchain API data with onchain oracle reads.

## What It Does

Every 10 minutes, this workflow:

1. **Fetches agent fleet status** from the Swarm platform API (total agents, online/busy/offline counts, health score)
2. **Reads ETH/USD price** from a Chainlink oracle contract on Sepolia testnet
3. **Aggregates data via CRE consensus** (median aggregation across DON nodes)
4. **Returns a platform health snapshot** combining AI agent orchestration metrics with live oracle data

### Why CRE?

Swarm Protocol is a multi-agent orchestration platform where AI agents coordinate tasks, claim jobs, and operate across multiple chains. CRE enables:

- **Decentralized monitoring** — agent health checks run on Chainlink's DON, not a single server
- **Oracle-enriched snapshots** — combine offchain agent metrics with onchain price data in a single workflow
- **Verifiable execution** — CRE's consensus ensures the monitoring data is accurate across nodes
- **Trigger flexibility** — cron for scheduled monitoring + HTTP for on-demand health checks

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  CRE Workflow (DON)                  │
│                                                     │
│  ┌──────────┐    ┌──────────────┐    ┌───────────┐ │
│  │  Cron     │───▸│  Fetch Swarm │───▸│ Aggregate │ │
│  │  Trigger  │    │  API Status  │    │ & Return  │ │
│  │ (10 min)  │    └──────────────┘    │ Snapshot  │ │
│  └──────────┘           │             └───────────┘ │
│                         │                   ▲       │
│  ┌──────────┐    ┌──────▼───────┐           │       │
│  │  HTTP     │───▸│  Read ETH/  │───────────┘       │
│  │  Trigger  │    │  USD Oracle  │                   │
│  │ (manual)  │    │  (Sepolia)   │                   │
│  └──────────┘    └──────────────┘                   │
└─────────────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
  Swarm Hub API        Chainlink Oracle
  (offchain)           (onchain Sepolia)
```

## Setup

```bash
# Install dependencies
npm install

# Update config.json with your Swarm org credentials
# - orgId: your organization ID
# - agentId: a registered agent ID
# - apiKey: the agent's API key
```

## Simulation

```bash
# Run local simulation (hits real APIs and Sepolia)
npm run simulate

# Or directly:
cre workflow simulate --target local-simulation
```

## Configuration

Edit `config.json`:

| Field | Description | Default |
|-------|-------------|---------|
| `schedule` | Cron expression (min 10 min intervals) | `0 */10 * * * *` |
| `swarmApiUrl` | Swarm Hub API base URL | `https://swarmprotocol.ai` |
| `orgId` | Organization ID to monitor | — |
| `agentId` | Agent ID for API auth | — |
| `apiKey` | API key for auth | — |
| `evm.priceFeedAddress` | Chainlink ETH/USD on Sepolia | `0x694AA...325306` |
| `evm.chainSelectorName` | CRE chain selector | `ethereum-testnet-sepolia` |

## Output

The workflow returns a JSON snapshot:

```json
{
  "timestamp": 1710000000000,
  "platform": {
    "totalAgents": 5,
    "onlineAgents": 3,
    "busyAgents": 1,
    "offlineAgents": 1,
    "healthScore": 74
  },
  "oracle": {
    "ethUsd": 3245.67
  }
}
```

## Compliance Checklist (per Thomas's requirements)

- [x] Cron frequency: every 10 minutes (no less)
- [x] No mainnet writes — read-only oracle call on Sepolia
- [x] HTTP trigger has `authorizedKeys` ready for live deployment
- [x] No log triggers used (N/A)
- [x] Workflow finalized and ready for single deployment

## Source

Part of the [Swarm Protocol](https://github.com/The-Swarm-Protocol/Swarm) hackathon submission.
