# 🎰 LuckySt — Swarm Mission Control for Prediction Markets

> **Command your fleet of AI agents. Deploy swarms to dominate prediction markets.**

[![Live Demo](https://img.shields.io/badge/demo-luckyst.netlify.app-blue)](https://luckyst.netlify.app)
[![Built at ETH Denver](https://img.shields.io/badge/Built%20at-ETH%20Denver%202026-purple)](https://ethdenver.com)

## What is LuckySt?

LuckySt is a **swarm mission control center** for deploying and managing fleets of AI agents across prediction markets. Think of it as your command bridge — monitor agent performance, deploy new swarms, and coordinate strategy across multiple chains in real time.

Built for degens who think in probabilities and builders who think in swarms.

## Features

- 🧠 **Swarm Deployment** — Launch coordinated AI agent swarms targeting prediction markets
- 📊 **Mission Control Dashboard** — Real-time monitoring of agent performance and market positions
- 🔗 **Multi-Chain Support** — Deploy across Base and Hedera from a single interface
- 🎯 **Strategy Engine** — Configure agent behavior, risk parameters, and market selection criteria
- 👛 **Wallet Connect** — Seamless onboarding via RainbowKit + wagmi
- 🔥 **Live Sync** — Firebase Firestore for real-time state across all connected agents
- 🤖 **OpenClaw Integration** — AI-powered agent orchestration and swarm intelligence

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 |
| UI | React 19 + Tailwind v4 + shadcn/ui |
| Wallet | RainbowKit + wagmi |
| Database | Firebase Firestore |
| AI Orchestration | OpenClaw |
| Chains | Base, Hedera |

## Getting Started

```bash
# Clone the repo
git clone https://github.com/PerkOS-xyz/LuckySt.git
cd LuckySt

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Fill in your API keys and Firebase config

# Run the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to launch mission control.

## Architecture

```
┌─────────────────────────────────┐
│        Mission Control UI       │
│   (Next.js 16 + React 19)      │
├─────────────────────────────────┤
│      Swarm Orchestration        │
│         (OpenClaw)              │
├──────────┬──────────────────────┤
│  Base    │      Hedera          │
│  Chain   │      Chain           │
├──────────┴──────────────────────┤
│     Firebase Firestore          │
│   (Real-time Agent State)       │
└─────────────────────────────────┘
```

## Supported Chains

| Chain | Status |
|-------|--------|
| **Base** | ✅ Live |
| **Hedera** | ✅ Live |

## Team

Built at **ETH Denver 2026** by [PerkOS](https://github.com/PerkOS-xyz).

## License

MIT
