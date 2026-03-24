/** Office3D — React Three Fiber immersive office scene */
"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useRef, useMemo, useState, useEffect } from "react";
import * as THREE from "three";
import { useOffice } from "./office-store";
import { STATUS_COLORS } from "./types";
import type { VisualAgent, AgentVisualStatus } from "./types";

/* ═══════════════════════════════════════════════════════════════
   Office Floor — Grid floor with subtle pattern
   ═══════════════════════════════════════════════════════════════ */

function OfficeFloor() {
  return (
    <group position={[0, -0.01, 0]}>
      <gridHelper args={[30, 60, "#1a2332", "#141c28"]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#0a0f18" metalness={0.5} roughness={0.7} />
      </mesh>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Desk — Agent workstation
   ═══════════════════════════════════════════════════════════════ */

const deskMaterial = new THREE.MeshStandardMaterial({
  color: "#1e2738",
  metalness: 0.6,
  roughness: 0.4,
});

const monitorMaterial = new THREE.MeshStandardMaterial({
  color: "#0d1117",
  metalness: 0.8,
  roughness: 0.2,
});

function Desk({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Desk surface */}
      <mesh material={deskMaterial} position={[0, 0.45, 0]}>
        <boxGeometry args={[1.2, 0.05, 0.6]} />
      </mesh>
      {/* Desk legs */}
      {[[-0.5, 0, -0.2], [0.5, 0, -0.2], [-0.5, 0, 0.2], [0.5, 0, 0.2]].map((leg, i) => (
        <mesh key={i} material={deskMaterial} position={[leg[0], 0.22, leg[2]]}>
          <cylinderGeometry args={[0.02, 0.02, 0.44, 6]} />
        </mesh>
      ))}
      {/* Monitor */}
      <mesh material={monitorMaterial} position={[0, 0.72, -0.15]}>
        <boxGeometry args={[0.5, 0.35, 0.02]} />
      </mesh>
      {/* Monitor stand */}
      <mesh material={deskMaterial} position={[0, 0.55, -0.15]}>
        <cylinderGeometry args={[0.02, 0.04, 0.15, 6]} />
      </mesh>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════════
   AgentFigure — Procedural humanoid at a desk
   ═══════════════════════════════════════════════════════════════ */

function AgentFigure({
  position,
  agent,
  selected,
  onClick,
}: {
  position: [number, number, number];
  agent: VisualAgent;
  selected: boolean;
  onClick: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Mesh>(null);

  const statusColor = STATUS_COLORS[agent.status];
  const isActive = agent.status !== "offline" && agent.status !== "idle";

  const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#2a3548",
    metalness: 0.3,
    roughness: 0.6,
    emissive: new THREE.Color(statusColor),
    emissiveIntensity: isActive ? 0.15 : 0.02,
  }), [statusColor, isActive]);

  const headMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#e8c4a0",
    metalness: 0.1,
    roughness: 0.8,
  }), []);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;

    // Breathing/idle bob
    groupRef.current.position.y = position[1] + Math.sin(t * 1.2 + position[0]) * 0.005;

    // Head movement (thinking/active)
    if (headRef.current && isActive) {
      headRef.current.rotation.y = Math.sin(t * 0.5 + position[2]) * 0.1;
    }

    // Typing animation for active agents — slight body lean
    if (isActive && groupRef.current) {
      groupRef.current.rotation.x = Math.sin(t * 3) * 0.01;
    }
  });

  return (
    <group ref={groupRef} position={position} onClick={(e) => { e.stopPropagation(); onClick(); }}>
      {/* Body (torso) - sitting position */}
      <mesh material={bodyMat} position={[0, 0.55, 0.1]}>
        <boxGeometry args={[0.3, 0.35, 0.2]} />
      </mesh>

      {/* Head */}
      <mesh ref={headRef} material={headMat} position={[0, 0.82, 0.1]}>
        <sphereGeometry args={[0.1, 12, 12]} />
      </mesh>

      {/* Arms (reaching for keyboard) */}
      <mesh material={bodyMat} position={[-0.22, 0.48, -0.05]} rotation={[0.3, 0, -0.1]}>
        <boxGeometry args={[0.08, 0.25, 0.08]} />
      </mesh>
      <mesh material={bodyMat} position={[0.22, 0.48, -0.05]} rotation={[0.3, 0, 0.1]}>
        <boxGeometry args={[0.08, 0.25, 0.08]} />
      </mesh>

      {/* Legs (under desk) */}
      <mesh material={bodyMat} position={[-0.08, 0.25, 0.15]}>
        <boxGeometry args={[0.1, 0.3, 0.1]} />
      </mesh>
      <mesh material={bodyMat} position={[0.08, 0.25, 0.15]}>
        <boxGeometry args={[0.1, 0.3, 0.1]} />
      </mesh>

      {/* Status light (floating above head) */}
      <mesh position={[0, 1.0, 0.1]}>
        <sphereGeometry args={[0.03, 8, 8]} />
        <meshStandardMaterial
          color={statusColor}
          emissive={statusColor}
          emissiveIntensity={2}
        />
      </mesh>

      {/* Selection ring */}
      {selected && (
        <mesh position={[0, 0.01, 0.1]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.35, 0.4, 24]} />
          <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={1} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Meeting Room — Glass-walled room
   ═══════════════════════════════════════════════════════════════ */

function MeetingRoom({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <planeGeometry args={[3, 2.5]} />
        <meshStandardMaterial color="#0d1520" metalness={0.4} roughness={0.6} opacity={0.8} transparent />
      </mesh>
      {/* Walls (glass) */}
      {[[-1.5, 0.6, 0], [1.5, 0.6, 0], [0, 0.6, -1.25], [0, 0.6, 1.25]].map((pos, i) => (
        <mesh key={i} position={[pos[0], pos[1], pos[2]]} rotation={[0, i < 2 ? Math.PI / 2 : 0, 0]}>
          <planeGeometry args={[i < 2 ? 2.5 : 3, 1.2]} />
          <meshStandardMaterial color="#3b82f6" metalness={0.9} roughness={0.1} opacity={0.08} transparent side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* Table */}
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.6, 0.6, 0.04, 16]} />
        <meshStandardMaterial color="#1e2738" metalness={0.5} roughness={0.5} />
      </mesh>
      {/* Label */}
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════════
   AutoCamera — Slow orbit
   ═══════════════════════════════════════════════════════════════ */

function AutoCamera() {
  useFrame(({ camera, clock }) => {
    const t = clock.elapsedTime;
    const radius = 12;
    camera.position.x = Math.sin(t * 0.03) * radius;
    camera.position.z = Math.cos(t * 0.03) * radius;
    camera.position.y = 6 + Math.sin(t * 0.02) * 0.5;
    camera.lookAt(0, 0.5, 0);
  });
  return null;
}

/* ═══════════════════════════════════════════════════════════════
   Office3D — Main export
   ═══════════════════════════════════════════════════════════════ */

const DESK_POSITIONS: [number, number, number][] = [
  [-4, 0, -1], [-2, 0, -1], [0, 0, -1], [2, 0, -1],
  [-4, 0, 2], [-2, 0, 2], [0, 0, 2], [2, 0, 2],
];

export function Office3D() {
  const { state, dispatch } = useOffice();
  const agents = Array.from(state.agents.values());
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className="w-full aspect-video rounded-lg border border-border bg-card flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading 3D scene...</p>
      </div>
    );
  }

  return (
    <div className="w-full aspect-video rounded-lg border border-border overflow-hidden bg-[#060a12]">
      <Canvas
        camera={{ position: [0, 6, 12], fov: 50 }}
        style={{ width: "100%", height: "100%" }}
        gl={{ alpha: false, antialias: true, powerPreference: "low-power" }}
      >
        <color attach="background" args={["#060a12"]} />
        <fog attach="fog" args={["#060a12", 12, 28]} />

        {/* Lighting */}
        <ambientLight intensity={0.25} color="#c4d4f0" />
        <directionalLight position={[8, 12, 6]} intensity={0.7} castShadow />
        <directionalLight position={[-5, 8, -3]} intensity={0.2} color="#3b82f6" />
        <pointLight position={[0, 3, 0]} intensity={0.3} color="#fbbf24" />

        <OfficeFloor />

        {/* Desks + Agents */}
        {DESK_POSITIONS.map((pos, i) => {
          const agent = agents[i];
          return (
            <group key={i}>
              <Desk position={pos} />
              {agent && agent.status !== "offline" && (
                <AgentFigure
                  position={pos}
                  agent={agent}
                  selected={agent.id === state.selectedAgentId}
                  onClick={() => dispatch({ type: "SELECT_AGENT", id: agent.id })}
                />
              )}
            </group>
          );
        })}

        {/* Meeting Room */}
        <MeetingRoom position={[5.5, 0, -1]} />

        <AutoCamera />
      </Canvas>
    </div>
  );
}
