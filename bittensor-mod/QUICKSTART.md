# SwarmCare Bittensor Subnet - Quickstart Guide

## For Hackathon Judges

This is a **complete, working Bittensor subnet** for decentralized AI model training for elderly care coordination.

---

## ⚡ 3-Minute Demo

```bash
# 1. Navigate to the subnet directory
cd /home/god/Desktop/Swarm/Swarm/bittensor-mod

# 2. Install dependencies
pip install -r requirements.txt

# 3. Run full end-to-end demo
python demo.py
```

**What you'll see:**
1. Validator creates a training task with 3-5 care scenarios
2. 3 miners compete to train the best coordination model
3. Each miner trains on GPU (or CPU fallback) and returns predictions
4. Validator scores each model on accuracy, generalization, efficiency, novelty
5. Final rankings show which miner earns the most TAO
6. Best model is ready for deployment to Swarm Protocol

**Expected runtime:** 5-15 minutes (depending on GPU availability)

---

## 📁 Key Files to Review

For judges evaluating the submission:

### 1. Protocol Definition
**File:** [`subnet/protocol.py`](subnet/protocol.py)

Defines the communication protocol between validators and miners:
- `TrainingTask` - what validators send to miners
- `TrainingResult` - what miners return
- `ModelScore` - how validators score models
- `CareScenario` - elderly care coordination scenarios

### 2. Miner Implementation
**File:** [`subnet/miner.py`](subnet/miner.py)

GPU worker that trains care coordination models:
- Loads base LLaMA model
- Fine-tunes on training scenarios
- Runs inference on held-out benchmarks
- Returns model hash + predictions

### 3. Validator Implementation
**File:** [`subnet/validator.py`](subnet/validator.py)

Judges model quality across 4 metrics:
- **Accuracy (40%)** - plan covers residents, meets constraints
- **Generalization (25%)** - works on easy AND hard scenarios
- **Efficiency (20%)** - fast inference (<500ms)
- **Novelty (15%)** - discovers better-than-optimal plans

### 4. Scenario Bank
**File:** [`scenarios/care_scenarios.py`](scenarios/care_scenarios.py)

5 built-in elderly care scenarios:
- Morning hydration round (easy)
- Emergency fall response (hard)
- Medication delivery with offline robot (medium)
- Quiet night check (easy)
- Supply delivery avoiding sleeping resident (medium)

Each scenario has residents, robots, constraints, and optimal plans for scoring.

### 5. End-to-End Demo
**File:** [`demo.py`](demo.py)

Complete subnet workflow from task creation → miner training → validator scoring → best model deployment.

---

## 🎯 Judging Criteria Alignment

### Market Demand ✓
- **$1.7T global elderly care market**
- 15,000+ US facilities need AI coordination
- Staff shortage: 1.2M additional workers needed by 2030
- Output buyers: care facilities, robotics companies, insurance providers

### Economic Viability ✓
- **Revenue model:** Care facilities pay per-task API fees
- Revenue flows to subnet emissions
- Secondary revenue: model licensing to robotics OEMs
- Path beyond emissions: self-sustaining by Year 2

### Miner Task ✓
- **Clear, measurable:** Fine-tune care coordination model on training scenarios
- GPU compute required (CPU fallback available)
- Return: model weights hash + predictions on benchmarks
- Implementable: Working code in `subnet/miner.py`

### Validator Scoring ✓
- **4 metrics:** Accuracy (40%), Generalization (25%), Efficiency (20%), Novelty (15%)
- Cost-efficient: Inference-only, <$0.01 per evaluation
- Anti-gaming: Held-out benchmarks prevent memorization
- Working implementation: `subnet/validator.py`

### Incentive Design ✓
- **Better models = more TAO**
- Gaming resistance: randomized tasks, held-out tests, generalization scoring
- Novel plan discovery rewarded
- Multiple scenario types prevent single-trick miners

### Technical Feasibility ✓
- **Working demo:** `python demo.py` runs end-to-end
- Swarm Protocol deployed: swarmprotocol.ai
- Testnet path documented
- Mainnet registration cost covered by prize

### Sovereignty ✓
- **No OpenAI/Anthropic dependency:** Open-source models (LLaMA)
- No cloud dependency: Miners run their own hardware
- Permissionless: Scenario bank is open-source
- Resilient: Trained models exist independently

---

## 🏗️ What's Implemented

✅ **Complete protocol definitions** (`protocol.py`)
✅ **Working miner** with GPU training (`miner.py`)
✅ **Working validator** with 4-metric scoring (`validator.py`)
✅ **5-scenario bank** for elderly care (`care_scenarios.py`)
✅ **End-to-end demo** (`demo.py`)
✅ **Model deployment script** (`pull_best_model.py`)
✅ **Requirements file** (`requirements.txt`)
✅ **Comprehensive README** (`README.md`)

---

## 🚀 Next Steps (Post-Hackathon)

1. Register subnet on Bittensor testnet
2. Deploy validator with full scenario bank
3. Onboard initial miners from community
4. Run 100+ validation rounds, tune scoring weights
5. Register on mainnet (50 TAO from prize)
6. Integrate with Swarm Protocol production hub
7. Launch care facility API (Phase 2 revenue)

---

## 📊 Output: Trained Models

The subnet produces a **tangible digital commodity**:

**Optimized care coordination models** that:
- Plan robot-to-resident assignments
- Schedule medication delivery
- Handle emergency responses
- Optimize supply delivery
- Coordinate multi-floor facilities

**Buyers:**
- Care facilities (per-task API fees)
- Robotics companies (model licensing)
- Healthcare chains (enterprise contracts)

---

## 🔍 How to Verify

### Protocol Definitions
```bash
python -c "from subnet.protocol import TrainingTask, ModelScore; print('✓ Protocol imports work')"
```

### Scenario Bank
```bash
python -c "from scenarios.care_scenarios import ALL_SCENARIOS; print(f'✓ {len(ALL_SCENARIOS)} scenarios loaded')"
```

### Miner
```bash
python -c "from subnet.miner import SwarmCareMiner; m = SwarmCareMiner(1); print(f'✓ Miner on {m.device}')"
```

### Validator
```bash
python -c "from subnet.validator import SwarmCareValidator; v = SwarmCareValidator(0); print('✓ Validator ready')"
```

### Full Demo
```bash
python demo.py
```

---

## 💡 Key Innovation

**Decentralized AI training for physical robot coordination**

Unlike most Bittensor subnets (text generation, image generation), SwarmCare trains models that **control real-world robot fleets**. The output is deployed into physical elderly care facilities where:

- Robots deliver medications
- Robots respond to falls
- Robots monitor vitals
- Robots optimize supply routes

The trained models coordinate these robots efficiently, safely, and at scale.

---

## 📞 Support

For questions during judging:
- All code is documented with inline comments
- README.md has full architecture explanation
- demo.py has step-by-step print statements
- Each file has a docstring explaining its purpose

---

**SwarmCare** — Decentralized AI for better care.

Run `python demo.py` to see it in action! 🚀
