# 🌐 Swarm Node: Decentralized Compute Marketplace

Welcome to Swarm Node - a fully decentralized compute marketplace where anyone can become a compute provider or rent distributed compute power.

---

## 🎯 What is Swarm Node?

Swarm Node allows you to:

### As a Provider 💰
- **Earn by sharing compute resources** from your machine
- **Run a simple daemon** that provisions Docker containers for workloads
- **Get paid** for providing CPU, RAM, and GPU resources
- **Join a decentralized network** - no middlemen, direct P2P compute marketplace

### As a User 🚀
- **Rent compute from the network** instead of AWS/Azure/GCP
- **Pay less** - decentralized providers compete on price
- **Privacy-first** - your workloads run on distributed nodes
- **Same interface** - works exactly like E2B or Azure providers

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     SWARM DASHBOARD                         │
│                   (SwarmApp - Next.js)                      │
│                                                             │
│  User selects "Swarm Node" provider                        │
│  → Creates lease in Firestore                              │
│  → Lease assigned to available node                        │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  │ Firestore (Real-time sync)
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│                  GOOGLE FIRESTORE                           │
│                                                             │
│  Collections:                                               │
│  • nodes/{nodeId}         - Provider registration & health │
│  • leases/{leaseId}       - Workload assignments           │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  │ onSnapshot listener
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│                 SWARM NODE DAEMON                           │
│             (packages/swarm-node - Node.js)                 │
│                                                             │
│  1. Registers with network (CPU, RAM, GPU)                 │
│  2. Sends heartbeats every 30s                             │
│  3. Listens for lease assignments                          │
│  4. Provisions Docker containers                           │
│  5. Reports status back to hub                             │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  │ Docker API
                  │
                  ▼
           ┌─────────────────┐
           │  Docker Engine  │
           │                 │
           │  Running:       │
           │  • Container 1  │
           │  • Container 2  │
           │  • Container 3  │
           └─────────────────┘
```

---

## 🚀 Getting Started as a Provider

### Prerequisites
- **Docker** installed and running
- **Node.js** 18+ with npm
- **Firebase** service account credentials
- **Server** or VPS (can be your local machine for testing)

### Step 1: Clone and Install

```bash
cd packages/swarm-node
npm install
npm run build
```

### Step 2: Get Firebase Credentials

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project → **Project Settings** → **Service Accounts**
3. Click **Generate New Private Key** and download the JSON file

### Step 3: Configure Environment

```bash
cp .env.example .env
nano .env
```

Update these fields:

```bash
# Unique identifier for your node
NODE_ID=my-provider-node-1

# Your Ethereum address (for future payments)
PROVIDER_ADDRESS=0xYourWalletAddress

# Option A: Use service account file
GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json

# Option B: Use individual env vars (extract from JSON)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

### Step 4: Start the Daemon

#### Development Mode
```bash
npm run dev
```

#### Production Mode (Recommended)
```bash
npm start
```

#### As a Systemd Service (Best)

```bash
# Copy service file
sudo cp swarm-node.service.example /etc/systemd/system/swarm-node.service

# Edit paths in service file
sudo nano /etc/systemd/system/swarm-node.service

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable swarm-node
sudo systemctl start swarm-node

# Check status
sudo systemctl status swarm-node

# View logs
sudo journalctl -u swarm-node -f
```

### Step 5: Verify Registration

You should see:

```
============== Swarm Node Daemon ==============

[Swarm Node] Initializing daemon for node: my-provider-node-1
[Swarm Node] Host properties: { cpuCores: 8, ramGb: 16, platform: 'linux', gpus: [] }
[Hub] Registered node my-provider-node-1 successfully.
[Swarm Node] Listening for incoming container workloads...
```

Check Firestore console → `nodes` collection → your node should appear with `status: "online"`.

---

## 🖥️ Using Swarm Node Compute (As a User)

### Step 1: Open Compute Dashboard

Navigate to: **http://localhost:3000/compute**

### Step 2: Create New Computer

1. Click **"New Computer"**
2. Select **"Swarm Node"** as the provider
3. Choose an available node from the list
4. Configure settings (auto-stop, persistence, etc.)
5. Click **"Create Computer"**

### Step 3: Watch It Provision

The dashboard will:
1. Create a lease in Firestore
2. Assign it to the selected node
3. The node daemon will:
   - Pull the Docker image
   - Start a container with resource limits
   - Report status back
4. Status changes: `starting` → `running`

### Step 4: Use the Computer

Once running, you can:
- View container logs
- Execute actions via API
- Stop/restart the instance
- Monitor resource usage

---

## 📊 How It Works: Detailed Flow

### Node Registration
```
1. Daemon starts → detects hardware (CPU, RAM, GPU)
2. Writes to Firestore nodes/{NODE_ID}:
   {
     resources: { cpuCores: 8, ramGb: 16, gpus: [] },
     status: "online",
     providerAddress: "0x...",
     registeredAt: timestamp
   }
3. Dashboard fetches nodes for picker UI
```

### Lease Assignment
```
1. User creates instance with swarm-node provider
2. Dashboard calls createLease():
   {
     nodeId: "selected-node-id",
     orgId: "user-org",
     computerId: "instance-123",
     containerImage: "ubuntu:22.04",
     memoryMb: 4096,
     cpuCores: 2,
     status: "starting"
   }
3. Node daemon's onSnapshot() fires
4. Daemon pulls image and starts container
5. Updates lease status to "running" with containerId
6. Dashboard shows "Running" status
```

### Container Lifecycle
```
Starting:
  User clicks "Start"
  → Dashboard: createLease(status="starting")
  → Node daemon: pullImage() → startContainer()
  → Update lease(status="running", containerId)

Running:
  Container executes workload
  Node sends heartbeats every 30s
  Dashboard polls lease status

Stopping:
  User clicks "Stop"
  → Dashboard: updateLease(status="stopping")
  → Node daemon: stopContainer() → removeContainer()
  → Update lease(status="terminated")
```

---

## 💰 Economics & Pricing

### Provider Earnings (Future)

Providers earn based on:
- **CPU-hours** used
- **RAM-hours** used
- **GPU-hours** used (if available)
- **Network bandwidth** consumed

Example:
```
Small instance (2 CPU, 4GB RAM):  $0.03/hour
Medium instance (4 CPU, 8GB RAM): $0.10/hour
Large instance (8 CPU, 16GB RAM): $0.20/hour
```

**Current Status**: MVP phase - payment system not yet implemented. Right now this is cost-free for users and providers earn reputation/stake.

### User Costs

Swarm Node pricing is **30-50% cheaper** than traditional cloud providers:

| Provider | 4 CPU / 8GB RAM | Cost per hour |
|----------|----------------|---------------|
| AWS EC2 | t3.xlarge | $0.17 |
| Azure | Standard_B4ms | $0.18 |
| E2B | Default | $0.16 |
| **Swarm Node** | **Medium** | **$0.10** |

---

## 🔒 Security Considerations

### For Providers

**Container Isolation**:
- Each workload runs in an isolated Docker container
- Resource limits enforced (CPU cores, memory)
- No host network access (default Docker networking)
- No privileged mode (unless explicitly enabled)

**Docker Socket Access**:
- Daemon requires `/var/run/docker.sock` access
- Run daemon as dedicated user with Docker group membership
- Consider running daemon in its own Docker container for extra isolation

**Firestore Security**:
- Daemon uses Firebase Admin SDK (server-side auth)
- No client credentials exposed
- Leases scoped to specific nodeId

### For Users

**Data Privacy**:
- Workloads run on distributed nodes (not centralized cloud)
- Choose nodes by provider address (reputation-based trust)
- Use encryption for sensitive data
- Consider running sensitive workloads on private/trusted nodes only

**Compute Integrity**:
- Lease state tracked in immutable Firestore
- Container logs available for audit
- Future: attestation proofs, TEE support

---

## 🛠️ Troubleshooting

### Provider Issues

**"Cannot connect to Docker daemon"**
```bash
sudo systemctl start docker
sudo usermod -aG docker $USER
# Log out and back in
```

**"Firebase authentication failed"**
```bash
# Test credentials
node -e "require('firebase-admin').initializeApp(); console.log('OK')"
```

**"No leases showing up"**
- Verify NODE_ID matches Firestore document ID
- Check Firestore rules allow reads on `leases` collection
- Ensure node status is "online" in Firestore

**Container fails to start**
```bash
# Check Docker logs
docker logs <container-id>

# Check disk space
df -h

# Check available RAM
free -h
```

### User Issues

**"No nodes available"**
- Wait for providers to join the network
- Check Firestore `nodes` collection for online nodes
- Verify nodes have recent `lastHeartbeat` (< 2 minutes old)

**Instance stuck in "starting"**
- Check provider node logs
- Verify Docker image is valid
- Check Firestore lease document for error messages

---

## 📈 Monitoring & Observability

### Provider Monitoring

**Daemon Logs**:
```bash
# Development
npm run dev

# Production (systemd)
sudo journalctl -u swarm-node -f

# Search for errors
sudo journalctl -u swarm-node | grep -i error
```

**Firestore Console**:
- Check `nodes/{nodeId}` for health metrics
- Monitor `leases` for workload distribution
- Watch `lastHeartbeat` for node liveness

**Docker Monitoring**:
```bash
# Running containers
docker ps

# Resource usage
docker stats

# Container logs
docker logs swarm-agent-{leaseId}
```

### Dashboard Monitoring

Navigate to: **http://localhost:3000/compute**

- View all running instances
- Monitor resource usage
- Check lease status
- View container logs
- Track compute spend

---

## 🚀 Advanced Configuration

### Resource Limits

Edit `.env` to set node-wide limits:

```bash
# Maximum concurrent containers
MAX_CONCURRENT_LEASES=10

# Maximum CPU cores per container
MAX_CPU_CORES=8

# Maximum RAM per container (MB)
MAX_MEMORY_MB=16384

# Maximum disk per container (GB)
MAX_DISK_GB=100
```

### Custom Docker Images

Users can specify any public Docker image:

```javascript
// Example: Python data science environment
const lease = await createLease({
  nodeId: "my-node-1",
  containerImage: "jupyter/scipy-notebook:latest",
  memoryMb: 8192,
  cpuCores: 4,
  env: {
    JUPYTER_ENABLE_LAB: "yes"
  }
});
```

### GPU Support (Future)

For nodes with GPUs:

```bash
# Install nvidia-docker2
# https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html

# Enable GPU passthrough in daemon config
ENABLE_GPU_PASSTHROUGH=true
```

---

## 🎯 Roadmap

### Phase 1: MVP ✅ (Current)
- [x] Node registration and heartbeat
- [x] Lease assignment and container provisioning
- [x] Real-time status updates via Firestore
- [x] Dashboard UI for selecting nodes
- [x] Basic resource limits (CPU, RAM)

### Phase 2: Payments 🚧 (Next)
- [ ] Stripe integration for user payments
- [ ] Provider payouts via crypto/bank transfer
- [ ] Usage metering and billing
- [ ] Reputation system for providers

### Phase 3: Advanced Features 🔮
- [ ] GPU support with nvidia-docker
- [ ] Kubernetes integration for multi-node orchestration
- [ ] Auto-scaling based on demand
- [ ] TEE (Trusted Execution Environment) support
- [ ] Verifiable compute proofs
- [ ] Provider staking and slashing
- [ ] SLA monitoring and enforcement

---

## 📚 API Reference

### Firestore Collections

#### `nodes/{nodeId}`
```typescript
{
  id: string;
  providerAddress: string;
  status: 'online' | 'offline';
  resources: {
    cpuCores: number;
    ramGb: number;
    platform: string;
    gpus: { vendor: string; model: string; vram: number; }[];
  };
  health: {
    cpuLoadPercent: number;
    ramUsedGb: number;
    uptimeSec: number;
  };
  registeredAt: Timestamp;
  lastHeartbeat: Timestamp;
}
```

#### `leases/{leaseId}`
```typescript
{
  id: string;
  nodeId: string;
  orgId: string;
  computerId: string;
  status: 'starting' | 'running' | 'stopping' | 'terminated' | 'error';
  containerImage: string;
  containerId?: string;
  env?: Record<string, string>;
  memoryMb: number;
  cpuCores: number;
  error?: string;
  createdAt: Timestamp;
  startedAt?: Timestamp;
  endedAt?: Timestamp;
}
```

### Daemon API (Internal)

All daemon operations go through Firestore - no HTTP API exposed.

**Register Node**:
```typescript
registerNode(nodeId: string, resources: SystemProperties, providerAddress: string)
```

**Send Heartbeat**:
```typescript
heartbeat(nodeId: string, health: SystemHealth)
```

**Listen for Leases**:
```typescript
listenForLeases(nodeId: string, onLeaseChange: (lease: Lease) => void)
```

**Update Lease Status**:
```typescript
updateLeaseStatus(leaseId: string, status: string, containerId?: string, error?: string)
```

---

## 🤝 Contributing

Want to improve Swarm Node? Here's how:

1. **Run a node** - Help test the network
2. **Report bugs** - Open GitHub issues
3. **Add features** - Submit pull requests
4. **Improve docs** - Help others get started

---

## 📄 License

MIT License - see LICENSE file for details

---

## 🙏 Acknowledgments

Built on top of:
- **Docker** - Container runtime
- **Firebase** - Real-time database and auth
- **systeminformation** - Hardware detection
- **dockerode** - Docker API client

---

**Welcome to the decentralized compute revolution! 🌐⚡**

Questions? Check the [full documentation](./packages/swarm-node/ARCHITECTURE.md) or open an issue on GitHub.
