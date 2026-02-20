// Mock data for Swarms, Agents, and Missions

export type AgentType = "Crypto" | "Sports" | "Esports" | "Events" | "Quant" | "Scout";

export interface Agent {
  id: string;
  name: string;
  type: AgentType;
  description: string;
  capabilities: string[];
  status: "online" | "offline";
  winRate: number;
  totalPredictions: number;
  swarmIds: string[];
  recentPredictions: Prediction[];
}

export interface Prediction {
  id: string;
  market: string;
  position: string;
  confidence: number;
  outcome: "win" | "loss" | "pending";
  timestamp: number;
}

export interface Mission {
  id: string;
  title: string;
  description: string;
  status: "backlog" | "active" | "completed" | "failed";
  priority: "low" | "normal" | "high" | "urgent";
  assigneeId: string | null;
  swarmId: string;
  createdAt: number;
  updatedAt: number;
}

export interface CommandMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderType: "agent" | "operator";
  content: string;
  timestamp: number;
}

export interface Swarm {
  id: string;
  name: string;
  description: string;
  status: "active" | "paused";
  agentIds: string[];
  missionIds: string[];
  createdAt: number;
}

// ─── Mock Agents ────────────────────────────────────────
export const mockAgents: Agent[] = [
  {
    id: "agent-001",
    name: "CryptoHawk",
    type: "Crypto",
    description: "Specializes in cryptocurrency market predictions using on-chain analytics and sentiment analysis.",
    capabilities: ["on-chain-analysis", "sentiment-tracking", "price-prediction", "whale-watching"],
    status: "online",
    winRate: 68.5,
    totalPredictions: 342,
    swarmIds: ["swarm-001", "swarm-003"],
    recentPredictions: [
      { id: "p1", market: "BTC > $100k by March", position: "Yes", confidence: 72, outcome: "pending", timestamp: Date.now() - 3600000 },
      { id: "p2", market: "ETH/BTC ratio > 0.05", position: "No", confidence: 85, outcome: "win", timestamp: Date.now() - 86400000 },
      { id: "p3", market: "SOL flips BNB market cap", position: "Yes", confidence: 61, outcome: "loss", timestamp: Date.now() - 172800000 },
    ],
  },
  {
    id: "agent-002",
    name: "SportOracle",
    type: "Sports",
    description: "Analyzes sports statistics and historical matchup data for accurate game predictions.",
    capabilities: ["stats-analysis", "injury-tracking", "matchup-modeling", "live-odds"],
    status: "online",
    winRate: 71.2,
    totalPredictions: 518,
    swarmIds: ["swarm-002"],
    recentPredictions: [
      { id: "p4", market: "Lakers vs Celtics - Lakers win", position: "Yes", confidence: 58, outcome: "pending", timestamp: Date.now() - 7200000 },
      { id: "p5", market: "Super Bowl LVIII Total > 45.5", position: "Yes", confidence: 67, outcome: "win", timestamp: Date.now() - 259200000 },
    ],
  },
  {
    id: "agent-003",
    name: "PixelSniper",
    type: "Esports",
    description: "Tracks esports tournaments, team rosters, and meta shifts for competitive gaming predictions.",
    capabilities: ["tournament-tracking", "meta-analysis", "roster-changes", "map-statistics"],
    status: "offline",
    winRate: 64.8,
    totalPredictions: 203,
    swarmIds: ["swarm-002"],
    recentPredictions: [
      { id: "p6", market: "T1 wins Worlds 2025", position: "Yes", confidence: 74, outcome: "win", timestamp: Date.now() - 432000000 },
    ],
  },
  {
    id: "agent-004",
    name: "EventPulse",
    type: "Events",
    description: "Monitors global events, elections, and cultural moments for prediction market opportunities.",
    capabilities: ["news-monitoring", "polling-analysis", "geopolitical-tracking", "trend-detection"],
    status: "online",
    winRate: 59.3,
    totalPredictions: 156,
    swarmIds: ["swarm-001"],
    recentPredictions: [
      { id: "p7", market: "Oscar Best Picture 2026", position: "Dune Part 3", confidence: 45, outcome: "pending", timestamp: Date.now() - 14400000 },
    ],
  },
  {
    id: "agent-005",
    name: "QuantEdge",
    type: "Quant",
    description: "Uses quantitative models, statistical arbitrage, and ML pipelines for market edge detection.",
    capabilities: ["statistical-modeling", "arbitrage-detection", "ml-inference", "risk-management"],
    status: "online",
    winRate: 73.1,
    totalPredictions: 891,
    swarmIds: ["swarm-001", "swarm-003"],
    recentPredictions: [
      { id: "p8", market: "Fed rate cut March 2026", position: "Yes", confidence: 82, outcome: "pending", timestamp: Date.now() - 1800000 },
      { id: "p9", market: "NVDA earnings beat Q1", position: "Yes", confidence: 77, outcome: "win", timestamp: Date.now() - 604800000 },
    ],
  },
  {
    id: "agent-006",
    name: "MarketScout",
    type: "Scout",
    description: "Discovers new prediction markets, evaluates liquidity, and identifies mispriced opportunities.",
    capabilities: ["market-discovery", "liquidity-analysis", "odds-comparison", "opportunity-scoring"],
    status: "offline",
    winRate: 66.7,
    totalPredictions: 124,
    swarmIds: ["swarm-003"],
    recentPredictions: [
      { id: "p10", market: "New Polymarket listing volume > $1M", position: "Yes", confidence: 69, outcome: "win", timestamp: Date.now() - 345600000 },
    ],
  },
];

// ─── Mock Missions ──────────────────────────────────────
export const mockMissions: Mission[] = [
  { id: "m-001", title: "Monitor BTC whale movements", description: "Track large BTC transfers and correlate with market movements", status: "active", priority: "high", assigneeId: "agent-001", swarmId: "swarm-001", createdAt: Date.now() - 86400000, updatedAt: Date.now() - 3600000 },
  { id: "m-002", title: "Analyze Fed meeting sentiment", description: "Process FOMC minutes and predict rate decision impact", status: "active", priority: "urgent", assigneeId: "agent-005", swarmId: "swarm-001", createdAt: Date.now() - 172800000, updatedAt: Date.now() - 7200000 },
  { id: "m-003", title: "Scan new Polymarket listings", description: "Identify mispriced markets within first 24h of listing", status: "completed", priority: "normal", assigneeId: "agent-004", swarmId: "swarm-001", createdAt: Date.now() - 604800000, updatedAt: Date.now() - 259200000 },
  { id: "m-004", title: "NBA playoff matchup analysis", description: "Build prediction models for playoff series outcomes", status: "active", priority: "high", assigneeId: "agent-002", swarmId: "swarm-002", createdAt: Date.now() - 259200000, updatedAt: Date.now() - 14400000 },
  { id: "m-005", title: "Track LoL roster swaps", description: "Monitor off-season transfers and evaluate team strength changes", status: "backlog", priority: "low", assigneeId: "agent-003", swarmId: "swarm-002", createdAt: Date.now() - 432000000, updatedAt: Date.now() - 432000000 },
  { id: "m-006", title: "Crypto correlation matrix update", description: "Rebuild cross-asset correlation models with latest data", status: "active", priority: "normal", assigneeId: "agent-005", swarmId: "swarm-003", createdAt: Date.now() - 345600000, updatedAt: Date.now() - 43200000 },
  { id: "m-007", title: "Discover new Kalshi markets", description: "Scout for high-volume Kalshi markets with good spreads", status: "active", priority: "normal", assigneeId: "agent-006", swarmId: "swarm-003", createdAt: Date.now() - 518400000, updatedAt: Date.now() - 86400000 },
  { id: "m-008", title: "Backtest momentum strategy", description: "Run backtests on new momentum-based prediction strategy", status: "failed", priority: "high", assigneeId: "agent-001", swarmId: "swarm-003", createdAt: Date.now() - 691200000, updatedAt: Date.now() - 172800000 },
];

// ─── Mock Swarms ────────────────────────────────────────
export const mockSwarms: Swarm[] = [
  {
    id: "swarm-001",
    name: "Polymarket Alpha",
    description: "Primary swarm targeting Polymarket opportunities across crypto, politics, and events.",
    status: "active",
    agentIds: ["agent-001", "agent-004", "agent-005"],
    missionIds: ["m-001", "m-002", "m-003"],
    createdAt: Date.now() - 2592000000,
  },
  {
    id: "swarm-002",
    name: "Sports & Esports Edge",
    description: "Focused on sports and esports prediction markets with statistical modeling.",
    status: "active",
    agentIds: ["agent-002", "agent-003"],
    missionIds: ["m-004", "m-005"],
    createdAt: Date.now() - 1728000000,
  },
  {
    id: "swarm-003",
    name: "Quant Research Lab",
    description: "Experimental swarm for testing new quantitative strategies and market discovery.",
    status: "paused",
    agentIds: ["agent-001", "agent-005", "agent-006"],
    missionIds: ["m-006", "m-007", "m-008"],
    createdAt: Date.now() - 864000000,
  },
];

// ─── Mock Command Channel Messages ─────────────────────
export const mockMessages: Record<string, CommandMessage[]> = {
  "swarm-001": [
    { id: "msg-1", senderId: "agent-001", senderName: "CryptoHawk", senderType: "agent", content: "Detected large BTC transfer: 2,500 BTC moved from Binance cold wallet. Monitoring for market impact.", timestamp: Date.now() - 3600000 },
    { id: "msg-2", senderId: "operator-1", senderName: "Julio", senderType: "operator", content: "Good catch. What's the current sentiment on CT?", timestamp: Date.now() - 3000000 },
    { id: "msg-3", senderId: "agent-005", senderName: "QuantEdge", senderType: "agent", content: "Sentiment analysis shows 67% bullish. Correlation model suggests 72% probability of upward movement in next 4h.", timestamp: Date.now() - 2400000 },
    { id: "msg-4", senderId: "agent-004", senderName: "EventPulse", senderType: "agent", content: "Fed meeting minutes releasing in 2 hours. Recommend holding new positions until after release.", timestamp: Date.now() - 1800000 },
  ],
  "swarm-002": [
    { id: "msg-5", senderId: "agent-002", senderName: "SportOracle", senderType: "agent", content: "Lakers injury report: LeBron questionable for tonight. Adjusting model probabilities.", timestamp: Date.now() - 7200000 },
    { id: "msg-6", senderId: "agent-003", senderName: "PixelSniper", senderType: "agent", content: "T1 confirmed roster for Spring Split. No changes from Worlds lineup.", timestamp: Date.now() - 43200000 },
  ],
  "swarm-003": [
    { id: "msg-7", senderId: "agent-006", senderName: "MarketScout", senderType: "agent", content: "Found 3 new Kalshi markets with >$500k volume and wide spreads. Sending analysis.", timestamp: Date.now() - 86400000 },
    { id: "msg-8", senderId: "agent-005", senderName: "QuantEdge", senderType: "agent", content: "Correlation matrix updated. Notable decorrelation between SOL and ETH in last 7 days.", timestamp: Date.now() - 43200000 },
  ],
};

// ─── Helper functions ───────────────────────────────────
export function getSwarmAgents(swarmId: string): Agent[] {
  const swarm = mockSwarms.find(s => s.id === swarmId);
  if (!swarm) return [];
  return mockAgents.filter(a => swarm.agentIds.includes(a.id));
}

export function getSwarmMissions(swarmId: string): Mission[] {
  return mockMissions.filter(m => m.swarmId === swarmId);
}

export function getAgentSwarms(agentId: string): Swarm[] {
  return mockSwarms.filter(s => s.agentIds.includes(agentId));
}

export function getAgentById(agentId: string): Agent | undefined {
  return mockAgents.find(a => a.id === agentId);
}

export function getSwarmById(swarmId: string): Swarm | undefined {
  return mockSwarms.find(s => s.id === swarmId);
}
