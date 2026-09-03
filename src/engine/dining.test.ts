import { describe, expect, it } from 'vitest';
import type { Item, Room } from '../types';
import { effectiveSize } from '../types';
import { planDiningLayout } from './dining';

const ROOM: Room = {
  width: 500,
  depth: 400,
  openings: [],
};

const TABLE: Item = {
  id: 'table-1',
  type: 'dining-table',
  label: 'Dining Table',
  x: 20,
  y: 20,
  w: 160,
  d: 90,
  rotation: 0,
};

describe('planDiningLayout', () => {
  it('produces every requested chair count from 1 through 8', () => {
    for (let guestCount = 1; guestCount <= 8; guestCount += 1) {
      const result = planDiningLayout(ROOM, [TABLE], TABLE, guestCount, false);
      expect(result.ok, `guest count ${guestCount}`).toBe(true);
      if (!result.ok) continue;
      expect(result.plan.seats).toHaveLength(guestCount);
      expectSeatsInBounds(result.plan.seats.map((seat, index) => chairFromSeat(seat, index)), ROOM);
    }
  });

  it('seats eight as three per long side and one at each end, all facing inward', () => {
    const result = planDiningLayout(ROOM, [TABLE], TABLE, 8, false);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.plan.seats.map((seat) => seat.side)).toEqual([
      'N', 'N', 'N',
      'S', 'S', 'S',
      'W', 'E',
    ]);
    expect(result.plan.seats.map((seat) => seat.rotation)).toEqual([
      0, 0, 0,
      180, 180, 180,
      270, 90,
    ]);
    expect(result.plan.table).toEqual({ x: 170, y: 155, rotation: 0 });
  });

  it('clears lounge furniture while preserving room fixtures and rugs', () => {
    const sofa = item('sofa-1', 'sofa', 140, 250, 220, 90);
    const armchair = item('arm-1', 'armchair', 40, 260, 85, 85);
    const coffeeTable = item('coffee-1', 'coffee-table', 170, 170, 110, 60);
    const rug = item('rug-1', 'rug', 130, 150, 200, 140);
    const tv = item('tv-1', 'tv-stand', 150, 10, 160, 45);
    const result = planDiningLayout(
      ROOM,
      [TABLE, sofa, armchair, coffeeTable, rug, tv],
      TABLE,
      8,
      true,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(new Set(result.plan.removeItemIds)).toEqual(new Set(['sofa-1', 'arm-1', 'coffee-1']));
    expect(result.plan.removeItemIds).not.toContain('rug-1');
    expect(result.plan.removeItemIds).not.toContain('tv-1');
  });

  it('moves away from a central blocker instead of overlapping it', () => {
    const blocker = item('blocker-1', 'sofa', 140, 140, 220, 100);
    const result = planDiningLayout(ROOM, [TABLE, blocker], TABLE, 4, false);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.table).not.toEqual({ x: 170, y: 155, rotation: 0 });

    const planned = [
      { ...TABLE, ...result.plan.table },
      ...result.plan.seats.map((seat, index) => chairFromSeat(seat, index)),
    ];
    for (const plannedItem of planned) {
      expect(overlaps(plannedItem, blocker)).toBe(false);
    }
  });

  it('rejects a room that cannot contain the requested dining group', () => {
    const tinyRoom: Room = { width: 200, depth: 150, openings: [] };
    const result = planDiningLayout(tinyRoom, [TABLE], TABLE, 8, false);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('too small');
  });
});

function chairFromSeat(
  seat: { x: number; y: number; rotation: 0 | 90 | 180 | 270 },
  index: number,
): Item {
  return {
    id: `chair-${index}`,
    type: 'dining-chair',
    label: `Chair ${index + 1}`,
    x: seat.x,
    y: seat.y,
    w: 45,
    d: 45,
    rotation: seat.rotation,
  };
}

function item(id: string, type: string, x: number, y: number, w: number, d: number): Item {
  return { id, type, label: type, x, y, w, d, rotation: 0 };
}

function expectSeatsInBounds(chairs: Item[], room: Room) {
  for (const chair of chairs) {
    const size = effectiveSize(chair);
    expect(chair.x).toBeGreaterThanOrEqual(0);
    expect(chair.y).toBeGreaterThanOrEqual(0);
    expect(chair.x + size.w).toBeLessThanOrEqual(room.width);
    expect(chair.y + size.d).toBeLessThanOrEqual(room.depth);
  }
}

function overlaps(first: Item, second: Item): boolean {
  const a = effectiveSize(first);
  const b = effectiveSize(second);
  return first.x < second.x + b.w
    && first.x + a.w > second.x
    && first.y < second.y + b.d
    && first.y + a.d > second.y;
}
