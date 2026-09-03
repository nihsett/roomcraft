import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_ITEMS, DEFAULT_ROOM } from './defaults';
import { useStore } from './store';

describe('room editing behavior', () => {
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

  it('places an individual dining chair next to a table', () => {
    const result = useStore.getState().addItem('dining-chair', 300, 100, 90);
    expect(result).not.toBe('string');
    expect(result).toMatchObject({ type: 'dining-chair', x: 300, y: 100, rotation: 90 });
  });

  it('rejects a batch where one move overlaps, leaving everything untouched', () => {
    const state = useStore.getState();
    const before = state.items.map((item) => ({ id: item.id, x: item.x, y: item.y }));

    const result = state.moveItems([
      { id: 'dchair-1', x: 30, y: 30 }, // valid
      { id: 'sofa-1', x: 140, y: 250 }, // unchanged, still fine
      { id: 'coffee-1', x: 30, y: 30 }, // overlaps the chair target above
    ]);
    expect(result).not.toBe(true);

    const after = useStore.getState().items.map((item) => ({ id: item.id, x: item.x, y: item.y }));
    expect(after).toEqual(before);
  });

  it('applies a fully valid batch', () => {
    const result = useStore.getState().moveItems([
      { id: 'dchair-1', x: 60, y: 350 },
      { id: 'dchair-2', x: 110, y: 350 },
    ]);
    expect(result).toBe(true);
    const items = useStore.getState().items;
    expect(items.find((i) => i.id === 'dchair-1')).toMatchObject({ x: 60, y: 350 });
    expect(items.find((i) => i.id === 'dchair-2')).toMatchObject({ x: 110, y: 350 });
  });
});
