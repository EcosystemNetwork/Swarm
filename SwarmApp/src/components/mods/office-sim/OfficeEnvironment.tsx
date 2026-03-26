/** OfficeEnvironment — Composes floor, walls, ceiling, and AI-generated furniture */
"use client";

import { Suspense, useMemo, useEffect, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { OfficeTheme } from "./themes";
import type { OfficeFurnitureData } from "./studio/furniture-types";
import type { OfficeTextureData } from "./studio/texture-types";
import type { OfficeArtPieceData } from "./studio/art-types";
import { DEFAULT_ART_SLOTS, ART_PIPELINE, ART_3D_SCALES } from "./studio/art-types";
import { ThemedFloor } from "./ThemedFloor";
import { GltfFurniture } from "./GltfFurniture";
import { ArtPlane } from "./ArtPlane";
import { ArtPlaceholder } from "./ArtPlaceholder";

interface OfficeEnvironmentProps {
  theme: OfficeTheme;
  furniture?: Map<string, OfficeFurnitureData>;
  textures?: Map<string, OfficeTextureData>;
  art?: Map<string, OfficeArtPieceData>;
}

/** Default positions for furniture categories in the 3D scene */
const FURNITURE_PLACEMENTS: Record<string, { position: [number, number, number]; rotation?: [number, number, number] }[]> = {
  plant: [
    { position: [-5.5, 0, -2] },
    { position: [4.5, 0, -2] },
    { position: [-5.5, 0, 3.5] },
    { position: [4.5, 0, 3.5] },
  ],
  whiteboard: [
    { position: [0, 0, -4], rotation: [0, 0, 0] },
  ],
  "coffee-machine": [
    { position: [6, 0, 3] },
  ],
  "server-rack": [
    { position: [-6.5, 0, 0] },
    { position: [-6.5, 0, 1.5] },
  ],
  lamp: [
    { position: [-3, 0.48, -1] },
    { position: [1, 0.48, -1] },
    { position: [-3, 0.48, 2] },
    { position: [1, 0.48, 2] },
  ],
  divider: [
    { position: [-1, 0, 0.5], rotation: [0, Math.PI / 2, 0] },
  ],
  couch: [
    { position: [6, 0, -2], rotation: [0, -Math.PI / 2, 0] },
  ],
};

function Walls({ theme }: { theme: OfficeTheme }) {
  const wallMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: theme.wallColor,
        metalness: 0.1,
        roughness: 0.9,
        side: THREE.DoubleSide,
      }),
    [theme.wallColor],
  );

  return (
    <group>
      {/* Back wall */}
      <mesh position={[0, 1.5, -5]} material={wallMat}>
        <planeGeometry args={[16, 3]} />
      </mesh>
      {/* Left wall */}
      <mesh position={[-8, 1.5, 0]} rotation={[0, Math.PI / 2, 0]} material={wallMat}>
        <planeGeometry args={[10, 3]} />
      </mesh>
      {/* Right wall */}
      <mesh position={[8, 1.5, 0]} rotation={[0, -Math.PI / 2, 0]} material={wallMat}>
        <planeGeometry args={[10, 3]} />
      </mesh>
    </group>
  );
}

function Ceiling({ theme }: { theme: OfficeTheme }) {
  return (
    <mesh position={[0, 3, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <planeGeometry args={[16, 10]} />
      <meshStandardMaterial
        color={theme.wallColor}
        metalness={0.05}
        roughness={0.95}
        side={THREE.DoubleSide}
        opacity={0.4}
        transparent
      />
    </mesh>
  );
}

/** Simple GLTF loader for art pieces (no category/scale assumptions from furniture) */
function GltfArt({
  modelUrl,
  position,
  rotation,
  scale,
}: {
  modelUrl: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  scale: [number, number, number];
}) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF(modelUrl);
  const clonedScene = useMemo(() => scene.clone(true), [scene]);

  useEffect(() => {
    if (!groupRef.current) return;
    // Center the model
    const box = new THREE.Box3().setFromObject(clonedScene);
    const center = box.getCenter(new THREE.Vector3());
    clonedScene.position.sub(center);
    clonedScene.position.y += box.getSize(new THREE.Vector3()).y / 2;
  }, [clonedScene]);

  return (
    <group ref={groupRef} position={position} rotation={rotation} scale={scale}>
      <primitive object={clonedScene} />
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Ceiling Lights — Overhead light panels with point lights
   ═══════════════════════════════════════════════════════════════ */

function CeilingLights({ theme }: { theme: OfficeTheme }) {
  const positions: [number, number, number][] = [
    [-3, 2.95, -1], [1, 2.95, -1], [-3, 2.95, 2], [1, 2.95, 2],
  ];
  return (
    <group>
      {positions.map((pos, i) => (
        <group key={i}>
          {/* Light panel */}
          <mesh position={pos}>
            <boxGeometry args={[1.0, 0.04, 0.4]} />
            <meshStandardMaterial
              color="#ffffff"
              emissive="#ffffff"
              emissiveIntensity={0.3}
            />
          </mesh>
          {/* Point light */}
          <pointLight position={[pos[0], pos[1] - 0.1, pos[2]]} intensity={0.15} color="#fff5e6" distance={5} />
        </group>
      ))}
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Procedural Potted Plant — Low-poly decorative plant
   ═══════════════════════════════════════════════════════════════ */

function ProceduralPlant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Pot */}
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.12, 0.1, 0.2, 8]} />
        <meshStandardMaterial color="#8B4513" roughness={0.9} />
      </mesh>
      {/* Soil */}
      <mesh position={[0, 0.21, 0]}>
        <cylinderGeometry args={[0.11, 0.11, 0.02, 8]} />
        <meshStandardMaterial color="#3a2a1a" roughness={1} />
      </mesh>
      {/* Leaves */}
      {[
        { pos: [0, 0.4, 0] as [number, number, number], s: 0.08, c: "#2d8a4e" },
        { pos: [-0.06, 0.35, 0.04] as [number, number, number], s: 0.06, c: "#3aa55e" },
        { pos: [0.05, 0.36, -0.03] as [number, number, number], s: 0.07, c: "#228B22" },
      ].map((leaf, i) => (
        <mesh key={i} position={leaf.pos}>
          <sphereGeometry args={[leaf.s, 8, 8]} />
          <meshStandardMaterial color={leaf.c} roughness={0.8} />
        </mesh>
      ))}
      {/* Stem */}
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 0.2, 4]} />
        <meshStandardMaterial color="#4a7a3a" roughness={0.9} />
      </mesh>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Window Wall — Glass windows on the right side of the office
   ═══════════════════════════════════════════════════════════════ */

function WindowWall({ theme }: { theme: OfficeTheme }) {
  const windows: [number, number][] = [
    [-2, 1.2], [0, 1.2], [2, 1.2],
    [-2, 2.2], [0, 2.2], [2, 2.2],
  ];
  return (
    <group position={[7.99, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
      {windows.map(([wx, wy], i) => (
        <group key={i}>
          {/* Window pane */}
          <mesh position={[wx, wy, 0]}>
            <planeGeometry args={[1.5, 0.8]} />
            <meshStandardMaterial
              color="#87ceeb"
              metalness={0.9}
              roughness={0.1}
              opacity={0.15}
              transparent
              side={THREE.DoubleSide}
            />
          </mesh>
          {/* Window frame */}
          <mesh position={[wx, wy, 0.01]}>
            <planeGeometry args={[1.6, 0.9]} />
            <meshStandardMaterial color="#444" metalness={0.5} roughness={0.5} opacity={0.3} transparent side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function OfficeEnvironment({
  theme,
  furniture,
  textures,
  art,
}: OfficeEnvironmentProps) {
  const floorTextureUrl = textures?.get("wood-floor")?.textureUrl
    || textures?.get("tile-floor")?.textureUrl
    || textures?.get("carpet")?.textureUrl;

  return (
    <group>
      <ThemedFloor theme={theme} textureUrl={floorTextureUrl} />
      <Walls theme={theme} />
      <Ceiling theme={theme} />

      {/* Procedural plants (fallback when no custom plant furniture) */}
      {!furniture?.has("plant") && (
        <>
          <ProceduralPlant position={[-5.5, 0, -2]} />
          <ProceduralPlant position={[4.5, 0, -2]} />
          <ProceduralPlant position={[-5.5, 0, 3.5]} />
        </>
      )}
      <WindowWall theme={theme} />
      <CeilingLights theme={theme} />

      {/* Render AI-generated furniture where available */}
      {furniture && Array.from(furniture.entries()).map(([category, data]) => {
        const placements = FURNITURE_PLACEMENTS[category];
        if (!placements || !data.modelUrl) return null;

        return placements.map((placement, i) => (
          <Suspense key={`${category}-${i}`} fallback={null}>
            <GltfFurniture
              modelUrl={data.modelUrl}
              category={data.category}
              position={placement.position}
              rotation={placement.rotation}
            />
          </Suspense>
        ));
      })}

      {/* Render AI-generated art pieces */}
      {DEFAULT_ART_SLOTS.map((slot) => {
        const artData = art?.get(slot.id);
        const pipeline = ART_PIPELINE[slot.category];
        const is3D = pipeline === "meshy";

        if (artData?.modelUrl && is3D) {
          // 3D art: render as GLTF model
          const scale = ART_3D_SCALES[slot.category] || [0.5, 0.5, 0.5];
          return (
            <Suspense key={slot.id} fallback={null}>
              <GltfArt
                modelUrl={artData.modelUrl}
                position={slot.three.position}
                rotation={slot.three.rotation}
                scale={scale}
              />
            </Suspense>
          );
        }

        if (artData?.imageUrl && !is3D) {
          // 2D art: render as textured plane
          return (
            <Suspense key={slot.id} fallback={null}>
              <ArtPlane
                imageUrl={artData.imageUrl}
                position={slot.three.position}
                rotation={slot.three.rotation}
                size={slot.three.planeSize}
              />
            </Suspense>
          );
        }

        // Empty slot: wireframe placeholder
        return (
          <ArtPlaceholder
            key={slot.id}
            position={slot.three.position}
            rotation={slot.three.rotation}
            size={slot.three.planeSize}
            is3D={is3D}
          />
        );
      })}
    </group>
  );
}
