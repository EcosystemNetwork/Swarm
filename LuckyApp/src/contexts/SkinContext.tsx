/** SkinContext — Manages the active UI skin. Integrates with marketplace for installable skins. */
"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

export interface SkinMeta {
  id: string;
  name: string;
  description: string;
  colors: [string, string, string]; // [primary, secondary, accent]
  /** Marketplace skill ID (for skins that require installation) */
  marketId?: string;
  /** Whether this skin is always available without installation */
  builtin?: boolean;
}

/** All known skins. Classic is builtin (always available). Others map to marketplace items. */
export const SKINS: SkinMeta[] = [
  { id: "classic", name: "Classic", description: "Amber & gold — the original Swarm look", colors: ["#FFD700", "#FFA500", "#FF8C00"], builtin: true },
  { id: "futuristic", name: "Futuristic", description: "Cyan & magenta — Arwes-inspired sci-fi", colors: ["#26dafd", "#fc26fa", "#be26fc"], marketId: "skin-futuristic" },
  { id: "retro-terminal", name: "Retro Terminal", description: "CRT phosphor amber with scanlines & vignette", colors: ["#ff6a00", "#994400", "#331a00"], marketId: "skin-retro-terminal" },
  { id: "cyberpunk", name: "Cyberpunk", description: "Neon pink & electric purple — Night City vibes", colors: ["#ff1493", "#8a2be2", "#c026d3"], marketId: "skin-cyberpunk" },
  { id: "midnight", name: "Midnight", description: "Deep indigo & violet — refined elegance", colors: ["#6366f1", "#a855f7", "#818cf8"], marketId: "skin-midnight" },
  { id: "hacker", name: "Hacker Green", description: "Green phosphor terminal — Matrix aesthetic", colors: ["#00ff41", "#00802b", "#003311"], marketId: "skin-hacker" },
];

const STORAGE_KEY = "swarm-skin";
const DEFAULT_SKIN = "classic";

interface SkinContextValue {
  skin: string;
  setSkin: (id: string) => void;
  skins: SkinMeta[];
  /** Subset of skins available to this user (builtin + installed) */
  availableSkins: SkinMeta[];
  /** Set of installed marketplace skin IDs */
  installedSkinIds: Set<string>;
  /** Refresh installed skins (call after marketplace install/uninstall) */
  refreshInstalled: (ownedSkillIds: string[]) => void;
}

const SkinContext = createContext<SkinContextValue>({
  skin: DEFAULT_SKIN,
  setSkin: () => {},
  skins: SKINS,
  availableSkins: SKINS.filter((s) => s.builtin),
  installedSkinIds: new Set(),
  refreshInstalled: () => {},
});

function applySkinClass(skinId: string) {
  const root = document.documentElement;
  root.classList.forEach((cls) => {
    if (cls.startsWith("skin-")) root.classList.remove(cls);
  });
  if (skinId !== "classic") {
    root.classList.add(`skin-${skinId}`);
  }
}

export function SkinProvider({ children }: { children: ReactNode }) {
  const [skin, setSkinState] = useState(DEFAULT_SKIN);
  const [installedSkinIds, setInstalledSkinIds] = useState<Set<string>>(new Set());

  const availableSkins = SKINS.filter(
    (s) => s.builtin || (s.marketId && installedSkinIds.has(s.marketId))
  );

  // Read from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const valid = SKINS.some((s) => s.id === stored);
    const initial = valid ? stored! : DEFAULT_SKIN;
    setSkinState(initial);
    applySkinClass(initial);
  }, []);

  const setSkin = useCallback((id: string) => {
    if (!SKINS.some((s) => s.id === id)) return;
    setSkinState(id);
    localStorage.setItem(STORAGE_KEY, id);
    applySkinClass(id);
  }, []);

  const refreshInstalled = useCallback((ownedSkillIds: string[]) => {
    const skinIds = new Set<string>();
    for (const skillId of ownedSkillIds) {
      if (skillId.startsWith("skin-")) skinIds.add(skillId);
    }
    setInstalledSkinIds(skinIds);
  }, []);

  // If the currently active skin gets uninstalled, revert to classic
  useEffect(() => {
    const current = SKINS.find((s) => s.id === skin);
    if (current && !current.builtin && current.marketId && !installedSkinIds.has(current.marketId)) {
      setSkin("classic");
    }
  }, [installedSkinIds, skin, setSkin]);

  return (
    <SkinContext.Provider value={{ skin, setSkin, skins: SKINS, availableSkins, installedSkinIds, refreshInstalled }}>
      {children}
    </SkinContext.Provider>
  );
}

export function useSkin() {
  return useContext(SkinContext);
}
