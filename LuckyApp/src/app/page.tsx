/** Landing Page — Hero section with 3D Spline robots, wallet connect CTA, and feature showcase.
 *  SIWE sign-in is handled automatically by the global AutoSiwe component. */
"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ConnectButton } from "thirdweb/react";
import { createThirdwebClient } from "thirdweb";
import { WALLET_CHAINS } from "@/lib/chains";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense, lazy, useRef } from "react";
import Image from "next/image";
import { ArrowRight, Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";
import { useSession } from "@/contexts/SessionContext";
import { debug } from "@/lib/debug";
import { useThirdwebAuth } from "@/hooks/useThirdwebAuth";

const Spline = lazy(() => import('@splinetool/react-spline'));

const client = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || '510999ec2be00a99e36ab07b36f15a72',
});

// 3 robots — staggered loading to avoid WebGL context exhaustion
const ROBOT_CONFIGS = [
  { x: -20, y: 5, scale: 0.85, opacity: 0.55, z: 0 },  // left flank
  { x: 5, y: 0, scale: 1, opacity: 0.9, z: 2 },         // center lead
  { x: 30, y: 5, scale: 0.85, opacity: 0.55, z: 0 },    // right flank
];

function LandingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { authenticated, loading } = useSession();
  const authConfig = useThirdwebAuth();
  // Staggered loading: center first, then flanks after delay
  const [robotsReady, setRobotsReady] = useState<boolean[]>([false, false, false]);

  useEffect(() => setMounted(true), []);

  const redirectParam = searchParams.get('redirect');
  const redirectTarget = redirectParam || '/dashboard';

  useEffect(() => {
    if (loading || !authenticated) return;

    // Case 1: User was bounced here from a protected route by middleware
    // e.g. /dashboard → /?redirect=/dashboard — redirect back immediately.
    if (redirectParam) {
      debug.log("[Swarm:Landing] Bounced from protected route, redirecting to:", redirectParam);
      router.push(redirectParam);
      return;
    }

    // Case 2: User just completed a fresh login via ConnectButton/SIWE.
    // The doLogin callback sets a sessionStorage flag so we can detect this
    // even when auth was already true from a stale cookie.
    try {
      if (sessionStorage.getItem("swarm_just_logged_in") === "1") {
        sessionStorage.removeItem("swarm_just_logged_in");
        debug.log("[Swarm:Landing] Fresh login detected! Redirecting to:", redirectTarget);
        router.push(redirectTarget);
        return;
      }
    } catch {}

    // Case 3: User navigated to "/" directly with a valid session cookie.
    // Show the landing page — don't auto-redirect.
    debug.log("[Swarm:Landing] Authenticated but no redirect trigger, showing landing page");
  }, [authenticated, loading, router, redirectParam, redirectTarget]);

  // Stagger robot loading: center immediately, left at 4s, right at 8s
  useEffect(() => {
    // Center robot loads immediately
    setRobotsReady(prev => { const n = [...prev]; n[1] = true; return n; });

    const t1 = setTimeout(() => {
      setRobotsReady(prev => { const n = [...prev]; n[0] = true; return n; });
    }, 4000);

    const t2 = setTimeout(() => {
      setRobotsReady(prev => { const n = [...prev]; n[2] = true; return n; });
    }, 8000);

    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

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
            {authenticated && !loading ? (
              <Link href="/dashboard">
                <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-black font-semibold">
                  Dashboard <ArrowRight className="ml-1.5 w-3.5 h-3.5" />
                </Button>
              </Link>
            ) : (
              <ConnectButton client={client} chains={WALLET_CHAINS} auth={authConfig} autoConnect={false} />
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-x-hidden">
        {/* Hero Section */}
        <section className="relative pt-24 pb-32 min-h-[95vh] flex items-center justify-center overflow-hidden">
          {/* 3 Spline Robots — staggered loading to avoid WebGL context exhaustion */}
          <div className="absolute inset-0 z-0 pointer-events-none">
            {ROBOT_CONFIGS.map((c, i) => (
              <div
                key={i}
                className="absolute inset-0 transition-opacity duration-1000"
                style={{
                  transform: `translateX(${c.x}%) translateY(${c.y}%) scale(${c.scale})`,
                  opacity: robotsReady[i] ? c.opacity : 0,
                  zIndex: c.z,
                }}
              >
                {robotsReady[i] && (
                  <Suspense fallback={null}>
                    <Spline
                      onLoad={handleRobotLoad(i)}
                      scene="https://prod.spline.design/Apa6K76Zg3Ki-VRj/scene.splinecode"
                      className="w-full h-full"
                    />
                  </Suspense>
                )}
              </div>
            ))}

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
              {authenticated && !loading ? (
                <Link href="/dashboard">
                  <Button size="lg" className="h-12 px-8 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-black font-semibold group">
                    Go to Dashboard
                    <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </Button>
                </Link>
              ) : (
                <ConnectButton client={client} chains={WALLET_CHAINS} auth={authConfig} autoConnect={false} />
              )}
              <Link href="/docs">
                <Button variant="outline" size="lg" className="h-12 px-8 rounded-full border-white/10 hover:bg-white/5 group bg-black/20">
                  Read the Docs
                  <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-24 border-t border-white/5">
          <div className="max-w-4xl mx-auto px-6 text-center">
            <h2 className="text-4xl font-bold text-white mb-6 tracking-tight">Ready to orchestrate your fleet?</h2>
            <div className="flex justify-center">
              {authenticated && !loading ? (
                <Link href="/dashboard">
                  <Button size="lg" className="h-12 px-8 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-black font-semibold group">
                    Go to Dashboard
                    <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </Button>
                </Link>
              ) : (
                <ConnectButton client={client} chains={WALLET_CHAINS} auth={authConfig} autoConnect={false} />
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5 py-12 text-center bg-black/40">
        <div className="mb-4 flex items-center justify-center gap-2">
          <Image src="/lobsterlogo.png" alt="Swarm Logo" width={24} height={24} />
          <span className="text-sm font-bold text-white">Swarm Protocol</span>
        </div>
        <p className="text-xs text-muted-foreground uppercase tracking-widest">
          Enterprise AI Fleet Orchestration &copy; 2026
        </p>
      </footer>
    </div>
  );
}

export default function LandingPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-black">
        <div className="text-amber-500 text-xl">Loading...</div>
      </div>
    }>
      <LandingPageContent />
    </Suspense>
  );
}
