"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreateSwarmDialog } from "@/components/create-swarm-dialog";
import { mockSwarms, mockAgents, mockMissions } from "@/lib/mock-data";

export default function SwarmsPage() {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">🐝 Swarms</h1>
          <p className="text-gray-500 mt-1">
            Manage your prediction market swarms
          </p>
        </div>
        <Button
          onClick={() => setShowCreate(true)}
          className="bg-green-500 hover:bg-green-600 text-white"
        >
          + Create Swarm
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {mockSwarms.map((swarm) => {
          const agentCount = swarm.agentIds.length;
          const missionCount = mockMissions.filter(
            (m) => m.swarmId === swarm.id
          ).length;
          const agents = mockAgents.filter((a) =>
            swarm.agentIds.includes(a.id)
          );

          return (
            <Link key={swarm.id} href={`/swarms/${swarm.id}`}>
              <Card className="hover:border-green-300 transition-colors cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">{swarm.name}</CardTitle>
                      <CardDescription>{swarm.description}</CardDescription>
                    </div>
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
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
                    <span>🤖 {agentCount} Agents</span>
                    <span>🎯 {missionCount} Missions</span>
                  </div>
                  <div className="flex -space-x-2">
                    {agents.slice(0, 4).map((agent) => (
                      <div
                        key={agent.id}
                        className="w-8 h-8 rounded-full bg-green-100 border-2 border-white flex items-center justify-center text-xs font-bold text-green-700"
                        title={agent.name}
                      >
                        {agent.name.charAt(0)}
                      </div>
                    ))}
                    {agents.length > 4 && (
                      <div className="w-8 h-8 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-xs font-medium text-gray-500">
                        +{agents.length - 4}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <CreateSwarmDialog open={showCreate} onOpenChange={setShowCreate} />
    </div>
  );
}
