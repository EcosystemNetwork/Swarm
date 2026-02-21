"use client";

import { useEffect, useCallback, useRef } from "react";

const COLORS = ["#c084fc", "#a855f7", "#e9d5ff", "#7c3aed", "#f0abfc", "#fbbf24"];

export default function SparkleTrail() {
  const lastSpawn = useRef(0);

  const spawnSparkle = useCallback((x: number, y: number) => {
    const el = document.createElement("div");
    el.className = "sparkle";

    const size = Math.random() * 8 + 4;
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const driftX = (Math.random() - 0.5) * 30;
    const driftY = (Math.random() - 0.5) * 30 - 10;

    el.style.left = `${x - size / 2}px`;
    el.style.top = `${y - size / 2}px`;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.background = `radial-gradient(circle, ${color}, transparent)`;
    el.style.boxShadow = `0 0 ${size}px ${color}`;
    el.style.setProperty("--drift-x", `${driftX}px`);
    el.style.setProperty("--drift-y", `${driftY}px`);

    document.body.appendChild(el);
    setTimeout(() => el.remove(), 600);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const now = Date.now();
      if (now - lastSpawn.current < 30) return; // throttle
      lastSpawn.current = now;

      // Spawn 2-3 sparkles per tick
      const count = Math.floor(Math.random() * 2) + 2;
      for (let i = 0; i < count; i++) {
        const offsetX = (Math.random() - 0.5) * 12;
        const offsetY = (Math.random() - 0.5) * 12;
        spawnSparkle(e.clientX + offsetX, e.clientY + offsetY);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [spawnSparkle]);

  return null;
}
