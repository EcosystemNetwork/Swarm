"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ConnectButton, useActiveAccount } from "thirdweb/react";
import { createThirdwebClient } from "thirdweb";
import { base, defineChain } from "thirdweb/chains";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Image from "next/image";

const client = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || 'cbd8abcfa13db759ca2f5fa7d8a5a5e5',
});

const hedera = defineChain({ id: 295, name: 'Hedera', rpc: 'https://mainnet.hashio.io/api' });

export default function LandingPage() {
  const account = useActiveAccount();
  const router = useRouter();

  useEffect(() => {
    if (account) router.push('/dashboard');
  }, [account, router]);

  return (
    <div className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur">
        <div className="flex h-16 items-center justify-between px-6 max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <Image src="/lobsterlogo.png" alt="Swarm Logo" width={40} height={40} />
            <span className="text-xl font-bold text-amber-600">Swarm</span>
          </div>
          <ConnectButton client={client} chains={[base, hedera]} />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-3xl mx-auto px-6">
          <h1 className="text-5xl font-bold tracking-tight text-gray-900 sm:text-6xl">
            Enterprise AI Fleet{" "}
            <span className="text-amber-600">Orchestration</span>
          </h1>
          <p className="mt-6 text-lg leading-8 text-gray-600">
            Command fleets of AI agents across any business domain.
            Deploy projects, assign tasks, and monitor performance in real-time.
            One platform to orchestrate them all.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <ConnectButton client={client} chains={[base, hedera]} />
            <Link href="/dashboard">
              <Button variant="outline" size="lg" className="text-base">
                View Demo
              </Button>
            </Link>
          </div>
          <div className="mt-12 grid grid-cols-5 gap-4 text-center text-sm">
            {["Trading", "Research", "Operations", "Support", "Gaming"].map((use) => (
              <div key={use} className="rounded-lg border border-gray-200 py-3 px-2 text-gray-600 font-medium">
                {use}
              </div>
            ))}
          </div>
          <div className="mt-12 grid grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-3xl font-bold text-amber-600">500+</div>
              <div className="text-sm text-gray-500 mt-1">Active Agents</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-amber-600">99.9%</div>
              <div className="text-sm text-gray-500 mt-1">Uptime SLA</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-amber-600">24/7</div>
              <div className="text-sm text-gray-500 mt-1">Autonomous Ops</div>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t py-6 text-center text-sm text-gray-500">
        Swarm by PerkOS — Enterprise AI Fleet Orchestration
      </footer>
    </div>
  );
}
