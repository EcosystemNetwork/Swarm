"use client";

import { useSkin } from "@/contexts/SkinContext";

export interface ChartPalette {
  primary: string;
  secondary: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
  muted: string;
  grid: string;
  tooltip: { bg: string; border: string; text: string };
  task: { done: string; inProgress: string; todo: string };
  agent: { online: string; busy: string; offline: string };
}

const SKIN_PALETTES: Record<string, ChartPalette> = {
  classic: {
    primary: "#f59e0b",
    secondary: "#d97706",
    accent: "#fbbf24",
    success: "#10b981",
    warning: "#f59e0b",
    danger: "#ef4444",
    muted: "#6b7280",
    grid: "rgba(255,255,255,0.06)",
    tooltip: { bg: "rgba(0,0,0,0.85)", border: "rgba(245,158,11,0.3)", text: "#f5f5f5" },
    task: { done: "#10b981", inProgress: "#f59e0b", todo: "#4b5563" },
    agent: { online: "#10b981", busy: "#f59e0b", offline: "#4b5563" },
  },
  futuristic: {
    primary: "#26dafd",
    secondary: "#fc26fa",
    accent: "#be26fc",
    success: "#00e5a0",
    warning: "#26dafd",
    danger: "#ff4d6a",
    muted: "#5b6b7d",
    grid: "rgba(38,218,253,0.06)",
    tooltip: { bg: "rgba(0,10,20,0.9)", border: "rgba(38,218,253,0.3)", text: "#e0f7ff" },
    task: { done: "#00e5a0", inProgress: "#26dafd", todo: "#3a4a5c" },
    agent: { online: "#00e5a0", busy: "#26dafd", offline: "#3a4a5c" },
  },
  "retro-terminal": {
    primary: "#ff6a00",
    secondary: "#994400",
    accent: "#ff9d00",
    success: "#00cc44",
    warning: "#ff6a00",
    danger: "#ff3333",
    muted: "#665533",
    grid: "rgba(255,106,0,0.06)",
    tooltip: { bg: "rgba(10,5,0,0.9)", border: "rgba(255,106,0,0.3)", text: "#ffd4a8" },
    task: { done: "#00cc44", inProgress: "#ff6a00", todo: "#4a3a2a" },
    agent: { online: "#00cc44", busy: "#ff6a00", offline: "#4a3a2a" },
  },
  cyberpunk: {
    primary: "#ff1493",
    secondary: "#8a2be2",
    accent: "#c026d3",
    success: "#00ff88",
    warning: "#ff1493",
    danger: "#ff0044",
    muted: "#5a3a6a",
    grid: "rgba(255,20,147,0.06)",
    tooltip: { bg: "rgba(15,0,20,0.9)", border: "rgba(255,20,147,0.3)", text: "#ffe0f0" },
    task: { done: "#00ff88", inProgress: "#ff1493", todo: "#4a2a5a" },
    agent: { online: "#00ff88", busy: "#ff1493", offline: "#4a2a5a" },
  },
  midnight: {
    primary: "#6366f1",
    secondary: "#a855f7",
    accent: "#818cf8",
    success: "#34d399",
    warning: "#6366f1",
    danger: "#f43f5e",
    muted: "#4a4a6a",
    grid: "rgba(99,102,241,0.06)",
    tooltip: { bg: "rgba(5,0,20,0.9)", border: "rgba(99,102,241,0.3)", text: "#e0e0ff" },
    task: { done: "#34d399", inProgress: "#6366f1", todo: "#3a3a5a" },
    agent: { online: "#34d399", busy: "#6366f1", offline: "#3a3a5a" },
  },
  hacker: {
    primary: "#00ff41",
    secondary: "#00802b",
    accent: "#66ff8c",
    success: "#00ff41",
    warning: "#ccff00",
    danger: "#ff3333",
    muted: "#2a5a2a",
    grid: "rgba(0,255,65,0.06)",
    tooltip: { bg: "rgba(0,10,0,0.9)", border: "rgba(0,255,65,0.3)", text: "#ccffcc" },
    task: { done: "#00ff41", inProgress: "#ccff00", todo: "#1a3a1a" },
    agent: { online: "#00ff41", busy: "#ccff00", offline: "#1a3a1a" },
  },
};

export function useChartPalette(): ChartPalette {
  const { skin } = useSkin();
  return SKIN_PALETTES[skin] || SKIN_PALETTES.classic;
}
