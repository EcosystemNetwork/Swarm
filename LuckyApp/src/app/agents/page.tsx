"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RegisterAgentDialog } from "@/components/register-agent-dialog";
import { mockAgents } from "@/lib/mock-data";

const TYPE_COLORS: Record<string, string> = {
  Crypto: "bg-orange-100 text-orange-700 border-orange-200",
  Sports: "bg-blue-100 text-blue-700 border-blue-200",
  Esports: "bg-purple-100 text-purple-700 border-purple-200",
  Events: "bg-pink-100 text-pink-700 border-pink-200",
  Quant: "bg-cyan-100 text-cyan-700 border-cyan-200",
  Scout: "bg-amber-100 text-amber-700 border-amber-200",
};

export default function AgentsPage() {
  const [showRegister, setShowRegister] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">🤖 Agent Fleet</h1>
          <p className="text-gray-500 mt-1">
            Monitor and manage your AI prediction agents
          </p>
        </div>
        <Button
          onClick={() => setShowRegister(true)}
          className="bg-green-500 hover:bg-green-600 text-white"
        >
          + Register Agent
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {mockAgents.map((agent) => (
          <Link key={agent.id} href={`/agents/${agent.id}`}>
            <Card className="hover:border-green-300 transition-colors cursor-pointer h-full">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-lg font-bold text-green-700">
                      {agent.name.charAt(0)}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{agent.name}</CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className={TYPE_COLORS[agent.type] || ""}>{agent.type}</Badge>
                        <span className={`text-xs flex items-center gap-1 ${agent.status === "online" ? "text-green-600" : "text-gray-400"}`}>
                          <span className={`w-2 h-2 rounded-full ${agent.status === "online" ? "bg-green-500" : "bg-gray-300"}`} />
                          {agent.status}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="mb-3 line-clamp-2">{agent.description}</CardDescription>
                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100">
                  <div>
                    <div className="text-xs text-gray-500">Win Rate</div>
                    <div className={`text-lg font-bold ${agent.winRate >= 65 ? "text-green-600" : agent.winRate >= 55 ? "text-yellow-600" : "text-red-500"}`}>
                      {agent.winRate}%
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Predictions</div>
                    <div className="text-lg font-bold text-gray-900">{agent.totalPredictions}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <RegisterAgentDialog open={showRegister} onOpenChange={setShowRegister} />
    </div>
  );
}
