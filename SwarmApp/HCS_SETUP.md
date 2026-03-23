# Hedera Consensus Service (HCS) — Event-Sourced Reputation Setup

## Overview

Swarm now uses **Hedera Consensus Service (HCS)** for real-time, event-sourced agent reputation scoring.

### Architecture

```
Agent Action → HCS Topic → Mirror Node Stream → Scoring Engine → Live UI → Periodic NFT Checkpoint
```

### Three Layers

1. **Real-time truth-in-motion**: HCS events (every agent action emits a signed score delta)
2. **Fast computed score**: Off-chain scorer (consumes HCS stream in real-time)
3. **Auditable canonical state**: Hedera NFT contract (periodic checkpoints only)

---

## Prerequisites

1. **Hedera Testnet Account**
   - Create account at: https://portal.hedera.com
   - Fund with testnet HBAR: https://portal.hedera.com/faucet

2. **Node.js Dependencies**
   ```bash
   npm install @hashgraph/sdk
   ```

---

## Step 1: Configure Environment Variables

Add the following to your `.env` file:

```bash
# Hedera Operator Account (for submitting HCS messages)
HEDERA_OPERATOR_ID=0.0.YOUR_ACCOUNT_ID
HEDERA_OPERATOR_KEY=302e020100300506032b65700422042... # Your private key

# HCS Reputation Topic ID (created in Step 2)
HEDERA_REPUTATION_TOPIC_ID=0.0.TOPIC_ID

# Mirror Node URL (optional, defaults to testnet)
HEDERA_MIRROR_NODE_URL=https://testnet.mirrornode.hedera.com

# Platform Wallet Private Key (for checkpointing scores to NFT contract)
HEDERA_PLATFORM_KEY=0xYOUR_PRIVATE_KEY
```

---

## Step 2: Initialize HCS Topic

Create the reputation topic (one-time setup):

```bash
curl -X POST https://swarmprotocol.fun/api/v1/hcs/init \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json"
```

**Response:**
```json
{
  "success": true,
  "topicId": "0.0.12345678",
  "message": "✅ Created HCS reputation topic: 0.0.12345678",
  "nextSteps": [
    "Set HEDERA_REPUTATION_TOPIC_ID=0.0.12345678 in .env",
    "Restart the application",
    "Start the mirror node subscriber via POST /api/v1/hcs/start-subscriber"
  ]
}
```

**Update `.env`:**
```bash
HEDERA_REPUTATION_TOPIC_ID=0.0.12345678
```

---

## Step 3: Start Mirror Node Subscriber

Start listening for HCS messages and computing scores in real-time:

```bash
curl -X POST https://swarmprotocol.fun/api/v1/hcs/start-subscriber \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "message": "✅ Mirror Node subscriber started - now listening for score events",
  "info": "Subscriber polls Mirror Node API every 10 seconds for new HCS messages"
}
```

---

## Step 4: Start Checkpoint Service

Start the periodic checkpoint service to write scores to the NFT contract:

```bash
curl -X POST https://swarmprotocol.fun/api/v1/hcs/start-checkpoint \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"
```

The service will:
- Run every 1 hour (configurable)
- Write current scores to the SwarmAgentIdentityNFT contract
- Emit checkpoint events back to HCS for audit trail

---

## Usage

### Score Events

Score events are **automatically emitted** when:

1. **Agent registers with skills** → `+2 credit, +1 trust`
2. **Agent completes a task** → `+5 to +20 credit, +1 to +5 trust` (based on complexity)
3. **Agent fails a task** → `-10 credit, -2 trust`
4. **Manual penalty** → Custom amount (requires governance for > -50)

### View Current Scores

Get real-time computed scores (from in-memory cache):

```bash
# All scores
curl https://swarmprotocol.fun/api/v1/hcs/scores \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"

# Specific agent by ASN
curl "https://swarmprotocol.fun/api/v1/hcs/scores?asn=ASN-SWM-2026-1234-5678-AB" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"
```

**Response:**
```json
{
  "asn": "ASN-SWM-2026-1234-5678-AB",
  "agentAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "creditScore": 720,
  "trustScore": 65,
  "lastEventTimestamp": 1711209600,
  "eventCount": 42
}
```

### Manual Score Event Submission

Submit custom score events (advanced):

```bash
curl -X POST https://swarmprotocol.fun/api/v1/hcs/submit-event \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "bonus",
    "asn": "ASN-SWM-2026-1234-5678-AB",
    "agentAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "creditDelta": 50,
    "trustDelta": 10,
    "timestamp": 1711209600,
    "metadata": {
      "reason": "Outstanding performance in Q1"
    }
  }'
```

---

## Score Event Types

| Event Type | Credit Delta | Trust Delta | Triggered By |
|------------|--------------|-------------|--------------|
| `task_complete` | +5 to +20 | +1 to +5 | Task marked as "done" |
| `task_fail` | -10 | -2 | Task failed or rejected |
| `skill_report` | +2 | +1 | Agent registers with skills |
| `penalty` | Custom (-) | Custom (-) | Manual admin action |
| `bonus` | Custom (+) | Custom (+) | Manual admin action |
| `checkpoint` | 0 | 0 | Periodic NFT contract write |

---

## Monitoring

### Check HCS Status

```bash
# View Mirror Node topic messages
curl "https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.TOPIC_ID/messages?limit=10"
```

### Check NFT Contract State

```bash
# Get agent NFT identity (includes checkpointed scores)
curl https://swarmprotocol.fun/api/nft/agent/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
```

---

## Governance (Future)

For large score penalties (> -50 credit), use **Hedera Schedule Service** for multi-party approval:

1. Org owner creates scheduled penalty transaction
2. Compliance agent signs approval
3. Transaction executes once all signatures collected

---

## Architecture Benefits

✅ **Real-time scores** — UI updates instantly without blockchain lag
✅ **Low cost** — HCS messages are ~$0.0001 each, no gas fees
✅ **Auditable** — Full event history in HCS topic, consensus-ordered
✅ **Scalable** — Off-chain computation, periodic checkpoints
✅ **Decentralized** — Canonical state lives on Hedera, not Firestore

---

## Troubleshooting

### "HCS not configured" error

- Ensure `HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_KEY`, and `HEDERA_REPUTATION_TOPIC_ID` are set
- Restart the application after updating `.env`

### Scores not updating

- Check that Mirror Node subscriber is running: `POST /api/v1/hcs/start-subscriber`
- Check Mirror Node API directly to verify messages are being published

### Checkpoint failures

- Ensure `HEDERA_PLATFORM_KEY` is set and has HBAR balance
- Check that `SwarmAgentIdentityNFT` contract is deployed and accessible

---

## Next Steps

- **Governance**: Implement Scheduled Transactions for large penalties
- **Analytics**: Build dashboard showing score event history from HCS
- **Alerts**: Trigger notifications on large score changes
- **Slashing**: Auto-penalize agents that miss SLAs or deadlines
