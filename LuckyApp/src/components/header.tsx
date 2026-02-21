'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { ConnectButton, useActiveAccount } from 'thirdweb/react';
import { createThirdwebClient } from 'thirdweb';
import { base, defineChain } from 'thirdweb/chains';
import { useOrg } from '@/contexts/OrgContext';

const client = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || 'cbd8abcfa13db759ca2f5fa7d8a5a5e5',
});

const hedera = defineChain({
  id: 295,
  name: 'Hedera',
  rpc: 'https://mainnet.hashio.io/api',
});

const navLinks = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/swarms', label: 'Projects' },
  { href: '/agents', label: 'Agents' },
  { href: '/chat', label: 'Channels' },
  { href: '/settings', label: '⚙️' },
];

export function Header() {
  const pathname = usePathname();
  const account = useActiveAccount();
  const isConnected = !!account;
  const { currentOrg, organizations, selectOrg } = useOrg();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-black/95 backdrop-blur supports-[backdrop-filter]:bg-black/60">
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/lobsterlogo.png" alt="Swarm Logo" width={40} height={40} />
            <span className="text-xl font-bold text-[#FFD700]">Swarm</span>
          </Link>
          {isConnected && (
            <nav className="hidden md:flex items-center gap-6">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-sm font-medium transition-colors ${pathname === link.href
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
          {isConnected && currentOrg && organizations.length > 0 && (
            <select
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 max-w-[160px]"
              value={currentOrg.id}
              onChange={(e) => selectOrg(e.target.value)}
              title="Switch Organization"
            >
              {organizations.map(org => (
                <option key={org.id} value={org.id}>{org.name}</option>
              ))}
            </select>
          )}
          <ConnectButton client={client} chains={[base, hedera]} />
        </div>
      </div>
    </header>
  );
}
