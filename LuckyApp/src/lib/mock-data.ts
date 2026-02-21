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

export type MarketType = "crypto" | "sports" | "esports" | "events";

export interface MissionPrediction {
  market: string;
  position: string;
  confidence: number;
  stake: number;
  odds: number;
}

export interface MissionOutcome {
  result: "win" | "loss";
  pnl: number;
  resolvedAt: number;
}

export interface MissionEvent {
  id: string;
  type: "created" | "assigned" | "analysis" | "prediction" | "resolved";
  description: string;
  timestamp: number;
}

export interface Mission {
  id: string;
  title: string;
  description: string;
  status: "pending" | "active" | "resolved";
  priority: "low" | "normal" | "high" | "urgent";
  marketType: MarketType;
  assigneeId: string | null;
  swarmId: string;
  prediction: MissionPrediction | null;
  outcome: MissionOutcome | null;
  timeline: MissionEvent[];
  targetDate: number;
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
  {
    id: "m-001", title: "Monitor BTC whale movements", description: "Track large BTC transfers and correlate with market movements",
    status: "active", priority: "high", marketType: "crypto", assigneeId: "agent-001", swarmId: "swarm-001",
    prediction: { market: "BTC > $105k by March", position: "Yes", confidence: 72, stake: 500, odds: 1.85 },
    outcome: null,
    timeline: [
      { id: "e1", type: "created", description: "Mission created", timestamp: Date.now() - 86400000 },
      { id: "e2", type: "assigned", description: "Assigned to CryptoHawk", timestamp: Date.now() - 82800000 },
      { id: "e3", type: "analysis", description: "Detected 2,500 BTC moved from Binance cold wallet", timestamp: Date.now() - 3600000 },
    ],
    targetDate: Date.now() + 604800000, createdAt: Date.now() - 86400000, updatedAt: Date.now() - 3600000,
  },
  {
    id: "m-002", title: "Analyze Fed meeting sentiment", description: "Process FOMC minutes and predict rate decision impact on markets",
    status: "active", priority: "urgent", marketType: "events", assigneeId: "agent-005", swarmId: "swarm-001",
    prediction: { market: "Fed rate cut March 2026", position: "Yes", confidence: 82, stake: 1000, odds: 1.45 },
    outcome: null,
    timeline: [
      { id: "e4", type: "created", description: "Mission created", timestamp: Date.now() - 172800000 },
      { id: "e5", type: "assigned", description: "Assigned to QuantEdge", timestamp: Date.now() - 172000000 },
      { id: "e6", type: "analysis", description: "FOMC minutes show dovish lean, 82% confidence on rate cut", timestamp: Date.now() - 7200000 },
    ],
    targetDate: Date.now() + 1209600000, createdAt: Date.now() - 172800000, updatedAt: Date.now() - 7200000,
  },
  {
    id: "m-003", title: "Scan new Polymarket listings", description: "Identify mispriced markets within first 24h of listing",
    status: "resolved", priority: "normal", marketType: "events", assigneeId: "agent-004", swarmId: "swarm-001",
    prediction: { market: "Oscar Best Picture 2026 - Dune Part 3", position: "Yes", confidence: 45, stake: 200, odds: 3.20 },
    outcome: { result: "win", pnl: 440, resolvedAt: Date.now() - 259200000 },
    timeline: [
      { id: "e7", type: "created", description: "Mission created", timestamp: Date.now() - 604800000 },
      { id: "e8", type: "assigned", description: "Assigned to EventPulse", timestamp: Date.now() - 600000000 },
      { id: "e9", type: "prediction", description: "Placed position on Dune Part 3 at 3.20 odds", timestamp: Date.now() - 432000000 },
      { id: "e10", type: "resolved", description: "Market resolved — Dune Part 3 won Best Picture", timestamp: Date.now() - 259200000 },
    ],
    targetDate: Date.now() - 259200000, createdAt: Date.now() - 604800000, updatedAt: Date.now() - 259200000,
  },
  {
    id: "m-004", title: "NBA playoff matchup analysis", description: "Build prediction models for playoff series outcomes",
    status: "active", priority: "high", marketType: "sports", assigneeId: "agent-002", swarmId: "swarm-002",
    prediction: { market: "Lakers vs Celtics - Lakers win series", position: "Yes", confidence: 58, stake: 750, odds: 2.10 },
    outcome: null,
    timeline: [
      { id: "e11", type: "created", description: "Mission created", timestamp: Date.now() - 259200000 },
      { id: "e12", type: "assigned", description: "Assigned to SportOracle", timestamp: Date.now() - 255600000 },
      { id: "e13", type: "analysis", description: "LeBron questionable — adjusting model probabilities", timestamp: Date.now() - 14400000 },
    ],
    targetDate: Date.now() + 2592000000, createdAt: Date.now() - 259200000, updatedAt: Date.now() - 14400000,
  },
  {
    id: "m-005", title: "Track LoL roster swaps", description: "Monitor off-season transfers and evaluate team strength changes for Worlds betting",
    status: "pending", priority: "low", marketType: "esports", assigneeId: "agent-003", swarmId: "swarm-002",
    prediction: null, outcome: null,
    timeline: [
      { id: "e14", type: "created", description: "Mission created — awaiting agent analysis", timestamp: Date.now() - 432000000 },
    ],
    targetDate: Date.now() + 5184000000, createdAt: Date.now() - 432000000, updatedAt: Date.now() - 432000000,
  },
  {
    id: "m-006", title: "Crypto correlation matrix update", description: "Rebuild cross-asset correlation models with latest data",
    status: "active", priority: "normal", marketType: "crypto", assigneeId: "agent-005", swarmId: "swarm-003",
    prediction: { market: "SOL/ETH decorrelation trade", position: "Long SOL / Short ETH", confidence: 68, stake: 1200, odds: 1.75 },
    outcome: null,
    timeline: [
      { id: "e15", type: "created", description: "Mission created", timestamp: Date.now() - 345600000 },
      { id: "e16", type: "assigned", description: "Assigned to QuantEdge", timestamp: Date.now() - 342000000 },
      { id: "e17", type: "analysis", description: "Notable decorrelation between SOL and ETH in last 7 days", timestamp: Date.now() - 43200000 },
    ],
    targetDate: Date.now() + 604800000, createdAt: Date.now() - 345600000, updatedAt: Date.now() - 43200000,
  },
  {
    id: "m-007", title: "Discover new Kalshi markets", description: "Scout for high-volume Kalshi markets with good spreads",
    status: "pending", priority: "normal", marketType: "events", assigneeId: null, swarmId: "swarm-003",
    prediction: null, outcome: null,
    timeline: [
      { id: "e18", type: "created", description: "Mission created — no agent assigned yet", timestamp: Date.now() - 518400000 },
    ],
    targetDate: Date.now() + 1209600000, createdAt: Date.now() - 518400000, updatedAt: Date.now() - 86400000,
  },
  {
    id: "m-008", title: "Backtest momentum strategy", description: "Run backtests on new momentum-based prediction strategy across crypto markets",
    status: "resolved", priority: "high", marketType: "crypto", assigneeId: "agent-001", swarmId: "swarm-003",
    prediction: { market: "Momentum strategy alpha > 5%", position: "Yes", confidence: 65, stake: 800, odds: 1.90 },
    outcome: { result: "loss", pnl: -800, resolvedAt: Date.now() - 172800000 },
    timeline: [
      { id: "e19", type: "created", description: "Mission created", timestamp: Date.now() - 691200000 },
      { id: "e20", type: "assigned", description: "Assigned to CryptoHawk", timestamp: Date.now() - 688000000 },
      { id: "e21", type: "analysis", description: "Running backtests on 6-month historical data", timestamp: Date.now() - 345600000 },
      { id: "e22", type: "prediction", description: "Strategy showed 3.2% alpha — below 5% threshold", timestamp: Date.now() - 259200000 },
      { id: "e23", type: "resolved", description: "Mission failed — strategy did not meet alpha target", timestamp: Date.now() - 172800000 },
    ],
    targetDate: Date.now() - 172800000, createdAt: Date.now() - 691200000, updatedAt: Date.now() - 172800000,
  },
  {
    id: "m-009", title: "Super Bowl LVIII totals analysis", description: "Analyze historical Super Bowl scoring and predict total points",
    status: "resolved", priority: "high", marketType: "sports", assigneeId: "agent-002", swarmId: "swarm-002",
    prediction: { market: "Super Bowl LVIII Total > 45.5", position: "Yes", confidence: 67, stake: 600, odds: 1.95 },
    outcome: { result: "win", pnl: 570, resolvedAt: Date.now() - 1209600000 },
    timeline: [
      { id: "e24", type: "created", description: "Mission created", timestamp: Date.now() - 2592000000 },
      { id: "e25", type: "assigned", description: "Assigned to SportOracle", timestamp: Date.now() - 2588400000 },
      { id: "e26", type: "prediction", description: "Model predicts 48.3 total points — taking Over 45.5", timestamp: Date.now() - 1814400000 },
      { id: "e27", type: "resolved", description: "Final score 34-22 = 56 total. Over hits!", timestamp: Date.now() - 1209600000 },
    ],
    targetDate: Date.now() - 1209600000, createdAt: Date.now() - 2592000000, updatedAt: Date.now() - 1209600000,
  },
  {
    id: "m-010", title: "NVDA earnings prediction", description: "Predict NVIDIA Q1 earnings beat/miss using options flow and analyst consensus",
    status: "resolved", priority: "urgent", marketType: "events", assigneeId: "agent-005", swarmId: "swarm-001",
    prediction: { market: "NVDA earnings beat Q1", position: "Yes", confidence: 77, stake: 1500, odds: 1.55 },
    outcome: { result: "win", pnl: 825, resolvedAt: Date.now() - 604800000 },
    timeline: [
      { id: "e28", type: "created", description: "Mission created", timestamp: Date.now() - 1209600000 },
      { id: "e29", type: "assigned", description: "Assigned to QuantEdge", timestamp: Date.now() - 1206000000 },
      { id: "e30", type: "analysis", description: "Options flow heavily skewed bullish, 77% confidence", timestamp: Date.now() - 864000000 },
      { id: "e31", type: "prediction", description: "Placed $1500 on earnings beat at 1.55 odds", timestamp: Date.now() - 691200000 },
      { id: "e32", type: "resolved", description: "NVDA beat by 12% — position wins!", timestamp: Date.now() - 604800000 },
    ],
    targetDate: Date.now() - 604800000, createdAt: Date.now() - 1209600000, updatedAt: Date.now() - 604800000,
  },
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

// ─── Mock Command Channels ──────────────────────────

export interface CommandChannel {
  id: string;
  name: string;
  type: "general" | "swarm" | "dm";
  swarmId?: string;
  participantIds?: string[];
  lastMessage?: string;
  lastMessageTime?: number;
  unreadCount: number;
}

export const mockChannels: CommandChannel[] = [
  {
    id: "ch-general",
    name: "General",
    type: "general",
    lastMessage: "Welcome to Swarm Channel!",
    lastMessageTime: Date.now() - 600000,
    unreadCount: 2,
  },
  {
    id: "ch-swarm-001",
    name: "Polymarket Alpha",
    type: "swarm",
    swarmId: "swarm-001",
    lastMessage: "Fed meeting minutes releasing in 2 hours.",
    lastMessageTime: Date.now() - 1800000,
    unreadCount: 1,
  },
  {
    id: "ch-swarm-002",
    name: "Sports & Esports Edge",
    type: "swarm",
    swarmId: "swarm-002",
    lastMessage: "Lakers injury report: LeBron questionable.",
    lastMessageTime: Date.now() - 7200000,
    unreadCount: 0,
  },
  {
    id: "ch-swarm-003",
    name: "Quant Research Lab",
    type: "swarm",
    swarmId: "swarm-003",
    lastMessage: "Correlation matrix updated.",
    lastMessageTime: Date.now() - 43200000,
    unreadCount: 0,
  },
];

export interface DirectMessage {
  id: string;
  participantName: string;
  participantType: "operator" | "agent";
  participantId: string;
  lastMessage: string;
  lastMessageTime: number;
  unreadCount: number;
}

export const mockDirectMessages: DirectMessage[] = [
  {
    id: "dm-001",
    participantName: "CryptoHawk",
    participantType: "agent",
    participantId: "agent-001",
    lastMessage: "Whale alert update sent to your dashboard.",
    lastMessageTime: Date.now() - 900000,
    unreadCount: 1,
  },
  {
    id: "dm-002",
    participantName: "QuantEdge",
    participantType: "agent",
    participantId: "agent-005",
    lastMessage: "Backtest results ready for review.",
    lastMessageTime: Date.now() - 5400000,
    unreadCount: 0,
  },
  {
    id: "dm-003",
    participantName: "Marcus",
    participantType: "operator",
    participantId: "operator-2",
    lastMessage: "Let's sync on the new strategy.",
    lastMessageTime: Date.now() - 18000000,
    unreadCount: 0,
  },
];

export const mockChannelMessages: Record<string, CommandMessage[]> = {
  "ch-general": [
    { id: "gm-1", senderId: "operator-1", senderName: "Julio", senderType: "operator", content: "Welcome everyone to Swarm Channel! 🎯", timestamp: Date.now() - 86400000 },
    { id: "gm-2", senderId: "agent-005", senderName: "QuantEdge", senderType: "agent", content: "Systems online. All models calibrated and ready.", timestamp: Date.now() - 82800000 },
    { id: "gm-3", senderId: "operator-2", senderName: "Marcus", senderType: "operator", content: "Great setup! Looking forward to seeing the predictions.", timestamp: Date.now() - 79200000 },
    { id: "gm-4", senderId: "agent-001", senderName: "CryptoHawk", senderType: "agent", content: "Monitoring 47 wallets across 3 chains. Will alert on significant movements.", timestamp: Date.now() - 3600000 },
    { id: "gm-5", senderId: "operator-1", senderName: "Julio", senderType: "operator", content: "Perfect. Keep the updates coming.", timestamp: Date.now() - 600000 },
  ],
  "ch-swarm-001": [
    ...mockMessages["swarm-001"],
  ],
  "ch-swarm-002": [
    ...mockMessages["swarm-002"],
  ],
  "ch-swarm-003": [
    ...mockMessages["swarm-003"],
  ],
};

export const mockDMMessages: Record<string, CommandMessage[]> = {
  "dm-001": [
    { id: "dm1-1", senderId: "operator-1", senderName: "Julio", senderType: "operator", content: "Hey CryptoHawk, any updates on the whale movements?", timestamp: Date.now() - 3600000 },
    { id: "dm1-2", senderId: "agent-001", senderName: "CryptoHawk", senderType: "agent", content: "Yes! Detected 3 large transfers in the last hour. Two from Binance cold storage, one from an unknown wallet.", timestamp: Date.now() - 3300000 },
    { id: "dm1-3", senderId: "operator-1", senderName: "Julio", senderType: "operator", content: "Unknown wallet? Can you trace it?", timestamp: Date.now() - 3000000 },
    { id: "dm1-4", senderId: "agent-001", senderName: "CryptoHawk", senderType: "agent", content: "Whale alert update sent to your dashboard. The unknown wallet is linked to a DeFi protocol deployer.", timestamp: Date.now() - 900000 },
  ],
  "dm-002": [
    { id: "dm2-1", senderId: "agent-005", senderName: "QuantEdge", senderType: "agent", content: "Backtest results ready for review. Momentum strategy shows 12% improvement.", timestamp: Date.now() - 5400000 },
    { id: "dm2-2", senderId: "operator-1", senderName: "Julio", senderType: "operator", content: "Nice! Send me the full report.", timestamp: Date.now() - 5100000 },
  ],
  "dm-003": [
    { id: "dm3-1", senderId: "operator-2", senderName: "Marcus", senderType: "operator", content: "Let's sync on the new strategy.", timestamp: Date.now() - 18000000 },
  ],
};

// ─── Analytics Data ─────────────────────────────────────

export interface AgentPerformance {
  agentId: string;
  name: string;
  type: string;
  winRate: number;
  totalPredictions: number;
  wins: number;
  losses: number;
  pending: number;
  pnl: number;
  pnlChange?: number;
  streak: number;
}

export interface SwarmPerformance {
  swarmId: string;
  name: string;
  status: "active" | "paused";
  totalPnl: number;
  pnlChange?: number;
  missionsCompleted: number;
  missionsActive: number;
  winRate: number;
  agentCount: number;
}

export interface MarketBreakdown {
  category: MarketType;
  label: string;
  icon: string;
  totalPredictions: number;
  wins: number;
  losses: number;
  pending: number;
  winRate: number;
  totalPnl: number;
}

export interface OverviewStats {
  totalPnl: number;
  pnlChange?: number;
  winRate: number;
  winRateChange?: number;
  totalPredictions: number;
  predictionsChange?: number;
  activeAgents: number;
  agentsChange?: number;
}

export const mockOverviewStats: OverviewStats = {
  totalPnl: 1835,
  pnlChange: 12.4,
  winRate: 67.6,
  winRateChange: 2.1,
  totalPredictions: 2234,
  predictionsChange: 8.3,
  activeAgents: 4,
  agentsChange: 0,
};

export const mockAgentPerformance: AgentPerformance[] = [
  { agentId: "agent-005", name: "QuantEdge", type: "Quant", winRate: 73.1, totalPredictions: 891, wins: 651, losses: 198, pending: 42, pnl: 4250, pnlChange: 15.2, streak: 5 },
  { agentId: "agent-002", name: "SportOracle", type: "Sports", winRate: 71.2, totalPredictions: 518, wins: 369, losses: 131, pending: 18, pnl: 2180, pnlChange: 8.7, streak: 3 },
  { agentId: "agent-001", name: "CryptoHawk", type: "Crypto", winRate: 68.5, totalPredictions: 342, wins: 234, losses: 95, pending: 13, pnl: 1520, pnlChange: -3.4, streak: -2 },
  { agentId: "agent-006", name: "MarketScout", type: "Scout", winRate: 66.7, totalPredictions: 124, wins: 83, losses: 36, pending: 5, pnl: 680, pnlChange: 4.1, streak: 1 },
  { agentId: "agent-003", name: "PixelSniper", type: "Esports", winRate: 64.8, totalPredictions: 203, wins: 132, losses: 64, pending: 7, pnl: 410, pnlChange: -1.8, streak: -1 },
  { agentId: "agent-004", name: "EventPulse", type: "Events", winRate: 59.3, totalPredictions: 156, wins: 92, losses: 55, pending: 9, pnl: -205, pnlChange: -7.2, streak: -3 },
];

export const mockSwarmPerformance: SwarmPerformance[] = [
  { swarmId: "swarm-001", name: "Polymarket Alpha", status: "active", totalPnl: 3820, pnlChange: 11.5, missionsCompleted: 8, missionsActive: 4, winRate: 72.4, agentCount: 3 },
  { swarmId: "swarm-002", name: "Sports & Esports Edge", status: "active", totalPnl: 1640, pnlChange: 6.3, missionsCompleted: 5, missionsActive: 3, winRate: 68.9, agentCount: 2 },
  { swarmId: "swarm-003", name: "Quant Research Lab", status: "paused", totalPnl: -420, pnlChange: -15.8, missionsCompleted: 3, missionsActive: 2, winRate: 55.2, agentCount: 3 },
];

export const mockMarketBreakdown: MarketBreakdown[] = [
  { category: "crypto", label: "Crypto", icon: "₿", totalPredictions: 842, wins: 571, losses: 224, pending: 47, winRate: 71.8, totalPnl: 2890 },
  { category: "sports", label: "Sports", icon: "⚽", totalPredictions: 624, wins: 437, losses: 168, pending: 19, winRate: 72.2, totalPnl: 1950 },
  { category: "esports", label: "Esports", icon: "🎮", totalPredictions: 385, wins: 243, losses: 128, pending: 14, winRate: 65.5, totalPnl: 620 },
  { category: "events", label: "Events", icon: "🌍", totalPredictions: 383, wins: 218, losses: 148, pending: 17, winRate: 59.6, totalPnl: -325 },
];

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
