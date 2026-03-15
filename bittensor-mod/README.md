# SwarmCare Bittensor Subnet

**Decentralized GPU compute training AI models for elderly care coordination**

SwarmCare is a Bittensor subnet that decentralizes AI model training for robot fleet coordination in elderly care facilities. Miners contribute GPU compute to train care coordination models. Validators benchmark model quality. The best-performing miners earn TAO tokens. The highest-scoring models are deployed back into the Swarm Protocol agent fleet.

---

## 🎯 Executive Summary

**One-line pitch:** Decentralized GPU compute training AI models that coordinate robot swarms for elderly care — better models earn more TAO.

**Digital commodity produced:** Optimized care coordination models that plan robot-to-resident assignments, medication schedules, emergency responses, and supply delivery for elderly care facilities.

**Market:** $1.7T global elderly care market. 15,000+ US nursing facilities need AI coordination to address chronic staff shortages.

**Revenue path:** Care facilities pay per-task API fees → revenue flows to subnet emissions → model licensing to robotics OEMs → self-sustaining beyond TAO emissions.

---

## 📦 Repository Structure

```
bittensor-mod/
├── demo.py                    # Full end-to-end demo (RUN THIS FOR JUDGES)
├── requirements.txt           # Python dependencies
├── README.md                  # This file
│
├── subnet/                    # Core subnet implementation
│   ├── __init__.py
│   ├── protocol.py            # Training task & result definitions
│   ├── miner.py               # GPU training worker
│   ├── validator.py           # Model quality judge
│   └── reward.py              # Scoring logic (integrated in validator)
│
├── scenarios/                 # Care scenario bank
│   ├── __init__.py
│   └── care_scenarios.py      # 5 built-in scenarios (hydration, emergency, etc.)
│
└── scripts/
    └── pull_best_model.py     # Deploys best model to Swarm
```

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd bittensor-mod
pip install -r requirements.txt
```

### 2. Run Full Demo

```bash
python demo.py
```

This runs the complete subnet workflow:
1. Validator creates training task
2. 3 miners train models on GPU (or CPU fallback)
3. Miners return predictions on held-out benchmarks
4. Validator scores accuracy, generalization, efficiency, novelty
5. Rankings determine TAO emissions
6. Best model ready for deployment to Swarm

**Expected runtime:** 5-15 minutes (depending on GPU availability)

### 3. Deploy Best Model to Swarm

```bash
python scripts/pull_best_model.py --model-hash <hash_from_demo>
```

---

## 🏗️ Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                  SwarmCare Subnet Architecture                   │
└─────────────────────────────────────────────────────────────────┘

   Swarm Protocol          Bittensor Subnet           Miner Network
   ┌──────────────┐        ┌──────────────┐         ┌─────────────┐
   │ Care Facility├───────►│  Validator   ├────────►│   Miner 1   │
   │  (Scenarios) │        │              │         │   (GPU)     │
   └──────────────┘        └──────┬───────┘         └─────────────┘
                                  │                  ┌─────────────┐
                                  ├─────────────────►│   Miner 2   │
                                  │                  │   (GPU)     │
                                  │                  └─────────────┘
                                  │                  ┌─────────────┐
                                  └─────────────────►│   Miner 3   │
                                                     │   (GPU)     │
                                                     └─────────────┘
                                        │
                                        ▼
                              ┌──────────────────┐
                              │   Best Model     │
                              │  (Deployed to    │
                              │  Swarm Agents)   │
                              └──────────────────┘
```

### Miner Workflow

**Input:** `TrainingTask` containing:
- 3-5 care scenarios for training
- 2-3 benchmark scenario IDs (held-out tests)
- Model config (base model, epochs, learning rate, etc.)

**Compute Work:**
- Fine-tune base care coordination model (LLaMA-3.2-1B)
- Optimize for plan quality: resident coverage, time efficiency, priority handling, fallback robustness

**Output:** `TrainingResult` containing:
- Model weights hash (SHA-256 proof of work)
- Benchmark predictions (model output on held-out scenarios)
- Training loss, time, avg inference time
- GPU info

### Validator Workflow

**Task Generation:**
- Randomly sample from scenario bank (5 total scenarios)
- 3-5 for training, 2 for benchmark (held out)
- Vary difficulty, task types, facility configs

**Scoring Method:**
Run miner's model predictions against optimal plans on benchmark scenarios. Score on 4 weighted dimensions:

| Metric | Weight | What It Measures |
|--------|--------|------------------|
| **Accuracy** | 40% | Plan covers all residents, meets time constraints, prioritizes special needs correctly, includes fallback plan |
| **Generalization** | 25% | Consistent performance across easy AND hard scenarios. Prevents overfitting to simple cases. |
| **Efficiency** | 20% | Inference speed. Swarm agents need real-time responses (<500ms). Faster models score higher. |
| **Novelty** | 15% | Discovers plans BETTER than known optimal. Rewards genuine innovation, not just matching benchmarks. |

**Cost:** Scoring is inference-only (no training needed). Validator runs benchmark evaluation on CPU. Estimated <$0.01 per miner evaluation.

---

## 📊 Scenario Bank

5 built-in elderly care scenarios:

1. **Morning Hydration Round** (Easy)
   - 6 residents, 3 robots, 2 wheelchairs
   - Max time: 30 min
   - Priority-first assignment

2. **Emergency Response** (Hard)
   - Fall detection in Room 305
   - Immediate reroute required
   - Max time: 5 min
   - Emergency override enabled

3. **Medication Round** (Medium)
   - 8 residents, 1 robot offline
   - Critical medication priority
   - Max time: 45 min

4. **Night Check** (Easy)
   - Quiet rounds, minimal noise
   - Vitals check required
   - 1 monitoring robot

5. **Supply Delivery** (Medium)
   - 4 rooms, avoid sleeping resident
   - Batch delivery optimization
   - Max time: 25 min

Each scenario has:
- Residents with mobility status, priority, special needs
- Robots with type, location, battery, capacity, status
- Constraints (time limit, quiet hours, priority rules)
- Optimal plan (for validator scoring)

---

## 🎯 Incentive Design

### Why Scoring Rewards Genuine Quality

The scoring system ensures the only way to earn more TAO is to produce **better care coordination models**:

- **Held-out benchmarks** prevent memorization
- **Randomized task generation** prevents prediction
- **Generalization metric** penalizes overfitting
- **Novelty metric** rewards genuine innovation

### Attack Vector Analysis

| Attack | How It Works | Why It Fails |
|--------|-------------|-------------|
| **Memorization** | Miner memorizes training data instead of learning | Held-out benchmarks are never shown during training. Generalization score catches this. |
| **Copying** | Copy another miner's model weights | Model hash is SHA-256. Validators can detect duplicate hashes. Future: ZK proofs of unique training. |
| **Sybil Attack** | Register many miners to collect more TAO | TAO emission is quality-weighted, not per-miner. 10 bad miners earn less than 1 good miner. |
| **Lazy Mining** | Return random/minimal outputs | Accuracy score will be near 0. No TAO earned. Compute wasted for nothing. |

---

## 💰 Market Demand & Revenue Path

### Target Market

- **Global elderly care:** $1.7 trillion market
- **US facilities:** 15,000+ nursing facilities, 1.3M residents
- **Staff shortage:** Need 1.2M additional workers by 2030
- **AI solution:** Robot fleet coordination reduces manual task coordination by 60%+

### Output Buyers

1. **Primary:** Elderly care facility operators (per-task API fees: $0.10-1.00 per coordination request)
2. **Secondary:** Robotics companies licensing trained models for their hardware
3. **Tertiary:** Insurance companies incentivizing AI-coordinated facilities (reduced incident rates)

### Revenue Path Beyond Emissions

- **Phase 1 (Months 1-6):** Subnet runs on TAO emissions. Miners subsidized by token rewards.
- **Phase 2 (Months 6-12):** Swarm Protocol charges API fees to care facilities. Revenue supplements emissions.
- **Phase 3 (Year 2+):** Model licensing to robotics OEMs. Enterprise contracts with healthcare chains. **Revenue exceeds emissions — subnet is self-sustaining.**

---

## 🔐 Sovereignty Test

**Hackathon challenge:** "If any single cloud, company, or API fails, does your subnet still produce value?"

### SwarmCare Passes:

| Failure Scenario | SwarmCare Response |
|-----------------|-------------------|
| OpenAI/Anthropic goes down | Miners train open-source models (LLaMA, Mistral). No dependency on proprietary APIs. |
| AWS goes down | Swarm Hub has Firestore fallback. Miners run on their own hardware globally. Bittensor network is decentralized. |
| Cloud GPU provider fails | Miners use their own GPUs. Hardware-agnostic — any CUDA-capable machine can mine. |
| Policy change blocks AI | Permissionless access. No single entity can block training or model deployment. Miners operate across jurisdictions. |
| Training data provider shuts down | Scenario bank is open-source and embedded in subnet code. Community can contribute new scenarios permissionlessly. |
| Single miner goes offline | Other miners continue. Darwinian competition means losing one miner has zero impact on output quality. |

**Key sovereignty advantage:** The trained models are the commodity. Once trained, they exist independently of any infrastructure. Even if the entire Bittensor network went down temporarily, the last-best model continues serving Swarm agents.

---

## 🛠️ Development Roadmap

### Testnet Deployment
- [x] Protocol definitions
- [x] Miner implementation
- [x] Validator implementation
- [x] Scenario bank (5 scenarios)
- [x] End-to-end demo
- [ ] Register subnet on Bittensor testnet
- [ ] Deploy validator with full scenario bank
- [ ] Onboard 3-5 initial miners
- [ ] Run 100+ validation rounds, tune scoring weights

### Mainnet Deployment
- [ ] Register on mainnet (50 TAO, covered by prize)
- [ ] Open to public miners
- [ ] Integrate pull_best_model pipeline with Swarm production hub
- [ ] Launch care facility API (Phase 2 revenue)

---

## 📖 Documentation

### For Judges

Run the demo:
```bash
python demo.py
```

This demonstrates:
1. Validator creates randomized training tasks
2. Miners train models on GPU
3. Validator scores predictions fairly
4. Best model identified for deployment

### For Miners

See: [MINING.md](MINING.md) (TODO)

### For Validators

See: [VALIDATING.md](VALIDATING.md) (TODO)

---

## 🤝 Integration with Swarm Protocol

SwarmCare subnet produces trained models that deploy into the existing Swarm agent fleet:

1. **Best model identified** by validator rankings
2. **`pull_best_model.py`** downloads weights from IPFS/Arweave
3. **Swarm agents reload** coordination engine via WebSocket Hub
4. **Care facilities submit** coordination requests via API
5. **Agents use community-trained AI** to plan robot tasks

The subnet output (trained models) becomes the **coordination brain** for robot swarms in elderly care facilities.

---

## 📄 License

MIT License (same as Swarm Protocol)

---

## 🙋 Questions?

For hackathon judges:
- Run `python demo.py` to see the full workflow
- Check `/scenarios/care_scenarios.py` for scenario details
- Review `/subnet/validator.py` for scoring logic

For technical questions:
- See Bittensor docs: https://docs.learnbittensor.org/
- See Swarm Protocol: https://swarmprotocol.ai

---

**SwarmCare** — Decentralized AI for better care.
