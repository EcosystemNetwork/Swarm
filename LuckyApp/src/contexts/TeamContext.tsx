'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { useDynamicContext, getAuthToken } from '@dynamic-labs/sdk-react-core';

export interface Team {
  id: string;
  name: string;
  description?: string;
}

interface TeamContextValue {
  currentTeam: Team | null;
  teams: Team[];
  loading: boolean;
  error: string | null;
  selectTeam: (teamId: string) => void;
  refreshTeams: () => Promise<void>;
  getToken: () => Promise<string | null>;
  createTeam: (name: string, description?: string) => void;
}

const TeamContext = createContext<TeamContextValue>({
  currentTeam: null,
  teams: [],
  loading: false,
  error: null,
  selectTeam: () => {},
  refreshTeams: async () => {},
  getToken: async () => null,
  createTeam: () => {},
});

export function useTeam() {
  return useContext(TeamContext);
}

const TEAM_STORAGE_KEY = 'luckyst_selected_team_id';
const TEAMS_STORAGE_KEY = 'luckyst_teams';

function loadTeamsFromStorage(): Team[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(TEAMS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveTeamsToStorage(teams: Team[]) {
  localStorage.setItem(TEAMS_STORAGE_KEY, JSON.stringify(teams));
}

export function TeamProvider({ children }: { children: ReactNode }) {
  const { primaryWallet } = useDynamicContext();
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentTeam, setCurrentTeam] = useState<Team | null>(null);

  // Hydrate from localStorage on mount (client only)
  useEffect(() => {
    const allTeams = loadTeamsFromStorage();
    const saved = localStorage.getItem(TEAM_STORAGE_KEY);
    if (allTeams.length > 0) {
      setTeams(allTeams);
      setCurrentTeam(allTeams.find(t => t.id === saved) || allTeams[0]);
    }
  }, []);
  const [loading] = useState(false);
  const [error] = useState<string | null>(null);

  const getToken = useCallback(async (): Promise<string | null> => {
    return getAuthToken() || null;
  }, []);

  const refreshTeams = useCallback(async () => {
    const loaded = loadTeamsFromStorage();
    setTeams(loaded);
    if (loaded.length > 0 && !loaded.find(t => t.id === currentTeam?.id)) {
      setCurrentTeam(loaded[0]);
    }
  }, [currentTeam?.id]);

  const selectTeam = useCallback((teamId: string) => {
    const team = teams.find(t => t.id === teamId);
    if (team) {
      setCurrentTeam(team);
      localStorage.setItem(TEAM_STORAGE_KEY, teamId);
    }
  }, [teams]);

  const createTeam = useCallback((name: string, description?: string) => {
    const newTeam: Team = {
      id: crypto.randomUUID(),
      name,
      description,
    };
    const updated = [...teams, newTeam];
    setTeams(updated);
    setCurrentTeam(newTeam);
    saveTeamsToStorage(updated);
    localStorage.setItem(TEAM_STORAGE_KEY, newTeam.id);
  }, [teams]);

  return (
    <TeamContext.Provider value={{
      currentTeam,
      teams,
      loading,
      error,
      selectTeam,
      refreshTeams,
      getToken,
      createTeam,
    }}>
      {children}
    </TeamContext.Provider>
  );
}
