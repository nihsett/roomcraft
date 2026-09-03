import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_ITEMS, DEFAULT_ROOM } from './defaults';
import { critiqueLayout, getFacingDirection, getFacingTarget, itemCenter } from './engine/semantics';
import { useStore } from './store';
import type { Direction, Item } from './types';

const DIRECTION_TO_TABLE: Record<Direction, [number, number]> = {
  N: [0, -1],
  S: [0, 1],
  E: [1, 0],
  W: [-1, 0],
};

describe('prepareDining', () => {
  beforeEach(() => {
    useStore.setState({
      room: structuredClone(DEFAULT_ROOM),
      items: structuredClone(DEFAULT_ITEMS),
      journal: [],
      journalCursor: 0,
      clearanceCm: 80,
      selectedId: null,
      highlightId: null,
      clearanceOverlay: null,
      toolLog: [],
    });
  });

  it('converts the default room into one clean eight-person dining layout atomically', () => {
    let updates = 0;
    const unsubscribe = useStore.subscribe(() => { updates += 1; });
    const result = useStore.getState().prepareDining(8, true);
    unsubscribe();

    expect(typeof result).not.toBe('string');
    expect(updates).toBe(1);

    const state = useStore.getState();
    const chairs = state.items.filter((item) => item.type === 'dining-chair');
    const table = state.items.find((item) => item.type === 'dining-table');
    expect(chairs).toHaveLength(8);
    expect(table).toMatchObject({ x: 170, y: 155, rotation: 0 });
    expect(state.items.some((item) => item.type === 'sofa')).toBe(false);
    expect(state.items.some((item) => item.type === 'armchair')).toBe(false);
    expect(state.items.some((item) => item.type === 'coffee-table')).toBe(false);
    expect(state.items.some((item) => item.type === 'rug')).toBe(true);

    expect(table).toBeDefined();
    if (!table) return;
    for (const chair of chairs) {
      expectChairFacesTable(chair, table);
      expect(getFacingTarget(chair, state.items)?.id).toBe(table.id);
    }
    expect(critiqueLayout(state.items, state.room)).toEqual([]);
  });

  it('reuses existing chairs and reports newly created chairs', () => {
    const result = useStore.getState().prepareDining(8, true);
    expect(typeof result).not.toBe('string');
    if (typeof result === 'string') return;

    expect(result.guestCount).toBe(8);
    expect(result.createdChairIds).toHaveLength(4);
    expect(new Set(result.removedItemIds)).toEqual(new Set(['sofa-1', 'arm-1', 'coffee-1']));
  });

  it('removes extra chairs when the requested guest count is smaller', () => {
    const result = useStore.getState().prepareDining(2, true);
    expect(typeof result).not.toBe('string');
    if (typeof result === 'string') return;

    expect(useStore.getState().items.filter((item) => item.type === 'dining-chair')).toHaveLength(2);
    expect(result.removedItemIds).toEqual(expect.arrayContaining(['dchair-3', 'dchair-4']));
  });
});

function expectChairFacesTable(chair: Item, table: Item) {
  const direction = getFacingDirection(chair);
  expect(direction).not.toBeNull();
  if (!direction) return;

  const chairCenter = itemCenter(chair);
  const tableCenter = itemCenter(table);
  const vector = DIRECTION_TO_TABLE[direction];
  const dot = (tableCenter[0] - chairCenter[0]) * vector[0]
    + (tableCenter[1] - chairCenter[1]) * vector[1];
  expect(dot).toBeGreaterThan(0);
}
