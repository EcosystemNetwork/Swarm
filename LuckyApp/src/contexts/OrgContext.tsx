'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { useActiveAccount } from 'thirdweb/react';
import { 
  createOrganization, 
  getOrganizationsByWallet, 
  type Organization 
} from '@/lib/firestore';

interface OrgContextValue {
  /** Currently selected organization */
  currentOrg: Organization | null;
  /** All organizations the user belongs to */
  organizations: Organization[];
  /** Whether we're still loading orgs */
  loading: boolean;
  /** Error message if any */
  error: string | null;
  /** Switch to a different org */
  selectOrg: (orgId: string) => void;
  /** Refresh the org list from Firestore */
  refreshOrgs: () => Promise<void>;
  /** Create a new organization */
  createOrg: (name: string, description?: string) => Promise<void>;
  /** Get a dummy token (for compatibility) */
  getToken: () => Promise<string | null>;
}

const OrgContext = createContext<OrgContextValue>({
  currentOrg: null,
  organizations: [],
  loading: true,
  error: null,
  selectOrg: () => {},
  refreshOrgs: async () => {},
  createOrg: async () => {},
  getToken: async () => null,
});

export function useOrg() {
  return useContext(OrgContext);
}

const ORG_STORAGE_KEY = 'swarm_selected_org_id';

export function OrgProvider({ children }: { children: ReactNode }) {
  const account = useActiveAccount();
  const address = account?.address;
  
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getToken = useCallback(async (): Promise<string | null> => {
    // For compatibility - return null since we're not using Dynamic.xyz
    return null;
  }, []);

  const fetchOrgs = useCallback(async (walletAddress: string) => {
    try {
      setError(null);
      const orgs = await getOrganizationsByWallet(walletAddress);
      setOrganizations(orgs);

      // Restore previously selected org
      const savedOrgId = localStorage.getItem(ORG_STORAGE_KEY);
      const savedOrg = orgs.find(o => o.id === savedOrgId);

      if (savedOrg) {
        setCurrentOrg(savedOrg);
      } else if (orgs.length === 1) {
        // Auto-select if only one org
        setCurrentOrg(orgs[0]);
        localStorage.setItem(ORG_STORAGE_KEY, orgs[0].id);
      } else if (orgs.length > 1) {
        // Multiple orgs - select first one as default
        setCurrentOrg(orgs[0]);
        localStorage.setItem(ORG_STORAGE_KEY, orgs[0].id);
      } else {
        // No orgs found
        setCurrentOrg(null);
        localStorage.removeItem(ORG_STORAGE_KEY);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load organizations';
      console.error('Failed to fetch organizations:', err);
      setError(message);
    }
  }, []);

  const refreshOrgs = useCallback(async () => {
    if (!address) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    await fetchOrgs(address);
    setLoading(false);
  }, [address, fetchOrgs]);

  const selectOrg = useCallback((orgId: string) => {
    const org = organizations.find(o => o.id === orgId);
    if (org) {
      setCurrentOrg(org);
      localStorage.setItem(ORG_STORAGE_KEY, orgId);
    }
  }, [organizations]);

  const createOrg = useCallback(async (name: string, description?: string) => {
    if (!address) {
      throw new Error('Wallet not connected');
    }

    try {
      setError(null);
      const orgId = await createOrganization({
        name,
        description: description || '',
        ownerAddress: address,
        members: [address], // Owner is also a member
        createdAt: new Date(),
      });

      // Refresh orgs to get the new one
      await refreshOrgs();

      // Auto-select the new org
      const newOrg = organizations.find(o => o.id === orgId) || 
                    (await getOrganizationsByWallet(address)).find(o => o.id === orgId);
      
      if (newOrg) {
        setCurrentOrg(newOrg);
        localStorage.setItem(ORG_STORAGE_KEY, orgId);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create organization';
      console.error('Failed to create organization:', err);
      setError(message);
      throw err;
    }
  }, [address, refreshOrgs, organizations]);

  // Load orgs when wallet connects
  useEffect(() => {
    if (address) {
      refreshOrgs();
    } else {
      // No wallet connected - clear state
      setOrganizations([]);
      setCurrentOrg(null);
      setLoading(false);
      localStorage.removeItem(ORG_STORAGE_KEY);
    }
  }, [address, refreshOrgs]);

  return (
    <OrgContext.Provider value={{
      currentOrg,
      organizations,
      loading,
      error,
      selectOrg,
      refreshOrgs,
      createOrg,
      getToken,
    }}>
      {children}
    </OrgContext.Provider>
  );
}