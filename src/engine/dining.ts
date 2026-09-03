import { CATALOG } from '../catalog';
import type { Direction, Item, Room, Rotation } from '../types';
import { effectiveSize } from '../types';

const CHAIR_TYPE = 'dining-chair';
const MAX_GUESTS = 8;
const TABLE_GAP = 10;
const SEARCH_STEP = 5;
const LOUNGE_TYPES = new Set(['sofa', 'loveseat', 'armchair', 'coffee-table']);

type TableSide = Direction;

export interface DiningSeatPlacement {
  x: number;
  y: number;
  rotation: Rotation;
  side: TableSide;
}

export interface DiningLayoutPlan {
  table: { x: number; y: number; rotation: Rotation };
  seats: DiningSeatPlacement[];
  removeItemIds: string[];
}

export type DiningLayoutResult =
  | { ok: true; plan: DiningLayoutPlan }
  | { ok: false; error: string; blockerIds: string[] };

/**
 * Plans a complete dining group. Chair positions and rotations are derived by
 * the engine; an agent never has to reason about raw chair coordinates.
 */
export function planDiningLayout(
  room: Room,
  items: Item[],
  table: Item,
  guestCount: number,
  clearLoungeFurniture: boolean,
): DiningLayoutResult {
  if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > MAX_GUESTS) {
    return {
      ok: false,
      error: `guest_count must be a whole number from 1 to ${MAX_GUESTS}.`,
      blockerIds: [],
    };
  }

  const chairCatalog = CATALOG[CHAIR_TYPE];
  if (!chairCatalog) {
    return { ok: false, error: 'Dining chair catalog entry is missing.', blockerIds: [] };
  }

  const removeItemIds = clearLoungeFurniture
    ? items.filter((item) => LOUNGE_TYPES.has(item.type)).map((item) => item.id)
    : [];
  const ignoredIds = new Set([
    table.id,
    ...removeItemIds,
    ...items.filter((item) => item.type === CHAIR_TYPE).map((item) => item.id),
  ]);
  const fixedItems = items.filter((item) => !ignoredIds.has(item.id));

  // Align the table's long dimension with the room's long dimension. This
  // produces a natural central composition and maximizes usable seating space.
  const roomIsLandscape = room.width >= room.depth;
  const tableIsWide = table.w >= table.d;
  const tableRotation: Rotation = roomIsLandscape === tableIsWide ? 0 : 90;
  const tableTemplate: Item = { ...table, rotation: tableRotation };
  const tableSize = effectiveSize(tableTemplate);
  const sideCounts = allocateSides(guestCount, tableSize.w, tableSize.d, chairCatalog.w, chairCatalog.d);

  if (!sideCounts) {
    return {
      ok: false,
      error: `The ${table.label} cannot seat ${guestCount} people with the available chair size.`,
      blockerIds: [],
    };
  }

  const leftSpace = sideCounts.W > 0 ? chairCatalog.w + TABLE_GAP : 0;
  const rightSpace = sideCounts.E > 0 ? chairCatalog.w + TABLE_GAP : 0;
  const northSpace = sideCounts.N > 0 ? chairCatalog.d + TABLE_GAP : 0;
  const southSpace = sideCounts.S > 0 ? chairCatalog.d + TABLE_GAP : 0;
  const minX = leftSpace;
  const maxX = room.width - tableSize.w - rightSpace;
  const minY = northSpace;
  const maxY = room.depth - tableSize.d - southSpace;

  if (minX > maxX || minY > maxY) {
    return {
      ok: false,
      error: `The ${room.width}x${room.depth}cm room is too small for ${guestCount} seats around the ${table.label}.`,
      blockerIds: [],
    };
  }

  const preferredX = clamp(Math.round((room.width - tableSize.w) / 2), minX, maxX);
  const preferredY = clamp(Math.round((room.depth - tableSize.d) / 2), minY, maxY);
  const candidates = candidatePositions(minX, maxX, minY, maxY, preferredX, preferredY);
  let preferredBlockers: string[] = [];

  for (const [x, y] of candidates) {
    const candidateTable: Item = { ...tableTemplate, x, y };
    const seats = buildSeatPlacements(candidateTable, sideCounts, chairCatalog.w, chairCatalog.d);
    const plannedItems: Item[] = [
      candidateTable,
      ...seats.map((seat, index) => ({
        id: `planned-chair-${index}`,
        type: CHAIR_TYPE,
        label: `Chair ${index + 1}`,
        x: seat.x,
        y: seat.y,
        w: chairCatalog.w,
        d: chairCatalog.d,
        rotation: seat.rotation,
      })),
    ];
    const blockers = findCollisions(plannedItems, fixedItems);

    if (x === preferredX && y === preferredY) preferredBlockers = blockers;
    if (blockers.length === 0) {
      return {
        ok: true,
        plan: {
          table: { x, y, rotation: tableRotation },
          seats,
          removeItemIds,
        },
      };
    }
  }

  const blockerLabels = preferredBlockers
    .map((id) => fixedItems.find((item) => item.id === id))
    .filter((item): item is Item => Boolean(item))
    .map((item) => `${item.label} (${item.id})`);
  const blockerText = blockerLabels.length > 0
    ? ` Move or remove: ${blockerLabels.join(', ')}.`
    : '';

  return {
    ok: false,
    error: `No collision-free place can seat ${guestCount} people around the ${table.label}.${blockerText}`,
    blockerIds: preferredBlockers,
  };
}

function allocateSides(
  guestCount: number,
  tableWidth: number,
  tableDepth: number,
  chairWidth: number,
  chairDepth: number,
): Record<TableSide, number> | null {
  const counts: Record<TableSide, number> = { N: 0, S: 0, E: 0, W: 0 };
  const horizontalIsLong = tableWidth >= tableDepth;
  const primary: [TableSide, TableSide] = horizontalIsLong ? ['N', 'S'] : ['W', 'E'];
  const secondary: [TableSide, TableSide] = horizontalIsLong ? ['W', 'E'] : ['N', 'S'];
  const longLength = horizontalIsLong ? tableWidth : tableDepth;
  const chairSpan = horizontalIsLong ? chairWidth : chairDepth;
  const perLongSide = Math.max(1, Math.floor(longLength / chairSpan));
  const capacity = perLongSide * 2 + 2;
  if (guestCount > capacity) return null;

  const longSeats = Math.min(guestCount, perLongSide * 2);
  for (let index = 0; index < longSeats; index += 1) {
    counts[primary[index % 2]] += 1;
  }

  const remaining = guestCount - longSeats;
  for (let index = 0; index < remaining; index += 1) {
    counts[secondary[index % 2]] += 1;
  }
  return counts;
}

function buildSeatPlacements(
  table: Item,
  counts: Record<TableSide, number>,
  chairWidth: number,
  chairDepth: number,
): DiningSeatPlacement[] {
  const tableSize = effectiveSize(table);
  const seats: DiningSeatPlacement[] = [];

  for (const x of spreadAlong(table.x, tableSize.w, counts.N, chairWidth)) {
    seats.push({ x, y: table.y - TABLE_GAP - chairDepth, rotation: 0, side: 'N' });
  }
  for (const x of spreadAlong(table.x, tableSize.w, counts.S, chairWidth)) {
    seats.push({ x, y: table.y + tableSize.d + TABLE_GAP, rotation: 180, side: 'S' });
  }
  for (const y of spreadAlong(table.y, tableSize.d, counts.W, chairDepth)) {
    seats.push({ x: table.x - TABLE_GAP - chairWidth, y, rotation: 270, side: 'W' });
  }
  for (const y of spreadAlong(table.y, tableSize.d, counts.E, chairDepth)) {
    seats.push({ x: table.x + tableSize.w + TABLE_GAP, y, rotation: 90, side: 'E' });
  }

  return seats.map((seat) => ({ ...seat, x: Math.round(seat.x), y: Math.round(seat.y) }));
}

function spreadAlong(start: number, length: number, count: number, itemLength: number): number[] {
  if (count === 0) return [];
  const gap = Math.max(0, (length - count * itemLength) / (count + 1));
  return Array.from(
    { length: count },
    (_, index) => start + gap + index * (itemLength + gap),
  );
}

function candidatePositions(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  preferredX: number,
  preferredY: number,
): [number, number][] {
  const positions: [number, number][] = [[preferredX, preferredY]];
  const seen = new Set([`${preferredX},${preferredY}`]);

  for (let y = Math.ceil(minY / SEARCH_STEP) * SEARCH_STEP; y <= maxY; y += SEARCH_STEP) {
    for (let x = Math.ceil(minX / SEARCH_STEP) * SEARCH_STEP; x <= maxX; x += SEARCH_STEP) {
      const key = `${x},${y}`;
      if (!seen.has(key)) {
        seen.add(key);
        positions.push([x, y]);
      }
    }
  }

  return positions.sort((a, b) => {
    const aDistance = (a[0] - preferredX) ** 2 + (a[1] - preferredY) ** 2;
    const bDistance = (b[0] - preferredX) ** 2 + (b[1] - preferredY) ** 2;
    return aDistance - bDistance;
  });
}

function findCollisions(planned: Item[], fixed: Item[]): string[] {
  const blockers = new Set<string>();
  for (const item of planned) {
    if (!CATALOG[item.type]?.blocking) continue;
    for (const other of fixed) {
      if (!CATALOG[other.type]?.blocking) continue;
      if (rectsOverlap(bounds(item), bounds(other))) blockers.add(other.id);
    }
  }
  return [...blockers];
}

function bounds(item: Item) {
  const size = effectiveSize(item);
  return { x: item.x, y: item.y, w: size.w, d: size.d };
}

function rectsOverlap(
  a: { x: number; y: number; w: number; d: number },
  b: { x: number; y: number; w: number; d: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.d && a.y + a.d > b.y;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
