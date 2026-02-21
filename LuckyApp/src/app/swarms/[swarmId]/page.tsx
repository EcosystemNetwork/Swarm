"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getSwarmById, getSwarmAgents, getSwarmMissions, mockMessages, getAgentById } from "@/lib/mock-data";

const MISSION_STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  active: "bg-blue-100 text-blue-700",
  resolved: "bg-green-100 text-green-700",
};

const PRIORITY_LABELS: Record<string, { label: string; color: string }> = {
  low: { label: "Low", color: "text-gray-500" },
  normal: { label: "Normal", color: "text-gray-700" },
  high: { label: "High", color: "text-orange-600" },
  urgent: { label: "Urgent", color: "text-red-600" },
};

export default function SwarmDetailPage() {
  const params = useParams();
  const swarmId = params.swarmId as string;
  const swarm = getSwarmById(swarmId);
  const agents = getSwarmAgents(swarmId);
  const missions = getSwarmMissions(swarmId);
  const messages = mockMessages[swarmId] || [];

  const [chatInput, setChatInput] = useState("");

  if (!swarm) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="text-4xl mb-4">😕</div>
          <h2 className="text-xl font-bold mb-2">Swarm Not Found</h2>
          <Button asChild variant="outline">
            <Link href="/swarms">← Back to Swarms</Link>
          </Button>
        </div>
      </div>
    );
  }

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(diff / 3600000);
    if (hrs > 24) return `${Math.floor(hrs / 24)}d ago`;
    if (hrs > 0) return `${hrs}h ago`;
    if (mins > 0) return `${mins}m ago`;
    return "just now";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link href="/swarms" className="text-gray-400 hover:text-green-600 transition-colors text-lg">
            ←
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{swarm.name}</h1>
              <Badge
                className={
                  swarm.status === "active"
                    ? "bg-green-100 text-green-700 border-green-200"
                    : "bg-gray-100 text-gray-600 border-gray-200"
                }
              >
                {swarm.status === "active" ? "● Active" : "⏸ Paused"}
              </Badge>
            </div>
            <p className="text-gray-500 mt-1">{swarm.description}</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="agents">
        <TabsList>
          <TabsTrigger value="agents">🤖 Agents ({agents.length})</TabsTrigger>
          <TabsTrigger value="missions">🎯 Missions ({missions.length})</TabsTrigger>
          <TabsTrigger value="channel">📡 Command Channel</TabsTrigger>
        </TabsList>

        {/* Agents Tab */}
        <TabsContent value="agents">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <Link key={agent.id} href={`/agents/${agent.id}`}>
                <Card className="hover:border-green-300 transition-colors cursor-pointer">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-lg font-bold text-green-700">
                        {agent.name.charAt(0)}
                      </div>
                      <div>
                        <CardTitle className="text-base">{agent.name}</CardTitle>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="secondary" className="text-xs">{agent.type}</Badge>
                          <span className={`text-xs ${agent.status === "online" ? "text-green-600" : "text-gray-400"}`}>
                            {agent.status === "online" ? "● Online" : "○ Offline"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Win Rate: <strong className="text-green-600">{agent.winRate}%</strong></span>
                      <span className="text-gray-500">{agent.totalPredictions} predictions</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </TabsContent>

        {/* Missions Tab */}
        <TabsContent value="missions">
          <div className="space-y-3">
            {missions.map((mission) => {
              const assignee = mission.assigneeId ? getAgentById(mission.assigneeId) : null;
              const priority = PRIORITY_LABELS[mission.priority] || PRIORITY_LABELS.normal;
              return (
                <Card key={mission.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium">{mission.title}</h3>
                          <Badge className={MISSION_STATUS_COLORS[mission.status] || ""}>
                            {mission.status}
                          </Badge>
                        </div>
                        <CardDescription>{mission.description}</CardDescription>
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                          <span className={priority.color}>● {priority.label}</span>
                          {assignee && <span>🤖 {assignee.name}</span>}
                          <span>Updated {formatTime(mission.updatedAt)}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {missions.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <div className="text-4xl mb-3">🎯</div>
                <p>No missions yet</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Command Channel Tab */}
        <TabsContent value="channel">
          <Card>
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-base">📡 Command Channel</CardTitle>
              <CardDescription>Real-time communication with swarm agents</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {/* Messages */}
              <div className="h-[400px] overflow-y-auto p-4 space-y-3">
                {messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-gray-400">
                    <div className="text-center">
                      <div className="text-4xl mb-3">💬</div>
                      <p className="text-sm">No messages yet</p>
                    </div>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div key={msg.id} className="flex items-start gap-3">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 ${
                          msg.senderType === "agent"
                            ? "bg-green-100 text-green-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {msg.senderType === "agent" ? "🤖" : msg.senderName.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className={`text-sm font-semibold ${msg.senderType === "agent" ? "text-green-700" : "text-gray-900"}`}>
                            {msg.senderName}
                          </span>
                          <span className="text-xs text-gray-400">{formatTime(msg.timestamp)}</span>
                        </div>
                        <p className="text-sm text-gray-700 mt-0.5">{msg.content}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Input */}
              <div className="border-t p-3 flex gap-2">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Send a command..."
                  className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && chatInput.trim()) {
                      setChatInput("");
                    }
                  }}
                />
                <Button
                  className="bg-green-500 hover:bg-green-600 text-white"
                  disabled={!chatInput.trim()}
                  onClick={() => setChatInput("")}
                >
                  Send
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
