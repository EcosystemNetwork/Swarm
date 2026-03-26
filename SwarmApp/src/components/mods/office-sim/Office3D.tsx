/** Office3D — React Three Fiber immersive office with camera controls, speech bubbles, collab arcs, spawn effects */
"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html, Environment } from "@react-three/drei";
import { Suspense, useRef, useMemo, useState, useEffect } from "react";
import * as THREE from "three";
import { useOffice, getFilteredAgents } from "./office-store";
import { STATUS_COLORS } from "./types";
import type { VisualAgent, AgentVisualStatus, CameraMode } from "./types";
import type { OfficeTheme } from "./themes";
import { GltfAgent } from "./GltfAgent";
import { OfficeEnvironment } from "./OfficeEnvironment";
import { hashPick, SKIN_TONES, TOP_COLORS, BOTTOM_COLORS, HAIR_COLORS } from "./engine/avatar-generator";

/* ═══════════════════════════════════════════════════════════════
   Office Floor — Theme-aware floor with grid
   ═══════════════════════════════════════════════════════════════ */

function OfficeFloor({ theme }: { theme: OfficeTheme }) {
  const gridColor1 = useMemo(() => {
    const c = new THREE.Color(theme.floorColor);
    c.offsetHSL(0, 0, 0.06);
    return "#" + c.getHexString();
  }, [theme.floorColor]);
  const gridColor2 = useMemo(() => {
    const c = new THREE.Color(theme.floorColor);
    c.offsetHSL(0, 0, 0.03);
    return "#" + c.getHexString();
  }, [theme.floorColor]);

  return (
    <group position={[0, -0.01, 0]}>
      <gridHelper args={[30, 60, gridColor1, gridColor2]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial
          color={theme.floorColor}
          metalness={theme.floorMetalness}
          roughness={theme.floorRoughness}
        />
      </mesh>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Desk — Theme-aware agent workstation
   ═══════════════════════════════════════════════════════════════ */

function Desk({ position, theme }: { position: [number, number, number]; theme: OfficeTheme }) {
  const deskMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: theme.deskColor,
        metalness: theme.deskMetalness,
        roughness: theme.deskRoughness,
      }),
    [theme.deskColor, theme.deskMetalness, theme.deskRoughness],
  );

  const monitorMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: theme.monitorColor,
        metalness: 0.8,
        roughness: 0.2,
      }),
    [theme.monitorColor],
  );

  return (
    <group position={position}>
      {/* Desk surface */}
      <mesh material={deskMat} position={[0, 0.45, 0]}>
        <boxGeometry args={[1.2, 0.05, 0.6]} />
      </mesh>
      {/* Desk legs */}
      {[
        [-0.5, 0, -0.2],
        [0.5, 0, -0.2],
        [-0.5, 0, 0.2],
        [0.5, 0, 0.2],
      ].map((leg, i) => (
        <mesh key={i} material={deskMat} position={[leg[0], 0.22, leg[2]]}>
          <cylinderGeometry args={[0.02, 0.02, 0.44, 6]} />
        </mesh>
      ))}
      {/* Monitor */}
      <mesh material={monitorMat} position={[0, 0.72, -0.15]}>
        <boxGeometry args={[0.5, 0.35, 0.02]} />
      </mesh>
      {/* Monitor stand */}
      <mesh material={deskMat} position={[0, 0.55, -0.15]}>
        <cylinderGeometry args={[0.02, 0.04, 0.15, 6]} />
      </mesh>
      {/* Keyboard */}
      <mesh position={[0, 0.49, 0.1]}>
        <boxGeometry args={[0.35, 0.01, 0.12]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.5} roughness={0.5} />
      </mesh>
      {/* Mouse */}
      <mesh position={[0.28, 0.485, 0.12]} rotation={[0, 0.2, 0]}>
        <capsuleGeometry args={[0.015, 0.03, 4, 6]} />
        <meshStandardMaterial color="#2a2a2a" metalness={0.4} roughness={0.6} />
      </mesh>
      {/* Paper stack */}
      <mesh position={[-0.4, 0.5, 0.05]}>
        <boxGeometry args={[0.15, 0.02, 0.1]} />
        <meshStandardMaterial color="#e8e8e0" roughness={0.9} />
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
  dimmed,
  onClick,
}: {
  position: [number, number, number];
  agent: VisualAgent;
  selected: boolean;
  dimmed: boolean;
  onClick: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Mesh>(null);

  const statusColor = STATUS_COLORS[agent.status];
  const isActive =
    agent.status !== "offline" && agent.status !== "idle";

  // Per-agent deterministic colors from avatar-generator palettes
  const shirtColor = hashPick(agent.id, 4, TOP_COLORS);
  const skinTone = hashPick(agent.id, 0, SKIN_TONES);
  const pantsColor = hashPick(agent.id, 5, BOTTOM_COLORS);
  const hairColor = hashPick(agent.id, 1, HAIR_COLORS);

  const shirtMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: shirtColor,
        metalness: 0.2,
        roughness: 0.7,
        emissive: new THREE.Color(statusColor),
        emissiveIntensity: isActive ? 0.15 : 0.02,
        transparent: dimmed,
        opacity: dimmed ? 0.2 : 1,
      }),
    [shirtColor, statusColor, isActive, dimmed],
  );

  const skinMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: skinTone,
        metalness: 0.2,
        roughness: 0.7,
        emissive: new THREE.Color(statusColor),
        emissiveIntensity: isActive ? 0.15 : 0.02,
        transparent: dimmed,
        opacity: dimmed ? 0.2 : 1,
      }),
    [skinTone, statusColor, isActive, dimmed],
  );

  const pantsMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: pantsColor,
        metalness: 0.2,
        roughness: 0.7,
        emissive: new THREE.Color(statusColor),
        emissiveIntensity: isActive ? 0.15 : 0.02,
        transparent: dimmed,
        opacity: dimmed ? 0.2 : 1,
      }),
    [pantsColor, statusColor, isActive, dimmed],
  );

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;

    // Breathing/idle bob
    groupRef.current.position.y =
      position[1] + Math.sin(t * 1.2 + position[0]) * 0.005;

    // Head movement (thinking/active)
    if (headRef.current && isActive) {
      headRef.current.rotation.y =
        Math.sin(t * 0.5 + position[2]) * 0.1;
    }

    // Typing animation for active agents
    if (isActive && groupRef.current) {
      groupRef.current.rotation.x = Math.sin(t * 3) * 0.01;
    }
  });

  return (
    <group
      ref={groupRef}
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        if (!dimmed) onClick();
      }}
    >
      {/* Body (torso) — capsule */}
      <mesh material={shirtMat} position={[0, 0.55, 0.1]}>
        <capsuleGeometry args={[0.12, 0.15, 8, 12]} />
      </mesh>

      {/* Head — smoother sphere */}
      <mesh ref={headRef} material={skinMat} position={[0, 0.82, 0.1]}>
        <sphereGeometry args={[0.12, 16, 16]} />
      </mesh>

      {/* Eyes */}
      <mesh position={[-0.04, 0.83, 0.2]}>
        <sphereGeometry args={[0.015, 8, 8]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[0.04, 0.83, 0.2]}>
        <sphereGeometry args={[0.015, 8, 8]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>

      {/* Hair — half-sphere on top of head */}
      <mesh position={[0, 0.87, 0.08]}>
        <sphereGeometry args={[0.11, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={hairColor} roughness={0.8} transparent={dimmed} opacity={dimmed ? 0.2 : 1} />
      </mesh>

      {/* Arms — capsule */}
      <mesh
        material={shirtMat}
        position={[-0.22, 0.48, -0.05]}
        rotation={[0.3, 0, -0.1]}
      >
        <capsuleGeometry args={[0.035, 0.12, 6, 8]} />
      </mesh>
      <mesh
        material={shirtMat}
        position={[0.22, 0.48, -0.05]}
        rotation={[0.3, 0, 0.1]}
      >
        <capsuleGeometry args={[0.035, 0.12, 6, 8]} />
      </mesh>

      {/* Legs — capsule */}
      <mesh material={pantsMat} position={[-0.08, 0.25, 0.15]}>
        <capsuleGeometry args={[0.04, 0.12, 6, 8]} />
      </mesh>
      <mesh material={pantsMat} position={[0.08, 0.25, 0.15]}>
        <capsuleGeometry args={[0.04, 0.12, 6, 8]} />
      </mesh>

      {/* Status light */}
      <mesh position={[0, 1.0, 0.1]}>
        <sphereGeometry args={[0.03, 8, 8]} />
        <meshStandardMaterial
          color={statusColor}
          emissive={statusColor}
          emissiveIntensity={dimmed ? 0.2 : 2}
        />
      </mesh>

      {/* Selection ring */}
      {selected && (
        <mesh position={[0, 0.01, 0.1]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.35, 0.4, 24]} />
          <meshStandardMaterial
            color="#fbbf24"
            emissive="#fbbf24"
            emissiveIntensity={1}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Name tag (always visible) */}
      {!dimmed && (
        <Html position={[0, 1.15, 0.1]} center distanceFactor={8}>
          <div
            className="pointer-events-none select-none text-center whitespace-nowrap"
            style={{
              fontSize: "10px",
              color: "rgba(255,255,255,0.7)",
              textShadow: "0 1px 3px rgba(0,0,0,0.8)",
            }}
          >
            {agent.name}
          </div>
        </Html>
      )}

      {/* Speech bubble */}
      {agent.speechBubble && !dimmed && (
        <Html position={[0, 1.35, 0.1]} center distanceFactor={6}>
          <div
            className="pointer-events-none select-none"
            style={{
              background: "rgba(10, 15, 24, 0.92)",
              border: "1px solid hsl(48, 100%, 50%)",
              borderRadius: "6px",
              padding: "4px 10px",
              maxWidth: "180px",
              fontSize: "10px",
              color: "hsl(48, 100%, 85%)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              backdropFilter: "blur(4px)",
            }}
          >
            {agent.speechBubble}
          </div>
        </Html>
      )}
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Meeting Room — Glass-walled room
   ═══════════════════════════════════════════════════════════════ */

function MeetingRoom({
  position,
  theme,
}: {
  position: [number, number, number];
  theme: OfficeTheme;
}) {
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <planeGeometry args={[3, 2.5]} />
        <meshStandardMaterial
          color={theme.floorColor}
          metalness={0.4}
          roughness={0.6}
          opacity={0.8}
          transparent
        />
      </mesh>
      {/* Left side wall */}
      <mesh position={[-1.5, 0.6, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[2.5, 1.2]} />
        <meshStandardMaterial
          color={theme.accentColor}
          metalness={0.9}
          roughness={0.1}
          opacity={0.08}
          transparent
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Right side wall */}
      <mesh position={[1.5, 0.6, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[2.5, 1.2]} />
        <meshStandardMaterial
          color={theme.accentColor}
          metalness={0.9}
          roughness={0.1}
          opacity={0.08}
          transparent
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Back wall */}
      <mesh position={[0, 0.6, -1.25]}>
        <planeGeometry args={[3, 1.2]} />
        <meshStandardMaterial
          color={theme.accentColor}
          metalness={0.9}
          roughness={0.1}
          opacity={0.08}
          transparent
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Front wall — split into two panels with door gap */}
      {/* Left glass panel */}
      <mesh position={[-0.9, 0.6, 1.25]}>
        <planeGeometry args={[1.2, 1.2]} />
        <meshStandardMaterial color={theme.accentColor} metalness={0.9} roughness={0.1} opacity={0.08} transparent side={THREE.DoubleSide} />
      </mesh>
      {/* Right glass panel */}
      <mesh position={[0.9, 0.6, 1.25]}>
        <planeGeometry args={[1.2, 1.2]} />
        <meshStandardMaterial color={theme.accentColor} metalness={0.9} roughness={0.1} opacity={0.08} transparent side={THREE.DoubleSide} />
      </mesh>

      {/* Conference table */}
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.6, 0.6, 0.04, 16]} />
        <meshStandardMaterial
          color={theme.deskColor}
          metalness={theme.deskMetalness}
          roughness={theme.deskRoughness}
        />
      </mesh>

      {/* Office chairs */}
      {[
        { pos: [-0.4, 0, -0.4] as [number, number, number], rot: 0 },
        { pos: [0.4, 0, -0.4] as [number, number, number], rot: 0 },
        { pos: [-0.4, 0, 0.4] as [number, number, number], rot: Math.PI },
        { pos: [0.4, 0, 0.4] as [number, number, number], rot: Math.PI },
      ].map((chair, i) => (
        <group key={`chair-${i}`} position={chair.pos} rotation={[0, chair.rot, 0]}>
          {/* Seat */}
          <mesh position={[0, 0.3, 0]}>
            <cylinderGeometry args={[0.15, 0.15, 0.03, 12]} />
            <meshStandardMaterial color={theme.deskColor} metalness={0.3} roughness={0.7} />
          </mesh>
          {/* Backrest */}
          <mesh position={[0, 0.45, -0.12]}>
            <boxGeometry args={[0.25, 0.25, 0.02]} />
            <meshStandardMaterial color={theme.deskColor} metalness={0.3} roughness={0.7} />
          </mesh>
          {/* Pedestal */}
          <mesh position={[0, 0.15, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 0.3, 6]} />
            <meshStandardMaterial color="#333" metalness={0.6} roughness={0.4} />
          </mesh>
        </group>
      ))}

      {/* Whiteboard */}
      <mesh position={[0, 1.2, -1.2]}>
        <boxGeometry args={[1.5, 0.8, 0.03]} />
        <meshStandardMaterial color="#f0f0f0" roughness={0.95} />
      </mesh>
      {/* Whiteboard frame */}
      <mesh position={[0, 1.2, -1.22]}>
        <boxGeometry args={[1.6, 0.9, 0.02]} />
        <meshStandardMaterial color="#555" metalness={0.4} roughness={0.6} />
      </mesh>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Collaboration Arc — Dashed line between collaborating agents
   ═══════════════════════════════════════════════════════════════ */

function CollaborationArc({
  from,
  to,
  strength,
}: {
  from: [number, number, number];
  to: [number, number, number];
  strength: number;
}) {
  const ref = useRef<THREE.Line>(null);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...from).add(new THREE.Vector3(0, 0.8, 0)),
      new THREE.Vector3(
        (from[0] + to[0]) / 2,
        1.5,
        (from[2] + to[2]) / 2,
      ),
      new THREE.Vector3(...to).add(new THREE.Vector3(0, 0.8, 0)),
    ]);
    return g;
  }, [from, to]);

  const material = useMemo(
    () =>
      new THREE.LineDashedMaterial({
        color: "#3b82f6",
        dashSize: 0.2,
        gapSize: 0.1,
        opacity: 0.3 + strength * 0.5,
        transparent: true,
      }),
    [strength],
  );

  useFrame(() => {
    if (ref.current) {
      ref.current.computeLineDistances();
    }
  });

  // @ts-expect-error — R3F <line> is THREE.Line, not SVG line element
  return <line ref={ref} geometry={geometry} material={material} />;
}

/* ═══════════════════════════════════════════════════════════════
   Spawn Portal — Ring effect when agent comes online
   ═══════════════════════════════════════════════════════════════ */

function SpawnPortal({
  position,
}: {
  position: [number, number, number];
}) {
  const ref = useRef<THREE.Mesh>(null);
  const [scale, setScale] = useState(0);

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 2;
      ref.current.rotation.z += delta * 0.5;
    }
    if (scale < 1) {
      setScale((s) => Math.min(1, s + delta * 0.8));
    }
  });

  return (
    <mesh
      ref={ref}
      position={[position[0], 0.5, position[2]]}
      scale={scale}
    >
      <torusGeometry args={[0.5, 0.03, 8, 32]} />
      <meshStandardMaterial
        color="#06b6d4"
        emissive="#06b6d4"
        emissiveIntensity={2}
        transparent
        opacity={0.7}
      />
    </mesh>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Camera Controllers
   ═══════════════════════════════════════════════════════════════ */

function CameraController({
  mode,
  selectedAgent,
  deskPositions,
}: {
  mode: CameraMode;
  selectedAgent: VisualAgent | null;
  deskPositions: [number, number, number][];
}) {
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();

  useFrame((state) => {
    if (mode === "cinematic" && controlsRef.current) {
      // Slow auto-orbit
      const t = state.clock.elapsedTime;
      controlsRef.current.autoRotate = true;
      controlsRef.current.autoRotateSpeed = 0.5;
    } else if (controlsRef.current) {
      controlsRef.current.autoRotate = false;
    }

    // Follow mode: lerp to selected agent
    if (mode === "follow" && selectedAgent && controlsRef.current) {
      const target = controlsRef.current.target;

      if (selectedAgent.position) {
        // Map 2D grid position to 3D world space
        const targetX =
          ((selectedAgent.position.x - 320) / 160) * 2;
        const targetZ =
          ((selectedAgent.position.y - 280) / 160) * 3;
        target.lerp(
          new THREE.Vector3(targetX, 0.5, targetZ),
          0.05,
        );
        // Also nudge camera closer to the agent
        camera.position.lerp(
          new THREE.Vector3(targetX + 3, 4, targetZ + 5),
          0.02,
        );
      }
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.05}
      minDistance={4}
      maxDistance={20}
      maxPolarAngle={Math.PI / 2.2}
      minPolarAngle={0.2}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════
   Office3D — Main export
   ═══════════════════════════════════════════════════════════════ */

const DESK_POSITIONS: [number, number, number][] = [
  [-4, 0, -1],
  [-2, 0, -1],
  [0, 0, -1],
  [2, 0, -1],
  [-4, 0, 2],
  [-2, 0, 2],
  [0, 0, 2],
  [2, 0, 2],
];

export function Office3D() {
  const { state, dispatch } = useOffice();
  const { theme } = state;
  const agents = Array.from(state.agents.values());
  const filteredIds = getFilteredAgents(state);
  const [mounted, setMounted] = useState(false);
  const selectedAgent = state.selectedAgentId
    ? state.agents.get(state.selectedAgentId) || null
    : null;

  const isBackground = state.viewMode === "background";

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className="w-full aspect-video rounded-lg border border-border bg-card flex items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Loading 3D scene...
        </p>
      </div>
    );
  }

  return (
    <div
      className={`w-full rounded-lg border border-border overflow-hidden ${
        isBackground
          ? "fixed inset-0 z-[-1] opacity-35 pointer-events-none border-none rounded-none"
          : "aspect-video"
      }`}
      style={{ backgroundColor: theme.fogColor }}
    >
      <Canvas
        camera={{ position: [0, 6, 12], fov: 50 }}
        style={{ width: "100%", height: "100%" }}
        gl={{
          alpha: false,
          antialias: true,
          powerPreference: "low-power",
        }}
      >
        <color attach="background" args={[theme.fogColor]} />
        <fog attach="fog" args={[theme.fogColor, theme.fogNear, theme.fogFar]} />

        {/* Theme-driven lighting */}
        <ambientLight intensity={theme.ambientIntensity} color={theme.ambientColor} />
        <directionalLight
          position={[8, 12, 6]}
          intensity={theme.directionalIntensity}
          color={theme.directionalColor}
          castShadow
        />
        <directionalLight
          position={[-5, 8, -3]}
          intensity={0.2}
          color={theme.fillLightColor}
        />
        <pointLight
          position={[0, 3, 0]}
          intensity={theme.pointLightIntensity}
          color={theme.pointLightColor}
        />

        <Environment preset="apartment" background={false} environmentIntensity={0.15} />

        <Suspense fallback={<OfficeFloor theme={theme} />}>
          <OfficeEnvironment
            theme={theme}
            furniture={state.furniture}
            textures={state.textures}
            art={state.art}
          />
        </Suspense>

        {/* Desks + Agents */}
        {DESK_POSITIONS.map((pos, i) => {
          const agent = agents[i];
          const dimmed = agent ? !filteredIds.has(agent.id) : false;
          return (
            <group key={i}>
              <Desk position={pos} theme={theme} />
              {agent && agent.status !== "offline" && (
                agent.modelUrl ? (
                  <Suspense fallback={
                    <AgentFigure
                      position={pos}
                      agent={agent}
                      selected={agent.id === state.selectedAgentId}
                      dimmed={dimmed}
                      onClick={() =>
                        dispatch({ type: "SELECT_AGENT", id: agent.id })
                      }
                    />
                  }>
                    <GltfAgent
                      position={pos}
                      agent={agent}
                      selected={agent.id === state.selectedAgentId}
                      dimmed={dimmed}
                      onClick={() =>
                        dispatch({ type: "SELECT_AGENT", id: agent.id })
                      }
                    />
                  </Suspense>
                ) : (
                  <AgentFigure
                    position={pos}
                    agent={agent}
                    selected={agent.id === state.selectedAgentId}
                    dimmed={dimmed}
                    onClick={() =>
                      dispatch({ type: "SELECT_AGENT", id: agent.id })
                    }
                  />
                )
              )}
              {/* Spawn portal for spawning agents */}
              {agent && agent.status === "spawning" && (
                <SpawnPortal position={pos} />
              )}
            </group>
          );
        })}

        {/* Collaboration arcs */}
        {state.collaborationLinks.map((link, i) => {
          const sourceIdx = agents.findIndex(
            (a) => a.id === link.sourceId,
          );
          const targetIdx = agents.findIndex(
            (a) => a.id === link.targetId,
          );
          if (
            sourceIdx < 0 ||
            targetIdx < 0 ||
            sourceIdx >= DESK_POSITIONS.length ||
            targetIdx >= DESK_POSITIONS.length
          )
            return null;
          return (
            <CollaborationArc
              key={i}
              from={DESK_POSITIONS[sourceIdx]}
              to={DESK_POSITIONS[targetIdx]}
              strength={link.strength}
            />
          );
        })}

        {/* Meeting Room */}
        <MeetingRoom position={[5.5, 0, -1]} theme={theme} />

        {/* Camera controller */}
        <CameraController
          mode={state.cameraMode}
          selectedAgent={selectedAgent}
          deskPositions={DESK_POSITIONS}
        />
      </Canvas>
    </div>
  );
}
