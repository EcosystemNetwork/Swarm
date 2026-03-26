/** Sprite System — Pixel-art walk cycle and directional sprite animation
 *
 * Adapted from thx0701/openclaw-virtual-office (vanilla HTML/CSS sprite engine).
 * Provides a CSS-based 6-frame directional walk cycle, rest spots,
 * and collision-aware movement for the 2D renderer.
 *
 * **Fallback system** — when an agent has no ComfyUI sprite (agent.spriteUrl)
 * or Meshy 3D model (agent.modelUrl), this system renders a procedural
 * pixel-style character using CSS sprite sheets or SVG fallback.
 *
 * Asset pipeline priority:
 *   1. agent.spriteUrl  → ComfyUI custom sprite sheet → use SpriteAnimation
 *   2. agent.modelUrl   → Meshy 3D model → skip 2D sprite entirely
 *   3. null             → procedural sprite from avatar-generator.ts
 */

/* ═══════════════════════════════════════
   Sprite Sheet Layout
   ═══════════════════════════════════════ */

export type SpriteDirection = "down" | "left" | "right" | "up";

/**
 * Animation types supported in the expanded sprite sheet.
 *
 * Sheet layout (10 rows × 6 cols = 288×640):
 *   Row 0: Walk Down    (6 frames)
 *   Row 1: Walk Left    (6 frames)
 *   Row 2: Walk Right   (6 frames)
 *   Row 3: Walk Up      (6 frames)
 *   Row 4: Idle         (6 frames — subtle breathing / bobbing)
 *   Row 5: Working      (6 frames — typing at keyboard)
 *   Row 6: Thinking     (6 frames — hand on chin, looking up)
 *   Row 7: Talking      (6 frames — gesturing, mouth open)
 *   Row 8: Error        (6 frames — alarmed, red flash pose)
 *   Row 9: Spawning     (6 frames — materializing / appearing)
 */
export type SpriteAnimationType =
  | "walk_down"
  | "walk_left"
  | "walk_right"
  | "walk_up"
  | "idle"
  | "working"
  | "thinking"
  | "talking"
  | "error"
  | "spawning";

/** Row index for each animation type in the expanded sprite sheet */
export const ANIM_ROWS: Record<SpriteAnimationType, number> = {
  walk_down: 0,
  walk_left: 1,
  walk_right: 2,
  walk_up: 3,
  idle: 4,
  working: 5,
  thinking: 6,
  talking: 7,
  error: 8,
  spawning: 9,
};

/** Number of rows in the expanded sprite sheet */
export const SPRITE_SHEET_ROWS = 10;

/** Frame speed per animation type (ms per frame) */
export const ANIM_SPEEDS: Record<SpriteAnimationType, number> = {
  walk_down: 120,
  walk_left: 120,
  walk_right: 120,
  walk_up: 120,
  idle: 300,     // slow breathing
  working: 150,  // moderate typing
  thinking: 400, // slow contemplation
  talking: 180,  // mouth flaps
  error: 200,    // alarmed pulsing
  spawning: 100, // fast materialization
};

export interface SpriteSheetConfig {
  /** URL of the sprite sheet image */
  url: string;
  /** Frame width in px */
  frameWidth: number;
  /** Frame height in px */
  frameHeight: number;
  /** Number of frames per direction */
  framesPerDirection: number;
  /** Row index for each direction (0-indexed) — walk rows only */
  directionRows: Record<SpriteDirection, number>;
  /** Animation speed: ms per frame */
  frameDurationMs: number;
}

/** Default 6-frame walk cycle layout (matches thx0701's sprite format) */
export const DEFAULT_SPRITE_CONFIG: Omit<SpriteSheetConfig, "url"> = {
  frameWidth: 48,
  frameHeight: 64,
  framesPerDirection: 6,
  directionRows: {
    down: 0,
    left: 1,
    right: 2,
    up: 3,
  },
  frameDurationMs: 120,
};

/** Expanded sprite sheet config (10-row format with all animation types) */
export const EXPANDED_SPRITE_CONFIG = {
  frameWidth: 48,
  frameHeight: 64,
  framesPerRow: 6,
  totalRows: SPRITE_SHEET_ROWS,
  /** Total sprite sheet pixel dimensions */
  sheetWidth: 48 * 6,   // 288
  sheetHeight: 64 * 10, // 640
} as const;

/* ═══════════════════════════════════════
   Sprite Animation State
   ═══════════════════════════════════════ */

export interface SpriteAnimState {
  /** Current direction */
  direction: SpriteDirection;
  /** Current frame index (0 to framesPerDirection-1) */
  frameIndex: number;
  /** Whether the sprite is animating (walking) */
  isAnimating: boolean;
  /** Time accumulator for frame advancement */
  timeAccumMs: number;
  /** Standing/idle frame index (usually 0 or 1) */
  idleFrame: number;
}

export function createSpriteAnimState(): SpriteAnimState {
  return {
    direction: "down",
    frameIndex: 0,
    isAnimating: false,
    timeAccumMs: 0,
    idleFrame: 0,
  };
}

/**
 * Update sprite animation state based on movement delta.
 */
export function updateSpriteAnim(
  state: SpriteAnimState,
  dx: number,
  dy: number,
  deltaMs: number,
  config: Omit<SpriteSheetConfig, "url"> = DEFAULT_SPRITE_CONFIG,
): SpriteAnimState {
  const isMoving = Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1;

  if (!isMoving) {
    return {
      ...state,
      isAnimating: false,
      frameIndex: state.idleFrame,
      timeAccumMs: 0,
    };
  }

  // Determine direction from movement vector
  const direction = getDirectionFromDelta(dx, dy);

  // Advance frame
  const timeAccum = state.timeAccumMs + deltaMs;
  const framesAdvanced = Math.floor(timeAccum / config.frameDurationMs);
  const newTimeAccum = timeAccum % config.frameDurationMs;
  const newFrame = (state.frameIndex + framesAdvanced) % config.framesPerDirection;

  return {
    ...state,
    direction,
    frameIndex: newFrame,
    isAnimating: true,
    timeAccumMs: newTimeAccum,
  };
}

/**
 * Get the direction enum from a movement delta.
 */
export function getDirectionFromDelta(dx: number, dy: number): SpriteDirection {
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? "right" : "left";
  }
  return dy > 0 ? "down" : "up";
}

/* ═══════════════════════════════════════
   CSS Background Position Calculator
   ═══════════════════════════════════════ */

/**
 * Compute CSS background-position for the current sprite frame.
 * Returns values suitable for `background-position: ${x}px ${y}px`.
 */
export function getSpriteBackgroundPosition(
  state: SpriteAnimState,
  config: Omit<SpriteSheetConfig, "url"> = DEFAULT_SPRITE_CONFIG,
): { x: number; y: number } {
  const col = state.isAnimating ? state.frameIndex : state.idleFrame;
  const row = config.directionRows[state.direction];

  return {
    x: -(col * config.frameWidth),
    y: -(row * config.frameHeight),
  };
}

/**
 * Generate inline CSS style object for a sprite element.
 */
export function getSpriteStyle(
  spriteUrl: string,
  state: SpriteAnimState,
  config: Omit<SpriteSheetConfig, "url"> = DEFAULT_SPRITE_CONFIG,
): Record<string, string> {
  const pos = getSpriteBackgroundPosition(state, config);
  return {
    backgroundImage: `url(${spriteUrl})`,
    backgroundPosition: `${pos.x}px ${pos.y}px`,
    backgroundRepeat: "no-repeat",
    width: `${config.frameWidth}px`,
    height: `${config.frameHeight}px`,
    imageRendering: "pixelated",
  };
}

/* ═══════════════════════════════════════
   Rest Spots (idle behavior positions)
   ═══════════════════════════════════════ */

export interface RestSpot {
  id: string;
  position: { x: number; y: number };
  /** Facing direction when resting */
  facing: SpriteDirection;
  /** Type of rest behavior */
  behavior: "sit" | "stand" | "lean" | "wander";
  /** Whether this spot is currently occupied */
  occupied: boolean;
  /** Duration range for resting (ms) */
  restDurationRange: [number, number];
}

/**
 * Default rest spots scattered around the office.
 * These correspond to furniture positions from the layout.
 */
export function generateRestSpots(layout: {
  rooms: Array<{ id: string; type: string; position: { x: number; y: number }; width: number; height: number }>;
}): RestSpot[] {
  const spots: RestSpot[] = [];
  let idx = 0;

  for (const room of layout.rooms) {
    if (room.type === "break") {
      // Break room gets multiple sit spots
      spots.push({
        id: `rest-${idx++}`,
        position: { x: room.position.x + 30, y: room.position.y + 30 },
        facing: "down",
        behavior: "sit",
        occupied: false,
        restDurationRange: [5000, 15000],
      });
      spots.push({
        id: `rest-${idx++}`,
        position: { x: room.position.x + room.width - 30, y: room.position.y + 30 },
        facing: "down",
        behavior: "sit",
        occupied: false,
        restDurationRange: [5000, 15000],
      });
    }

    if (room.type === "meeting") {
      // Meeting room gets standing spots
      spots.push({
        id: `rest-${idx++}`,
        position: { x: room.position.x + room.width / 2, y: room.position.y + room.height / 2 },
        facing: "up",
        behavior: "stand",
        occupied: false,
        restDurationRange: [10000, 30000],
      });
    }
  }

  // Corridor wander spots
  spots.push({
    id: `rest-${idx++}`,
    position: { x: 200, y: 140 },
    facing: "right",
    behavior: "wander",
    occupied: false,
    restDurationRange: [2000, 5000],
  });
  spots.push({
    id: `rest-${idx++}`,
    position: { x: 500, y: 140 },
    facing: "left",
    behavior: "wander",
    occupied: false,
    restDurationRange: [2000, 5000],
  });

  return spots;
}

/**
 * Find an available rest spot nearest to the agent.
 */
export function findNearestRestSpot(
  agentPos: { x: number; y: number },
  spots: RestSpot[],
  preferBehavior?: RestSpot["behavior"],
): RestSpot | null {
  let best: RestSpot | null = null;
  let bestDist = Infinity;

  for (const spot of spots) {
    if (spot.occupied) continue;
    if (preferBehavior && spot.behavior !== preferBehavior) continue;

    const dist = Math.hypot(
      spot.position.x - agentPos.x,
      spot.position.y - agentPos.y,
    );
    if (dist < bestDist) {
      bestDist = dist;
      best = spot;
    }
  }

  return best;
}

/**
 * Get a random rest duration within the spot's range.
 */
export function randomRestDuration(spot: RestSpot): number {
  const [min, max] = spot.restDurationRange;
  return min + Math.random() * (max - min);
}

/* ═══════════════════════════════════════
   Collision Detection (2D pixel grid)
   ═══════════════════════════════════════ */

/**
 * Simple AABB collision between two sprite rectangles.
 */
export function spritesCollide(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/**
 * Push-apart resolution for two colliding sprites.
 * Moves both sprites equally away from each other.
 */
export function separateSprites(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): { a: { x: number; y: number }; b: { x: number; y: number } } {
  const acx = ax + aw / 2;
  const acy = ay + ah / 2;
  const bcx = bx + bw / 2;
  const bcy = by + bh / 2;

  const dx = acx - bcx;
  const dy = acy - bcy;
  const dist = Math.hypot(dx, dy) || 1;

  const overlapX = (aw + bw) / 2 - Math.abs(dx);
  const overlapY = (ah + bh) / 2 - Math.abs(dy);

  if (overlapX <= 0 || overlapY <= 0) {
    return { a: { x: ax, y: ay }, b: { x: bx, y: by } };
  }

  // Push along the axis of least overlap
  if (overlapX < overlapY) {
    const push = overlapX / 2 * Math.sign(dx);
    return {
      a: { x: ax + push, y: ay },
      b: { x: bx - push, y: by },
    };
  } else {
    const push = overlapY / 2 * Math.sign(dy);
    return {
      a: { x: ax, y: ay + push },
      b: { x: bx, y: by - push },
    };
  }
}
