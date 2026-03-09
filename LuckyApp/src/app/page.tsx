/** Landing Page — Hero section with 3D Spline robots, wallet connect CTA, and feature showcase.
 *  After wallet connection, triggers the challenge/sign flow to create a durable server session. */
"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ConnectButton, useActiveAccount } from "thirdweb/react";
import { createThirdwebClient } from "thirdweb";
import { WALLET_CHAINS } from "@/lib/chains";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense, lazy, useRef, useCallback } from "react";
import Image from "next/image";
import { ArrowRight, Sun, Moon, Loader2 } from "lucide-react";
import { useTheme } from "next-themes";
import { useSession } from "@/contexts/SessionContext";

const Spline = lazy(() => import('@splinetool/react-spline'));

const client = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || '510999ec2be00a99e36ab07b36f15a72',
});

// 3 robots — centered, wider spread, faster load
const ROBOT_COUNT = 3;

export default function LandingPage() {
  const account = useActiveAccount();
  const router = useRouter();
  const searchParams = useSearchParams();
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { authenticated, requestChallenge, verifyChallenge } = useSession();
  const [signingIn, setSigningIn] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const challengeStarted = useRef(false);
  const accountRef = useRef(account);
  accountRef.current = account;

  useEffect(() => setMounted(true), []);

  // If already authenticated, redirect to dashboard
  useEffect(() => {
    if (authenticated) {
      const redirect = searchParams.get('redirect') || '/dashboard';
      const timer = setTimeout(() => router.push(redirect), 300);
      return () => clearTimeout(timer);
    }
  }, [authenticated, router, searchParams]);

  // Trigger wallet challenge flow when wallet connects
  const startChallengeFlow = useCallback(async (address: string) => {
    if (challengeStarted.current) return;
    challengeStarted.current = true;
    setSigningIn(true);
    setSignError(null);

    try {
      // 0. Verify wallet is fully connected before requesting nonce
      const preCheck = accountRef.current;
      if (!preCheck?.signMessage) {
        throw new Error("Wallet not fully connected yet. Please try again.");
      }

      // 1. Request nonce from server
      const { message } = await requestChallenge(address);

      // 2. Sign the message with wallet (read live ref, not stale closure)
      const liveAccount = accountRef.current;
      if (!liveAccount?.signMessage) throw new Error("Wallet disconnected during signing");

      const signature = await liveAccount.signMessage({ message });

      // 3. Verify signature on server (creates session + sets cookie)
      const success = await verifyChallenge(address, signature, message);

      if (!success) {
        setSignError("Verification failed. Please try again.");
        challengeStarted.current = false;
      }
      // On success, the useEffect above will redirect to dashboard
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sign-in failed";
      if (msg.includes("rejected") || msg.includes("denied") || msg.includes("cancelled")) {
        // User rejected — don't auto-retry, let them click "Try again"
        setSignError("Signature declined. Click below to try again.");
      } else {
        setSignError(msg);
      }
      // Don't reset challengeStarted — prevents auto-retry loop.
      // User must click "Try again" to re-trigger.
    } finally {
      setSigningIn(false);
    }
  }, [requestChallenge, verifyChallenge]);

  // When wallet connects, start challenge flow (once).
  // Debounce by 1.5s so thirdweb auto-connect can settle —
  // auto-connect can flicker the account (appear → disappear → reappear)
  // as it resolves wallets, especially Coinbase Wallet.
  useEffect(() => {
    if (!account?.address || authenticated || challengeStarted.current) return;

    const timer = setTimeout(() => {
      // Re-check after debounce: account might have disappeared during auto-connect flicker
      const live = accountRef.current;
      if (live?.address && !challengeStarted.current) {
        startChallengeFlow(live.address);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [account?.address, authenticated, startChallengeFlow]);

  // Reset when wallet disconnects so reconnecting works
  useEffect(() => {
    if (!account) {
      challengeStarted.current = false;
    }
  }, [account]);

  const handleRobotLoad = (index: number) => (spline: any) => {
    canvasRefs.current[index] = spline.canvas ?? spline._canvas ?? null;
  };

  // Forward mouse to all robot canvases
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      canvasRefs.current.forEach(canvas => {
        if (canvas) {
          canvas.dispatchEvent(new PointerEvent('pointermove', {
            clientX: e.clientX,
            clientY: e.clientY,
            screenX: e.screenX,
            screenY: e.screenY,
            bubbles: false,
            cancelable: true,
            pointerId: 1,
            pointerType: 'mouse',
          }));
        }
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div className="flex flex-col min-h-screen overflow-x-hidden">
      <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-black/50 backdrop-blur-xl">
        <div className="flex h-20 items-center justify-between px-6 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Image src="/lobsterlogo.png" alt="Swarm Logo" width={44} height={44} className="drop-shadow-[0_0_10px_hsl(var(--primary)/0.3)]" />
            <span className="text-2xl font-bold text-amber-500 tracking-tight">Swarm</span>
          </div>
          <div className="flex items-center gap-4">
            {mounted && (
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="p-2 rounded-md border border-amber-500/20 hover:border-amber-500/40 transition-colors text-amber-400 hover:text-amber-300"
                title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            )}
            <ConnectButton client={client} chains={WALLET_CHAINS} />
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-x-hidden">
        {/* Hero Section */}
        <section className="relative pt-24 pb-32 min-h-[95vh] flex items-center justify-center overflow-hidden">
          {/* 3 Spline Robots — centered with wider spread */}
          <div className="absolute inset-0 z-0 pointer-events-none">
            {Array.from({ length: ROBOT_COUNT }, (_, i) => {
              // Centered trio: left flank, center lead, right flank
              const configs = [
                { x: -20, y: 5, scale: 0.85, opacity: 0.55, z: 0 },  // left
                { x: 5, y: 0, scale: 1, opacity: 0.9, z: 2 },  // center
                { x: 30, y: 5, scale: 0.85, opacity: 0.55, z: 0 },  // right
              ];
              const c = configs[i];

              return (
                <div
                  key={i}
                  className="absolute inset-0"
                  style={{
                    transform: `translateX(${c.x}%) translateY(${c.y}%) scale(${c.scale})`,
                    opacity: c.opacity,
                    zIndex: c.z,
                  }}
                >
                  <Suspense fallback={null}>
                    <Spline
                      onLoad={handleRobotLoad(i)}
                      scene="https://prod.spline.design/Apa6K76Zg3Ki-VRj/scene.splinecode"
                      className="w-full h-full"
                    />
                  </Suspense>
                </div>
              );
            })}

            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black pointer-events-none z-[10]" />
          </div>

          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-amber-500/5 rounded-full blur-[120px] pointer-events-none" />

          <div className="max-w-5xl mx-auto px-6 text-center relative z-10 pointer-events-none">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber-500/20 bg-amber-500/5 text-amber-500 text-xs font-semibold mb-8 animate-in pointer-events-auto">
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

            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 animate-in delay-300 pointer-events-auto">
              {signingIn ? (
                <div className="flex items-center gap-3 px-6 py-3 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm font-medium">Verifying wallet...</span>
                </div>
              ) : (
                <ConnectButton client={client} chains={WALLET_CHAINS} />
              )}
              <Link href="/docs">
                <Button variant="outline" size="lg" className="h-12 px-8 rounded-full border-white/10 hover:bg-white/5 group bg-black/20">
                  Read the Docs
                  <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
            </div>

            {signError && (
              <div className="mt-4 pointer-events-auto">
                <p className="text-sm text-red-400">{signError}</p>
                <button
                  onClick={() => {
                    setSignError(null);
                    challengeStarted.current = false;
                    if (account?.address) startChallengeFlow(account.address);
                  }}
                  className="mt-2 text-xs text-amber-400 hover:text-amber-300 underline"
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-24 border-t border-white/5">
          <div className="max-w-4xl mx-auto px-6 text-center">
            <h2 className="text-4xl font-bold text-white mb-6 tracking-tight">Ready to orchestrate your fleet?</h2>
            <div className="flex justify-center">
              <ConnectButton client={client} chains={WALLET_CHAINS} />
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
