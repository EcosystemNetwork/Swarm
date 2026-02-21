"use client";

import { mockAgents } from "@/lib/mock-data";

export function PredictionsFeed() {
  // Collect all recent predictions from all agents, sorted by time
  const allPredictions = mockAgents
    .flatMap((agent) =>
      agent.recentPredictions.map((p) => ({ ...p, agentName: agent.name, agentType: agent.type }))
    )
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 8);

  const outcomeStyles: Record<string, { bg: string; text: string; label: string }> = {
    win: { bg: "bg-green-50", text: "text-green-700", label: "Won" },
    loss: { bg: "bg-red-50", text: "text-red-700", label: "Lost" },
    pending: { bg: "bg-yellow-50", text: "text-yellow-700", label: "Pending" },
  };

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return "just now";
  };

  return (
    <div className="space-y-2">
      {allPredictions.map((p) => {
        const style = outcomeStyles[p.outcome];
        return (
          <div key={p.id} className={`flex items-center justify-between rounded-lg px-3 py-2 ${style.bg}`}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{p.market}</p>
              <p className="text-xs text-gray-500">
                🤖 {p.agentName} · {p.position} · {formatTime(p.timestamp)}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-3">
              <span className="text-xs font-medium text-gray-600">{p.confidence}%</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${style.text} ${style.bg}`}>
                {style.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
