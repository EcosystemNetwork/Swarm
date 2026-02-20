'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DynamicWidget, useDynamicContext, DynamicConnectButton } from '@dynamic-labs/sdk-react-core';
import { useTeam } from '@/contexts/TeamContext';

const navLinks = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/swarms', label: 'Swarms' },
  { href: '/agents', label: 'Agents' },
  { href: '/chat', label: 'Chat' },
  { href: '/settings', label: '⚙️' },
];

export function Header() {
  const pathname = usePathname();
  const { primaryWallet } = useDynamicContext();
  const { currentTeam, teams, selectTeam } = useTeam();
  const isConnected = !!primaryWallet;

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold text-green-500">🍀 LuckySt</span>
          </Link>
          {isConnected && (
            <nav className="hidden md:flex items-center gap-6">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-sm font-medium transition-colors ${
                    pathname === link.href
                      ? 'text-gray-900'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isConnected && currentTeam && teams.length > 0 && (
            <select
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 max-w-[160px]"
              value={currentTeam.id}
              onChange={(e) => selectTeam(e.target.value)}
              title="Switch Team"
            >
              {teams.map(team => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
          )}
          {isConnected ? (
            <DynamicWidget />
          ) : (
            <DynamicConnectButton>
              <button className="px-6 py-2 text-sm font-medium rounded-md bg-green-500 hover:bg-green-600 text-white transition-colors">
                Connect Wallet
              </button>
            </DynamicConnectButton>
          )}
        </div>
      </div>
    </header>
  );
}
