"use client";

import { Dialog, DialogHeader, DialogTitle, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { type Mission, getAgentById, getSwarmById } from "@/lib/mock-data";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  active: "bg-blue-100 text-blue-800",
  resolved: "bg-green-100 text-green-800",
};

const statusIcons: Record<string, string> = {
  pending: "🎯",
  active: "🔄",
  resolved: "✅",
};

const eventIcons: Record<string, string> = {
  created: "📋",
  assigned: "👤",
  analysis: "🔍",
  prediction: "📊",
  resolved: "✅",
};

interface MissionDetailDialogProps {
  mission: Mission | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MissionDetailDialog({ mission, open, onOpenChange }: MissionDetailDialogProps) {
  if (!mission) return null;

  const agent = mission.assigneeId ? getAgentById(mission.assigneeId) : null;
  const swarm = getSwarmById(mission.swarmId);

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <span>{statusIcons[mission.status]}</span>
          <DialogTitle>{mission.title}</DialogTitle>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[mission.status]}`}>
            {mission.status.charAt(0).toUpperCase() + mission.status.slice(1)}
          </span>
          <Badge variant="outline">{mission.marketType}</Badge>
          <Badge variant="outline">{mission.priority}</Badge>
        </div>
      </DialogHeader>

      <DialogContent>
        <p className="text-sm text-gray-600">{mission.description}</p>

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-xs text-gray-400">Swarm</span>
            <p className="font-medium">🐝 {swarm?.name || "Unknown"}</p>
          </div>
          <div>
            <span className="text-xs text-gray-400">Agent</span>
            <p className="font-medium">🤖 {agent?.name || "Unassigned"}</p>
          </div>
          <div>
            <span className="text-xs text-gray-400">Created</span>
            <p className="font-medium">{formatDate(mission.createdAt)}</p>
          </div>
          <div>
            <span className="text-xs text-gray-400">Target Date</span>
            <p className="font-medium">{formatDate(mission.targetDate)}</p>
          </div>
        </div>

        {/* Prediction */}
        {mission.prediction && (
          <div className="rounded-lg border p-4 space-y-2">
            <h4 className="text-sm font-semibold">📊 Prediction</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-xs text-gray-400">Market</span>
                <p className="font-medium">{mission.prediction.market}</p>
              </div>
              <div>
                <span className="text-xs text-gray-400">Position</span>
                <p className="font-medium">{mission.prediction.position}</p>
              </div>
              <div>
                <span className="text-xs text-gray-400">Confidence</span>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full"
                      style={{ width: `${mission.prediction.confidence}%` }}
                    />
                  </div>
                  <span className="font-medium text-xs">{mission.prediction.confidence}%</span>
                </div>
              </div>
              <div>
                <span className="text-xs text-gray-400">Stake</span>
                <p className="font-medium">${mission.prediction.stake} @ {mission.prediction.odds}x</p>
              </div>
            </div>
          </div>
        )}

        {/* Outcome */}
        {mission.outcome && (
          <div className={`rounded-lg p-4 ${mission.outcome.result === "win" ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
            <h4 className="text-sm font-semibold mb-1">
              {mission.outcome.result === "win" ? "🏆 Won" : "❌ Lost"}
            </h4>
            <p className={`text-lg font-bold ${mission.outcome.pnl >= 0 ? "text-green-700" : "text-red-700"}`}>
              {mission.outcome.pnl >= 0 ? "+" : ""}{mission.outcome.pnl.toLocaleString()} USDC
            </p>
            <p className="text-xs text-gray-500 mt-1">Resolved {formatDate(mission.outcome.resolvedAt)}</p>
          </div>
        )}

        {/* Timeline */}
        <div>
          <h4 className="text-sm font-semibold mb-3">📅 Timeline</h4>
          <div className="space-y-3">
            {mission.timeline.map((event) => (
              <div key={event.id} className="flex items-start gap-3">
                <span className="text-sm mt-0.5">{eventIcons[event.type] || "📌"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{event.description}</p>
                  <p className="text-xs text-gray-400">{formatDate(event.timestamp)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
