"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Brain, Cpu, Trophy, Zap, TrendingUp, GitBranch, Database, Award } from "lucide-react";
import Link from "next/link";

export default function BittensorPage() {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <span className="text-4xl">τ</span>
            <span>Bittensor SwarmCare Subnet</span>
          </h1>
          <p className="text-muted-foreground mt-1">
            Decentralized AI model training for elderly care coordination
          </p>
        </div>
        <Badge variant="outline" className="bg-purple-500/10 border-purple-500/20 text-purple-400">
          Subnet #420
        </Badge>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Miners</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">32</div>
            <p className="text-xs text-muted-foreground">+4 from last epoch</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Validators</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">8</div>
            <p className="text-xs text-muted-foreground">Scoring models</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Models Trained</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">1,247</div>
            <p className="text-xs text-muted-foreground">Total submissions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">TAO Emissions</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">847 τ</div>
            <p className="text-xs text-muted-foreground">Distributed lifetime</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="miners">Miners</TabsTrigger>
          <TabsTrigger value="scenarios">Scenarios</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>SwarmCare Subnet Architecture</CardTitle>
              <CardDescription>
                Fine-tune LLaMA models for robot coordination in elderly care facilities
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-purple-400" />
                    Miners
                  </h3>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Receive care coordination scenarios from validators</li>
                    <li>Fine-tune LLaMA-3.2-1B models on GPU</li>
                    <li>Submit trained models with inference benchmarks</li>
                    <li>Earn TAO based on model quality scores</li>
                  </ul>
                </div>

                <div className="space-y-2">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Award className="h-4 w-4 text-amber-400" />
                    Validators
                  </h3>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Create training tasks with held-out benchmarks</li>
                    <li>Score models on 4 metrics (accuracy, generalization, efficiency, novelty)</li>
                    <li>Distribute TAO emissions proportionally to scores</li>
                    <li>Deploy winning models to Swarm Protocol</li>
                  </ul>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <h3 className="font-semibold mb-2">Scoring System</h3>
                <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="font-semibold text-sm">Accuracy</div>
                    <div className="text-2xl font-bold text-emerald-400">40%</div>
                    <div className="text-xs text-muted-foreground">Correctness on benchmarks</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="font-semibold text-sm">Generalization</div>
                    <div className="text-2xl font-bold text-blue-400">25%</div>
                    <div className="text-xs text-muted-foreground">Novel scenario performance</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="font-semibold text-sm">Efficiency</div>
                    <div className="text-2xl font-bold text-purple-400">20%</div>
                    <div className="text-xs text-muted-foreground">Inference speed</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="font-semibold text-sm">Novelty</div>
                    <div className="text-2xl font-bold text-amber-400">15%</div>
                    <div className="text-xs text-muted-foreground">Solution creativity</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Start</CardTitle>
              <CardDescription>Run the demo or deploy your own miner/validator</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                <div className="flex-1">
                  <div className="font-semibold text-sm">1. Install dependencies</div>
                  <code className="text-xs text-muted-foreground">cd bittensor-mod && pip install -r requirements.txt</code>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                <div className="flex-1">
                  <div className="font-semibold text-sm">2. Run the demo</div>
                  <code className="text-xs text-muted-foreground">python demo.py</code>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                <div className="flex-1">
                  <div className="font-semibold text-sm">3. View results</div>
                  <code className="text-xs text-muted-foreground">Check leaderboard and model scores</code>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Miners Tab */}
        <TabsContent value="miners" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-400" />
                Top Miners Leaderboard
              </CardTitle>
              <CardDescription>Ranked by weighted total score</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[
                  { uid: 42, score: 0.92, tao: "127.3 τ", name: "care-model-v3" },
                  { uid: 17, score: 0.89, tao: "115.8 τ", name: "llama-care-pro" },
                  { uid: 88, score: 0.87, tao: "109.2 τ", name: "elderly-assist-2" },
                  { uid: 3, score: 0.84, tao: "98.5 τ", name: "swarmcare-opt" },
                  { uid: 61, score: 0.81, tao: "87.1 τ", name: "robo-coord-v1" },
                ].map((miner, i) => (
                  <div
                    key={miner.uid}
                    className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-purple-500/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted font-bold text-sm">
                        #{i + 1}
                      </div>
                      <div>
                        <div className="font-semibold">Miner UID {miner.uid}</div>
                        <div className="text-xs text-muted-foreground">{miner.name}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-purple-400">{(miner.score * 100).toFixed(0)}%</div>
                      <div className="text-xs text-muted-foreground">{miner.tao} earned</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Scenarios Tab */}
        <TabsContent value="scenarios" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Training Scenarios</CardTitle>
              <CardDescription>5 diverse care coordination scenarios for model training</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  { id: "hydration_001", name: "Hydration Round", difficulty: "Easy", icon: "💧", type: "HYDRATION" },
                  { id: "emergency_001", name: "Emergency Fall Detection", difficulty: "Hard", icon: "🚨", type: "EMERGENCY" },
                  { id: "medication_001", name: "Medication Delivery", difficulty: "Medium", icon: "💊", type: "MEDICATION" },
                  { id: "night_001", name: "Night Check Rounds", difficulty: "Easy", icon: "🌙", type: "ROUTINE" },
                  { id: "supply_001", name: "Supply Distribution", difficulty: "Medium", icon: "📦", type: "LOGISTICS" },
                ].map((scenario) => (
                  <div
                    key={scenario.id}
                    className="p-4 rounded-lg border border-border hover:border-purple-500/50 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{scenario.icon}</span>
                        <span className="font-semibold">{scenario.name}</span>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          scenario.difficulty === "Hard"
                            ? "bg-red-500/10 border-red-500/20 text-red-400"
                            : scenario.difficulty === "Medium"
                            ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                            : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                        }
                      >
                        {scenario.difficulty}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      ID: {scenario.id} • Type: {scenario.type}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tools Tab */}
        <TabsContent value="tools" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cpu className="h-5 w-5" />
                  Run Miner
                </CardTitle>
                <CardDescription>Start a GPU worker to train models and earn TAO</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <code className="block p-3 rounded-lg bg-muted text-xs">
                    python bittensor-mod/subnet/miner.py --miner-uid 1
                  </code>
                  <Button className="w-full" variant="outline">
                    <GitBranch className="h-4 w-4 mr-2" />
                    View Miner Code
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5" />
                  Run Validator
                </CardTitle>
                <CardDescription>Score models and distribute TAO emissions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <code className="block p-3 rounded-lg bg-muted text-xs">
                    python bittensor-mod/subnet/validator.py --validator-uid 0
                  </code>
                  <Button className="w-full" variant="outline">
                    <GitBranch className="h-4 w-4 mr-2" />
                    View Validator Code
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Run Demo
                </CardTitle>
                <CardDescription>End-to-end subnet workflow simulation</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <code className="block p-3 rounded-lg bg-muted text-xs">
                    python bittensor-mod/demo.py
                  </code>
                  <Button className="w-full" variant="outline">
                    <GitBranch className="h-4 w-4 mr-2" />
                    View Demo Code
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Deploy Model
                </CardTitle>
                <CardDescription>Deploy winning model to Swarm Protocol agents</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <code className="block p-3 rounded-lg bg-muted text-xs">
                    python bittensor-mod/scripts/pull_best_model.py
                  </code>
                  <Button className="w-full" variant="outline">
                    <GitBranch className="h-4 w-4 mr-2" />
                    View Deployment Script
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Documentation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link
                href="/docs"
                className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-purple-500/50 transition-colors"
              >
                <span className="font-medium">📖 Full Documentation</span>
                <span className="text-xs text-muted-foreground">README.md (428 lines)</span>
              </Link>
              <Link
                href="/docs"
                className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-purple-500/50 transition-colors"
              >
                <span className="font-medium">🚀 Quick Start Guide</span>
                <span className="text-xs text-muted-foreground">QUICKSTART.md (234 lines)</span>
              </Link>
              <Link
                href="/docs"
                className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-purple-500/50 transition-colors"
              >
                <span className="font-medium">📋 Implementation Summary</span>
                <span className="text-xs text-muted-foreground">IMPLEMENTATION_SUMMARY.md</span>
              </Link>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
