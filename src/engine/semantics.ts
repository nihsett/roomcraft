import type { Direction, Item, Room, Rotation } from '../types';
import { effectiveSize } from '../types';
import { CATALOG } from '../catalog';

const DIRECTIONS: Direction[] = ['S', 'W', 'N', 'E'];
const DIR_INDEX: Record<Direction, number> = { S: 0, W: 1, N: 2, E: 3 };
const DIR_VECTOR: Record<Direction, [number, number]> = {
  S: [0, 1], N: [0, -1], E: [1, 0], W: [-1, 0],
};
const OPPOSITE: Record<Direction, Direction> = { N: 'S', S: 'N', E: 'W', W: 'E' };

const WALL_THRESHOLD = 15;
const SEATING_TYPES = new Set(['sofa', 'loveseat', 'armchair']);

export interface SemanticItem {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  w: number;
  d: number;
  rotation: Rotation;
  facing: Direction | null;
  facingTarget: { id: string; label: string; distanceCm: number } | null;
  againstWall: Direction | null;
}

export function getFacingDirection(item: Item): Direction | null {
  const entry = CATALOG[item.type];
  if (!entry?.frontEdge) return null;
  const baseIndex = DIR_INDEX[entry.frontEdge];
  const steps = item.rotation / 90;
  return DIRECTIONS[(baseIndex + steps) % 4];
}

export function itemCenter(item: Item): [number, number] {
  const size = effectiveSize(item);
  return [item.x + size.w / 2, item.y + size.d / 2];
}

function frontEdgeCenter(item: Item, facing: Direction): [number, number] {
  const size = effectiveSize(item);
  switch (facing) {
    case 'S': return [item.x + size.w / 2, item.y + size.d];
    case 'N': return [item.x + size.w / 2, item.y];
    case 'E': return [item.x + size.w, item.y + size.d / 2];
    case 'W': return [item.x, item.y + size.d / 2];
  }
}

export function getFacingTarget(
  item: Item,
  allItems: Item[],
): { id: string; label: string; distanceCm: number } | null {
  const facing = getFacingDirection(item);
  if (!facing) return null;

  const front = frontEdgeCenter(item, facing);
  const dir = DIR_VECTOR[facing];

  let best: { id: string; label: string; distanceCm: number } | null = null;
  let bestDist = Infinity;

  for (const other of allItems) {
    if (other.id === item.id) continue;
    // Floor coverings can overlap furniture and are never something a
    // directional item meaningfully faces.
    if (!CATALOG[other.type]?.blocking) continue;
    const center = itemCenter(other);
    const dx = center[0] - front[0];
    const dy = center[1] - front[1];

    const dot = dx * dir[0] + dy * dir[1];
    if (dot <= 0) continue;

    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) continue;
    if (dot / dist < 0.5) continue; // outside ±60° cone

    if (dist < bestDist) {
      bestDist = dist;
      best = { id: other.id, label: other.label, distanceCm: Math.round(dist) };
    }
  }

  return best;
}

export function getAgainstWall(item: Item, room: Room): Direction | null {
  const size = effectiveSize(item);
  if (item.y <= WALL_THRESHOLD) return 'N';
  if (item.y + size.d >= room.depth - WALL_THRESHOLD) return 'S';
  if (item.x <= WALL_THRESHOLD) return 'W';
  if (item.x + size.w >= room.width - WALL_THRESHOLD) return 'E';
  return null;
}

export function enrichItem(item: Item, allItems: Item[], room: Room): SemanticItem {
  return {
    id: item.id,
    type: item.type,
    label: item.label,
    x: item.x,
    y: item.y,
    w: item.w,
    d: item.d,
    rotation: item.rotation,
    facing: getFacingDirection(item),
    facingTarget: getFacingTarget(item, allItems),
    againstWall: getAgainstWall(item, room),
  };
}

// --- Layer 3: Layout Critique ---

function wallName(dir: Direction): string {
  const names: Record<Direction, string> = { N: 'north', S: 'south', E: 'east', W: 'west' };
  return names[dir];
}

function directionFrom(from: Item, to: Item): Direction {
  const [fx, fy] = itemCenter(from);
  const [tx, ty] = itemCenter(to);
  const dx = tx - fx;
  const dy = ty - fy;
  if (Math.abs(dy) >= Math.abs(dx)) return dy > 0 ? 'S' : 'N';
  return dx > 0 ? 'E' : 'W';
}

function edgeDistance(a: Item, b: Item): number {
  const aSize = effectiveSize(a);
  const bSize = effectiveSize(b);
  const gapX = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + aSize.w, b.x + bSize.w));
  const gapY = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + aSize.d, b.y + bSize.d));
  return Math.sqrt(gapX * gapX + gapY * gapY);
}

export function critiqueLayout(items: Item[], room: Room): string[] {
  const warnings: string[] = [];
  const enriched = items.map((item) => enrichItem(item, items, room));
  const tvs = items.filter((item) => item.type === 'tv-stand');
  const tables = items.filter((item) => item.type === 'dining-table');

  for (const si of enriched) {
    if (!SEATING_TYPES.has(si.type) || !si.facing) continue;

    if (tvs.length > 0) {
      const tv = tvs[0];
      const front = frontEdgeCenter(si, si.facing);
      const tc = itemCenter(tv);
      const dot = (tc[0] - front[0]) * DIR_VECTOR[si.facing][0]
                + (tc[1] - front[1]) * DIR_VECTOR[si.facing][1];
      if (dot <= 0) {
        const toward = directionFrom(si, tv);
        warnings.push(
          `${si.label} (${si.id}) faces ${wallName(si.facing)} but the TV is to the ${wallName(toward)}. Consider rotating to face ${toward}.`,
        );
      }
    } else if (!si.facingTarget) {
      warnings.push(`${si.label} (${si.id}) faces ${wallName(si.facing)} with nothing in front of it.`);
    }
  }

  for (const chair of enriched) {
    if (chair.type !== 'dining-chair') continue;
    if (tables.length === 0) {
      warnings.push(`${chair.label} (${chair.id}) has no dining table.`);
      continue;
    }

    const nearestTable = tables.reduce((nearest, table) =>
      edgeDistance(chair, table) < edgeDistance(chair, nearest) ? table : nearest,
    );
    const distance = edgeDistance(chair, nearestTable);
    if (distance > 30) {
      warnings.push(`${chair.label} (${chair.id}) is ${Math.round(distance)}cm from the nearest table — too far to sit at.`);
    }

    const facing = getFacingDirection(chair);
    const expected = directionFrom(chair, nearestTable);
    if (facing !== expected) {
      warnings.push(
        `${chair.label} (${chair.id}) faces ${facing ? wallName(facing) : 'nowhere'} instead of toward ${nearestTable.label} (${nearestTable.id}). Use prepare_for_dinner to fix the dining arrangement.`,
      );
    }
  }

  for (const si of enriched) {
    if (si.type !== 'tv-stand' || !si.facing) continue;
    const seats = enriched.filter((e) => SEATING_TYPES.has(e.type));
    if (seats.length === 0) continue;
    const front = frontEdgeCenter(si, si.facing);
    const anyInFront = seats.some((s) => {
      const c = itemCenter(s);
      return (c[0] - front[0]) * DIR_VECTOR[si.facing!][0]
           + (c[1] - front[1]) * DIR_VECTOR[si.facing!][1] > 0;
    });
    if (!anyInFront) {
      warnings.push(`TV Stand (${si.id}) faces ${wallName(si.facing)} but no seating is in front of it.`);
    }
  }

  const hasLoungeSeating = items.some((item) => SEATING_TYPES.has(item.type));
  if (!hasLoungeSeating) {
    for (const coffeeTable of items.filter((item) => item.type === 'coffee-table')) {
      warnings.push(
        `${coffeeTable.label} (${coffeeTable.id}) has no lounge seating around it. Remove it when converting the room for dining.`,
      );
    }
  }

  return warnings;
}

// --- Layer 2: Intent Helpers ---

export function rotationToFace(item: Item, targetX: number, targetY: number): Rotation {
  const [cx, cy] = itemCenter(item);
  const dx = targetX - cx;
  const dy = targetY - cy;

  let targetDir: Direction;
  if (Math.abs(dy) >= Math.abs(dx)) {
    targetDir = dy > 0 ? 'S' : 'N';
  } else {
    targetDir = dx > 0 ? 'E' : 'W';
  }

  const entry = CATALOG[item.type];
  if (!entry?.frontEdge) return item.rotation;

  const baseIndex = DIR_INDEX[entry.frontEdge];
  const targetIndex = DIR_INDEX[targetDir];
  const steps = (targetIndex - baseIndex + 4) % 4;
  return (steps * 90) as Rotation;
}

export function placeAgainstWall(
  item: Item,
  wall: Direction,
  room: Room,
  alongOffset?: number,
): { x: number; y: number; rotation: Rotation } {
  const entry = CATALOG[item.type];
  if (!entry) return { x: item.x, y: item.y, rotation: item.rotation };

  const facingDir = OPPOSITE[wall];
  const baseIndex = entry.frontEdge ? DIR_INDEX[entry.frontEdge] : 0;
  const targetIndex = DIR_INDEX[facingDir];
  const steps = (targetIndex - baseIndex + 4) % 4;
  const rotation = (steps * 90) as Rotation;

  const size = effectiveSize({ ...item, rotation });

  let x: number;
  let y: number;

  switch (wall) {
    case 'N': y = 0; x = alongOffset ?? item.x; break;
    case 'S': y = room.depth - size.d; x = alongOffset ?? item.x; break;
    case 'W': x = 0; y = alongOffset ?? item.y; break;
    case 'E': x = room.width - size.w; y = alongOffset ?? item.y; break;
  }

  x = Math.max(0, Math.min(room.width - size.w, x!));
  y = Math.max(0, Math.min(room.depth - size.d, y!));

  return { x: Math.round(x), y: Math.round(y), rotation };
}

