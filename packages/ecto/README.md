# @swarm/ecto

Persistent, isolated AI agent runtime for the Swarm network. Each agent ("ecto") runs in its own Docker container with a git-backed persistent workspace ("vault"), two-layer memory system, self-evolution capabilities, and proactive behavior via nudge events.

## Architecture

```
CLI / API / SwarmApp
      │
  Orchestrator ── manages Docker containers, state, ports
      │
  Ecto Server ── runs INSIDE each container
      │
      ├── Memory Manager ── warm (MEMORY.md/USER.md) + deep (vault search)
      ├── NudgeRegistry ── proactive behavior events
      ├── Memory Observer ── auto-extracts facts before compaction
      └── Extensions ── agent-written tools (self-evolution)
```

## Features

### Two-Layer Memory
- **Warm memory** (`MEMORY.md` + `USER.md`): Injected into the system prompt. Character-limited (4K/2K). Agent manages via built-in tools.
- **Deep memory** (vault files): `knowledge/`, `code/`, extensions. Searchable via ripgrep.
- **Memory observer**: Secondary LLM call that auto-extracts facts before context compaction.
- **Pre-compaction flush**: Agent gets one turn to save important context before history compression.

### NudgeRegistry (Proactive Behavior)
Event bus that triggers agent behavior on:
- `message-complete` — after each response
- `pre-compact` — before context compaction (critical, always blocks)
- `pre-new-session` — before session switch (critical)
- `idle` — after configurable idle timeout
- `timer` — periodic heartbeat
- `session-start` — on new session

Handlers can be gated by minimum message count or time interval.

### Self-Evolution
Agents write TypeScript extensions to `.ecto/extensions/` in their vault. Extensions are loaded as tools on reload. Agents can also edit their own `CLAUDE.md` instructions.

### Docker Isolation
Each ecto runs in its own container with:
- 1GB memory limit, 512 CPU shares
- Vault mounted at `/vault` (persistent across restarts)
- 10 ports allocated per ecto (1 server + 8 user ports)
- Health checks, graceful shutdown, rolling upgrades

### Git-Backed Vault
All agent state is version-controlled:
- Auto-commit on kill/save
- Push/pull to GitHub for backup
- Merge vaults between ectos
- Per-ecto branches (`ecto/<name>`)

### Cron Scheduler
In-process cron with 5-field expressions, timezone support, and auto-wake of stopped ectos.

## Quick Start

```bash
# Build
cd packages/ecto
npm install
npm run build

# Build Docker image
docker build -t ecto-agent:latest ./docker

# Spawn an ecto
ecto spawn atlas --model claude-sonnet-4-6

# Talk to it
ecto talk atlas "What can you help me with?"

# List ectos
ecto list

# Start API server
ecto serve --port 8008
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/ectos` | List all ectos |
| POST | `/api/ectos` | Spawn a new ecto |
| GET | `/api/ectos/:name` | Get ecto details |
| DELETE | `/api/ectos/:name` | Remove ecto |
| POST | `/api/ectos/:name/message` | Send message (SSE stream) |
| POST | `/api/ectos/:name/kill` | Stop ecto |
| POST | `/api/ectos/:name/wake` | Restart ecto |
| POST | `/api/ectos/:name/save` | Commit vault |
| POST | `/api/ectos/:name/nudge` | Send nudge event |
| POST | `/api/ectos/:name/compact` | Trigger compaction |
| GET | `/api/ectos/:name/stats` | Ecto statistics |
| GET | `/api/ectos/:name/vault` | List vault files |
| GET/POST/DELETE | `/api/ectos/:name/vault/*` | Vault file CRUD |
| GET/POST/DELETE | `/api/ectos/:name/schedules` | Cron schedules |
| GET/PATCH | `/api/config` | Global configuration |

## SwarmApp Integration

The ecto routes are available in SwarmApp at `/api/v1/ectos/*` — they proxy to the Ecto API server. Set `ECTO_API_URL` in your environment.

### SwarmApp Proxy Routes

| Method | SwarmApp Endpoint | Proxies To |
|--------|-------------------|------------|
| GET | `/api/v1/ectos` | `GET /api/ectos` |
| POST | `/api/v1/ectos` | `POST /api/ectos` |
| GET | `/api/v1/ectos/:name` | `GET /api/ectos/:name` |
| DELETE | `/api/v1/ectos/:name` | `DELETE /api/ectos/:name` |
| POST | `/api/v1/ectos/:name/message` | `POST /api/ectos/:name/message` (SSE) |
| POST | `/api/v1/ectos/:name/lifecycle` | `POST /api/ectos/:name/kill`, `/wake`, `/save`, `/compact` |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ECTO_DATA_DIR` | `~/.ecto` | State and vault storage |
| `ECTO_LOG_LEVEL` | `info` | Logging level |
| `ECTO_API_PORT` | `8008` | API server port |
| `ANTHROPIC_API_KEY` | — | Anthropic API key for ectos |
| `OPENAI_API_KEY` | — | OpenAI API key for ectos |
