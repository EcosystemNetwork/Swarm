"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { mockMissions, getAgentById, getSwarmById, type Mission } from "@/lib/mock-data";
import { MissionDetailDialog } from "@/components/mission-detail-dialog";
import { CreateMissionDialog } from "@/components/create-mission-dialog";

const columns = [
  { status: "pending" as const, label: "Pending", icon: "🎯", bg: "bg-yellow-50", border: "border-yellow-200" },
  { status: "active" as const, label: "Active", icon: "🔄", bg: "bg-blue-50", border: "border-blue-200" },
  { status: "resolved" as const, label: "Resolved", icon: "✅", bg: "bg-green-50", border: "border-green-200" },
];

export default function MissionsPage() {
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [missions] = useState(mockMissions);

  const getMissionsByStatus = (status: string) =>
    missions.filter((m) => m.status === status);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">🎯 Missions</h1>
          <p className="text-gray-500 mt-1">Track predictions and agent analysis</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="bg-green-600 hover:bg-green-700 text-white">
          + New Mission
        </Button>
      </div>

      {/* Kanban board */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {columns.map((col) => {
          const colMissions = getMissionsByStatus(col.status);
          return (
            <div key={col.status} className="space-y-3">
              {/* Column header */}
              <div className={`flex items-center justify-between rounded-lg px-4 py-2 ${col.bg} border ${col.border}`}>
                <div className="flex items-center gap-2">
                  <span>{col.icon}</span>
                  <h2 className="font-semibold text-sm">{col.label}</h2>
                </div>
                <Badge variant="outline" className="text-xs">{colMissions.length}</Badge>
              </div>

              {/* Mission cards */}
              <div className="space-y-3">
                {colMissions.map((mission) => {
                  const agent = mission.assigneeId ? getAgentById(mission.assigneeId) : null;
                  const swarm = getSwarmById(mission.swarmId);

                  return (
                    <Card
                      key={mission.id}
                      className="cursor-pointer hover:shadow-md transition-shadow border-gray-200"
                      onClick={() => { setSelectedMission(mission); setDetailOpen(true); }}
                    >
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <h3 className="text-sm font-semibold leading-tight">{mission.title}</h3>
                          <Badge variant="outline" className="text-[10px] shrink-0 ml-2">{mission.marketType}</Badge>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span>🐝 {swarm?.name || "—"}</span>
                          <span>·</span>
                          <span>🤖 {agent?.name || "Unassigned"}</span>
                        </div>

                        {mission.prediction && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-600 truncate flex-1">{mission.prediction.position}</span>
                            <div className="flex items-center gap-1.5 ml-2">
                              <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-green-500 rounded-full"
                                  style={{ width: `${mission.prediction.confidence}%` }}
                                />
                              </div>
                              <span className="font-medium">{mission.prediction.confidence}%</span>
                            </div>
                          </div>
                        )}

                        {mission.outcome && (
                          <div className={`text-xs font-semibold ${mission.outcome.pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {mission.outcome.pnl >= 0 ? "+" : ""}{mission.outcome.pnl.toLocaleString()} USDC
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}

                {colMissions.length === 0 && (
                  <div className="text-center py-8 text-sm text-gray-400">No missions</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <MissionDetailDialog mission={selectedMission} open={detailOpen} onOpenChange={setDetailOpen} />
      <CreateMissionDialog open={createOpen} onOpenChange={setCreateOpen} onSubmit={() => {}} />
    </div>
  );
}
