"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ConnectButton, useActiveAccount } from "thirdweb/react";
import { createThirdwebClient } from "thirdweb";
import { base, defineChain } from "thirdweb/chains";
import { useRouter } from "next/navigation";
import { useEffect, Suspense, lazy } from "react";
import Image from "next/image";
import {
  Shield,
  Zap,
  BarChart3,
  Users,
  Cpu,
  Globe,
  LayoutDashboard,
  ArrowRight
} from "lucide-react";

const Spline = lazy(() => import('@splinetool/react-spline'));

const client = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || 'cbd8abcfa13db759ca2f5fa7d8a5a5e5',
});

const hedera = defineChain({ id: 295, name: 'Hedera', rpc: 'https://mainnet.hashio.io/api' });

const features = [
  {
    icon: <LayoutDashboard className="w-6 h-6 text-amber-500" />,
    title: "Mission Control",
    description: "Centrally manage all AI agent fleets from a single unified dashboard."
  },
  {
    icon: <Cpu className="w-6 h-6 text-amber-500" />,
    title: "Fleet Orchestration",
    description: "Dynamic task allocation and load balancing across multi-agent environments."
  },
  {
    icon: <BarChart3 className="w-6 h-6 text-amber-500" />,
    title: "Real-time Metrics",
    description: "Monitor execution efficiency, agent health, and performance in real-time."
  },
  {
    icon: <Zap className="w-6 h-6 text-amber-500" />,
    title: "Autonomous Scaling",
    description: "Automatically scale your agent fleet based on demand and workload complexity."
  },
  {
    icon: <Globe className="w-6 h-6 text-amber-500" />,
    title: "Global Reach",
    description: "Deploy and coordinate agents across diverse geographic and business domains."
  },
  {
    icon: <Shield className="w-6 h-6 text-amber-500" />,
    title: "Enterprise Security",
    description: "Bank-grade encryption and access controls for secure agent operations."
  }
];

export default function LandingPage() {
  const account = useActiveAccount();
  const router = useRouter();

  useEffect(() => {
    if (account) router.push('/dashboard');
  }, [account, router]);

  return (
    <div className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-black/50 backdrop-blur-xl">
        <div className="flex h-20 items-center justify-between px-6 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Image src="/lobsterlogo.png" alt="Swarm Logo" width={44} height={44} className="drop-shadow-[0_0_10px_rgba(255,215,0,0.3)]" />
            <span className="text-2xl font-bold text-[#FFD700] tracking-tight">Swarm</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="hidden sm:block text-sm font-medium text-muted-foreground hover:text-white transition-colors">
              Enter App
            </Link>
            <ConnectButton client={client} chains={[base, hedera]} />
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative pt-24 pb-32 overflow-hidden min-h-[90vh] flex items-center justify-center">
          {/* Spline Background Container */}
          <div className="absolute inset-0 z-0">
            <Suspense fallback={
              <div className="w-full h-full flex items-center justify-center bg-black/20">
                <div className="w-12 h-12 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
              </div>
            }>
              <Spline
                scene="https://prod.spline.design/G9Uv2yhuZyhmrxRG/scene.splinecode"
                className="w-full h-full pointer-events-none opacity-60"
              />
            </Suspense>
            {/* Gradient Overlay to fade Spline into background */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/20 to-black pointer-events-none" />
          </div>

          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-amber-500/5 rounded-full blur-[120px] pointer-events-none" />

          <div className="max-w-5xl mx-auto px-6 text-center relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber-500/20 bg-amber-500/5 text-amber-500 text-xs font-semibold mb-8 animate-in">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              Next-Gen AI Fleet Management
            </div>

            <h1 className="text-6xl md:text-8xl font-extrabold tracking-tighter text-white mb-8 animate-in delay-100">
              Enterprise AI Fleet{" "}
              <span className="bg-gradient-to-r from-amber-400 to-amber-600 bg-clip-text text-transparent text-glow">
                Orchestration
              </span>
            </h1>

            <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto mb-12 animate-in delay-200 leading-relaxed">
              Command fleets of AI agents across any business domain.
              Deploy projects, assign tasks, and monitor performance with the ultimate enterprise command center.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 animate-in delay-300">
              <ConnectButton client={client} chains={[base, hedera]} />
              <Link href="/dashboard">
                <Button variant="outline" size="lg" className="h-12 px-8 rounded-full border-white/10 hover:bg-white/5 group bg-black/20">
                  Platform Demo
                  <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-24 bg-black/20">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-white mb-4">Core Capabilities</h2>
              <p className="text-muted-foreground">Everything you need to manage complex AI agent workflows at scale.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((feature, idx) => (
                <div key={idx} className="glass-card p-8 rounded-2xl group">
                  <div className="mb-4 inline-flex p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 group-hover:bg-amber-500/20 transition-colors">
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="py-24 relative overflow-hidden">
          <div className="max-w-5xl mx-auto px-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-12 text-center">
              <div className="space-y-2">
                <div className="text-5xl font-black text-[#FFD700] text-glow">500+</div>
                <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Active Agents</div>
              </div>
              <div className="space-y-2">
                <div className="text-5xl font-black text-[#FFD700] text-glow">99.9%</div>
                <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Uptime SLA</div>
              </div>
              <div className="space-y-2">
                <div className="text-5xl font-black text-[#FFD700] text-glow">24/7</div>
                <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Autonomous Ops</div>
              </div>
              <div className="space-y-2">
                <div className="text-5xl font-black text-[#FFD700] text-glow">10M+</div>
                <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Tasks Solved</div>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-24 border-t border-white/5">
          <div className="max-w-4xl mx-auto px-6 text-center">
            <h2 className="text-4xl font-bold text-white mb-6 tracking-tight">Ready to orchestrate your fleet?</h2>
            <div className="flex justify-center">
              <ConnectButton client={client} chains={[base, hedera]} />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5 py-12 text-center bg-black/40">
        <div className="mb-4 flex items-center justify-center gap-2">
          <Image src="/lobsterlogo.png" alt="Swarm Logo" width={24} height={24} />
          <span className="text-sm font-bold text-white">Swarm by PerkOS</span>
        </div>
        <p className="text-xs text-muted-foreground uppercase tracking-widest">
          Enterprise AI Fleet Orchestration &copy; 2026
        </p>
      </footer>
    </div>
  );
}
