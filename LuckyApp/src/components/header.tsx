'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { ConnectButton, useActiveAccount } from 'thirdweb/react';
import { createThirdwebClient } from 'thirdweb';
import { base, defineChain } from 'thirdweb/chains';
import { useOrg } from '@/contexts/OrgContext';
import { getProjectsByOrg, createProject, createOrganization, type Project } from '@/lib/firestore';
import GradientText from '@/components/reactbits/GradientText';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

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
  { href: '/jobs', label: 'Jobs' },
  { href: '/chat', label: 'Channels' },
  { href: '/settings', label: '⚙️' },
];

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const account = useActiveAccount();
  const isConnected = !!account;
  const { currentOrg, organizations, selectOrg, refreshOrgs } = useOrg();
  const [projects, setProjects] = useState<Project[]>([]);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgDescription, setNewOrgDescription] = useState('');
  const [creatingOrg, setCreatingOrg] = useState(false);

  const projectMatch = pathname.match(/\/swarms\/([^/]+)/);
  const currentProjectId = projectMatch?.[1] || '';

  const fetchProjects = useCallback(async () => {
    if (!currentOrg) { setProjects([]); return; }
    try {
      const res = await getProjectsByOrg(currentOrg.id);
      setProjects(res);
    } catch { setProjects([]); }
  }, [currentOrg]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const handleCreateOrg = async () => {
    if (!newOrgName.trim() || !account?.address) return;
    setCreatingOrg(true);
    try {
      const id = await createOrganization({
        name: newOrgName.trim(),
        description: newOrgDescription.trim() || '',
        ownerAddress: account.address,
        members: [account.address],
        createdAt: null,
      });
      setNewOrgName('');
      setNewOrgDescription('');
      setShowCreateOrg(false);
      await refreshOrgs();
      selectOrg(id);
    } catch (err) {
      console.error('Failed to create org:', err);
    } finally {
      setCreatingOrg(false);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim() || !currentOrg) return;
    setCreatingProject(true);
    try {
      const id = await createProject({
        name: newProjectName.trim(),
        description: '',
        orgId: currentOrg.id,
        status: 'active',
        agentIds: [],
        createdAt: null,
      });
      setNewProjectName('');
      setShowCreateProject(false);
      await fetchProjects();
      router.push(`/swarms/${id}`);
    } catch (err) {
      console.error('Failed to create project:', err);
    } finally {
      setCreatingProject(false);
    }
  };

  return (
    <>
    <header className="sticky top-0 z-50 w-full border-b border-amber-500/10 bg-black/95 backdrop-blur supports-[backdrop-filter]:bg-black/60 neon-glow-gold">
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/lobsterlogo.png" alt="Swarm Logo" width={40} height={40} />
            <GradientText colors={['#FFD700', '#FFA500', '#FF8C00']} animationSpeed={4} className="text-xl font-bold text-glow-gold">Swarm</GradientText>
          </Link>
          {isConnected && (
            <nav className="hidden md:flex items-center gap-6">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative text-sm font-medium transition-all duration-300 ${pathname === link.href
                      ? 'text-amber-400 text-glow-amber'
                      : 'text-muted-foreground hover:text-amber-300'
                    }`}
                >
                  {link.label}
                  {pathname === link.href && (
                    <span className="absolute -bottom-[17px] left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-400 to-transparent animate-pulse-subtle" />
                  )}
                </Link>
              ))}
            </nav>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isConnected && currentOrg && organizations.length > 0 && (
            <>
              {currentOrg.logoUrl && (
                <img src={currentOrg.logoUrl} alt="" className="w-6 h-6 rounded object-cover" />
              )}
              <select
                className="rounded-md border border-border bg-card px-2 py-1 text-sm text-muted-foreground max-w-[160px]"
                value={currentOrg.id}
                onChange={(e) => {
                  if (e.target.value === '__create_org__') {
                    setShowCreateOrg(true);
                    e.target.value = currentOrg.id;
                  } else {
                    selectOrg(e.target.value);
                  }
                }}
                title="Switch Organization"
              >
                {organizations.map(org => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
                <option value="__create_org__">+ New Org</option>
              </select>
              <span className="text-muted-foreground text-sm">/</span>
              <select
                className="rounded-md border border-border bg-card px-2 py-1 text-sm text-muted-foreground max-w-[160px]"
                value={currentProjectId}
                onChange={(e) => {
                  if (e.target.value === '__create__') {
                    setShowCreateProject(true);
                    e.target.value = currentProjectId;
                  } else if (e.target.value) {
                    router.push(`/swarms/${e.target.value}`);
                  }
                }}
                title="Switch Project"
              >
                <option value="">Select project...</option>
                {projects.map(proj => (
                  <option key={proj.id} value={proj.id}>📁 {proj.name}</option>
                ))}
                <option value="__create__">+ Project</option>
              </select>
            </>
          )}
          <ConnectButton client={client} chains={[base, hedera]} />
        </div>
      </div>
    </header>
    <Dialog open={showCreateProject} onOpenChange={setShowCreateProject}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <Input
            placeholder="Project name"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateProject(); }}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowCreateProject(false)}>Cancel</Button>
            <Button
              onClick={handleCreateProject}
              disabled={!newProjectName.trim() || creatingProject}
              className="bg-amber-500 hover:bg-amber-600 text-black"
            >
              {creatingProject ? 'Creating...' : 'Create Project'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    <Dialog open={showCreateOrg} onOpenChange={setShowCreateOrg}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle>Create New Organization</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <Input
            placeholder="Organization name"
            value={newOrgName}
            onChange={(e) => setNewOrgName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateOrg(); }}
            autoFocus
          />
          <Input
            placeholder="Description (optional)"
            value={newOrgDescription}
            onChange={(e) => setNewOrgDescription(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateOrg(); }}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowCreateOrg(false)}>Cancel</Button>
            <Button
              onClick={handleCreateOrg}
              disabled={!newOrgName.trim() || creatingOrg}
              className="bg-amber-500 hover:bg-amber-600 text-black"
            >
              {creatingOrg ? 'Creating...' : 'Create Organization'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
