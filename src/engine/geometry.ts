import type { Item, Room, Rotation } from '../types';
import { effectiveSize } from '../types';
import { CATALOG } from '../catalog';

export function findValidPlacements(
  room: Room,
  items: Item[],
  item: Item,
  max: number,
): { x: number; y: number; rotation: Rotation }[] {
  if (max <= 0) return [];
  const results: { x: number; y: number; rotation: Rotation }[] = [];
  const seen = new Set<string>();
  const size = effectiveSize(item);

  const candidates = [
    ...generateWallPositions(room, size, 'N'),
    ...generateWallPositions(room, size, 'W'),
    ...generateWallPositions(room, size, 'S'),
    ...generateWallPositions(room, size, 'E'),
  ];

  for (const position of candidates) {
    if (results.length >= max) return results;
    const key = `${position.x},${position.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (isValid(room, items, item, position.x, position.y)) {
      results.push({ x: position.x, y: position.y, rotation: item.rotation });
    }
  }

  const step = 50;
  for (let y = step; y < room.depth - size.d; y += step) {
    for (let x = step; x < room.width - size.w; x += step) {
      if (results.length >= max) return results;
      const key = `${x},${y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (isValid(room, items, item, x, y)) {
        results.push({ x, y, rotation: item.rotation });
      }
    }
  }

  return results;
}

function generateWallPositions(
  room: Room,
  size: { w: number; d: number },
  wall: 'N' | 'S' | 'E' | 'W',
): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  const step = 20;
  if (wall === 'N') {
    for (let x = 0; x <= room.width - size.w; x += step) positions.push({ x, y: 0 });
  } else if (wall === 'S') {
    for (let x = 0; x <= room.width - size.w; x += step) positions.push({ x, y: room.depth - size.d });
  } else if (wall === 'W') {
    for (let y = 0; y <= room.depth - size.d; y += step) positions.push({ x: 0, y });
  } else {
    for (let y = 0; y <= room.depth - size.d; y += step) positions.push({ x: room.width - size.w, y });
  }
  return positions;
}

function isValid(room: Room, items: Item[], movingItem: Item, x: number, y: number): boolean {
  const size = effectiveSize(movingItem);
  if (x < 0 || y < 0 || x + size.w > room.width || y + size.d > room.depth) return false;
  if (!CATALOG[movingItem.type]?.blocking) return true;

  for (const other of items) {
    if (other.id === movingItem.id || !CATALOG[other.type]?.blocking) continue;
    const otherSize = effectiveSize(other);
    const overlaps =
      x < other.x + otherSize.w &&
      x + size.w > other.x &&
      y < other.y + otherSize.d &&
      y + size.d > other.y;
    if (overlaps) return false;
  }
  return true;
}
