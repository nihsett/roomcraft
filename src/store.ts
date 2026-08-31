import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  ClearancePath,
  Item,
  JournalEntry,
  Room,
  Rotation,
  ToolLogEntry,
} from './types';
import { effectiveSize } from './types';
import { DEFAULT_ITEMS, DEFAULT_ROOM } from './defaults';
import { CATALOG } from './catalog';

let nextId = 100;

function genId(type: string): string {
  return `${type}-${nextId++}`;
}

function isRotation(value: unknown): value is Rotation {
  return value === 0 || value === 90 || value === 180 || value === 270;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

interface RoomCraftState {
  room: Room;
  items: Item[];
  journal: JournalEntry[];
  journalCursor: number;
  clearanceCm: number;
  selectedId: string | null;
  highlightId: string | null;
  clearanceOverlay: ClearancePath[] | null;
  toolLog: ToolLogEntry[];

  setRoom: (room: Room) => void;
  addItem: (type: string, x: number, y: number, rotation?: Rotation) => Item | string;
  moveItem: (id: string, x: number, y: number) => true | string;
  moveItems: (moves: { id: string; x: number; y: number; rotation?: Rotation }[]) => true | string;
  rotateItem: (id: string, rotation: Rotation) => true | string;
  removeItem: (id: string) => true | string;
  selectItem: (id: string | null) => void;
  setClearanceCm: (cm: number) => void;
  setClearanceOverlay: (paths: ClearancePath[] | null) => void;
  setHighlightId: (id: string | null) => void;

  appendJournal: (entry: Omit<JournalEntry, 'ts'>) => void;
  getJournalDelta: () => JournalEntry[];
  logToolCall: (entry: Omit<ToolLogEntry, 'ts'>) => void;

  saveLayout: (name: string) => void;
  loadLayout: (name: string) => boolean;
  listLayouts: () => string[];
  getStateSummary: () => object;
}

export const useStore = create<RoomCraftState>()(
  subscribeWithSelector((set, get) => ({
    room: DEFAULT_ROOM,
    items: DEFAULT_ITEMS,
    journal: [],
    journalCursor: 0,
    clearanceCm: 80,
    selectedId: null,
    highlightId: null,
    clearanceOverlay: null,
    toolLog: [],

    setRoom: (room) => {
      set((state) => {
        const items = state.items.map((item) => {
          const size = effectiveSize(item);
          const maxX = Math.max(0, room.width - size.w);
          const maxY = Math.max(0, room.depth - size.d);
          return {
            ...item,
            x: Math.max(0, Math.min(item.x, maxX)),
            y: Math.max(0, Math.min(item.y, maxY)),
          };
        });
        return { room, items, clearanceOverlay: null };
      });
    },

    addItem: (type, x, y, rotation = 0) => {
      const catalogEntry = CATALOG[type];
      if (!catalogEntry) {
        return `Unknown furniture type: ${type}. Valid types: ${Object.keys(CATALOG).join(', ')}`;
      }
      if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
        return 'Position must use finite x and y values in centimeters.';
      }
      if (!isRotation(rotation)) {
        return 'Rotation must be one of 0, 90, 180, or 270 degrees.';
      }

      const newItem: Item = {
        id: genId(type),
        type,
        label: catalogEntry.label,
        x,
        y,
        w: catalogEntry.w,
        d: catalogEntry.d,
        rotation,
      };
      const state = get();
      const boundsError = checkBounds(state.room, newItem);
      if (boundsError) return boundsError;
      const overlapError = checkOverlap(state.items, newItem);
      if (overlapError) return overlapError;

      set((current) => ({
        items: [...current.items, newItem],
        clearanceOverlay: null,
      }));
      return newItem;
    },

    moveItem: (id, x, y) => {
      const state = get();
      const item = state.items.find((candidate) => candidate.id === id);
      if (!item) return `Item not found: ${id}`;
      if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
        return 'Position must use finite x and y values in centimeters.';
      }

      const moved = { ...item, x, y };
      const boundsError = checkBounds(state.room, moved);
      if (boundsError) return boundsError;
      const overlapError = checkOverlap(state.items.filter((candidate) => candidate.id !== id), moved);
      if (overlapError) return overlapError;

      set((current) => ({
        items: current.items.map((candidate) => (candidate.id === id ? moved : candidate)),
        clearanceOverlay: null,
      }));
      return true;
    },

    moveItems: (moves) => {
      const state = get();
      const movedIds = new Set<string>();
      const proposed = new Map<string, Item>();

      for (const move of moves) {
        if (movedIds.has(move.id)) return `Item listed more than once: ${move.id}`;
        movedIds.add(move.id);

        const item = state.items.find((candidate) => candidate.id === move.id);
        if (!item) return `Item not found: ${move.id}`;
        if (!isFiniteNumber(move.x) || !isFiniteNumber(move.y)) {
          return `${item.label}: position must use finite x and y values in centimeters.`;
        }
        const rotation = move.rotation ?? item.rotation;
        if (!isRotation(rotation)) {
          return `${item.label}: rotation must be one of 0, 90, 180, or 270 degrees.`;
        }
        proposed.set(move.id, { ...item, x: move.x, y: move.y, rotation });
      }

      // Keep the original ordering while replacing every proposed item. This makes
      // the batch a single atomic state update and keeps the z-order stable.
      const allItems = state.items.map((item) => proposed.get(item.id) ?? item);
      for (const item of proposed.values()) {
        const boundsError = checkBounds(state.room, item);
        if (boundsError) return `${item.label}: ${boundsError}`;
        const overlapError = checkOverlap(allItems.filter((candidate) => candidate.id !== item.id), item);
        if (overlapError) return `${item.label}: ${overlapError}`;
      }

      set({ items: allItems, clearanceOverlay: null });
      return true;
    },

    rotateItem: (id, rotation) => {
      const state = get();
      const item = state.items.find((candidate) => candidate.id === id);
      if (!item) return `Item not found: ${id}`;
      if (!isRotation(rotation)) return 'Rotation must be one of 0, 90, 180, or 270 degrees.';

      const rotated = { ...item, rotation };
      const boundsError = checkBounds(state.room, rotated);
      if (boundsError) return boundsError;
      const overlapError = checkOverlap(state.items.filter((candidate) => candidate.id !== id), rotated);
      if (overlapError) return overlapError;

      set((current) => ({
        items: current.items.map((candidate) => (candidate.id === id ? rotated : candidate)),
        clearanceOverlay: null,
      }));
      return true;
    },

    removeItem: (id) => {
      const state = get();
      if (!state.items.some((item) => item.id === id)) return `Item not found: ${id}`;
      set((current) => ({
        items: current.items.filter((item) => item.id !== id),
        selectedId: current.selectedId === id ? null : current.selectedId,
        highlightId: current.highlightId === id ? null : current.highlightId,
        clearanceOverlay: null,
      }));
      return true;
    },

    selectItem: (id) => set({ selectedId: id }),
    setClearanceCm: (cm) => {
      const value = isFiniteNumber(cm) ? cm : 80;
      set({ clearanceCm: Math.max(80, Math.min(120, value)), clearanceOverlay: null });
    },
    setClearanceOverlay: (paths) => set({ clearanceOverlay: paths }),
    setHighlightId: (id) => set({ highlightId: id }),

    appendJournal: (entry) =>
      set((state) => ({
        journal: [...state.journal, { ...entry, ts: Date.now() }],
      })),

    getJournalDelta: () => {
      const state = get();
      const delta = state.journal.slice(state.journalCursor);
      set({ journalCursor: state.journal.length });
      return delta;
    },

    logToolCall: (entry) =>
      set((state) => ({
        toolLog: [...state.toolLog, { ...entry, ts: Date.now() }],
      })),

    getStateSummary: () => {
      const state = get();
      return {
        room: {
          width: state.room.width,
          depth: state.room.depth,
          openings: state.room.openings,
        },
        clearanceCm: state.clearanceCm,
        items: state.items.map((item) => ({
          id: item.id,
          type: item.type,
          label: item.label,
          x: item.x,
          y: item.y,
          w: item.w,
          d: item.d,
          rotation: item.rotation,
        })),
      };
    },

    saveLayout: (name) => {
      const trimmedName = name.trim();
      if (!trimmedName || typeof localStorage === 'undefined') return;
      const state = get();
      const data = {
        room: state.room,
        items: state.items,
        clearanceCm: state.clearanceCm,
      };
      try {
        localStorage.setItem(`roomcraft:${trimmedName}`, JSON.stringify(data));
      } catch {
        // Storage can be unavailable in private browsing; the tool remains usable.
      }
    },

    loadLayout: (name) => {
      if (typeof localStorage === 'undefined') return false;
      try {
        const raw = localStorage.getItem(`roomcraft:${name.trim()}`);
        if (!raw) return false;
        const data = JSON.parse(raw) as { room: Room; items: Item[]; clearanceCm: number };
        if (!data.room || !Array.isArray(data.items)) return false;
        set({
          room: data.room,
          items: data.items,
          clearanceCm: isFiniteNumber(data.clearanceCm) ? data.clearanceCm : 80,
          selectedId: null,
          highlightId: null,
          clearanceOverlay: null,
        });
        return true;
      } catch {
        return false;
      }
    },

    listLayouts: () => {
      const names: string[] = [];
      if (typeof localStorage === 'undefined') return names;
      try {
        for (let index = 0; index < localStorage.length; index += 1) {
          const key = localStorage.key(index);
          if (key?.startsWith('roomcraft:')) names.push(key.slice('roomcraft:'.length));
        }
      } catch {
        // Ignore storage access errors.
      }
      return names.sort((a, b) => a.localeCompare(b));
    },
  })),
);

function getEffectiveBounds(item: Item) {
  const size = effectiveSize(item);
  return { x: item.x, y: item.y, w: size.w, d: size.d };
}

function checkBounds(room: Room, item: Item): string | null {
  const bounds = getEffectiveBounds(item);
  if (
    bounds.x < 0 ||
    bounds.y < 0 ||
    bounds.x + bounds.w > room.width ||
    bounds.y + bounds.d > room.depth
  ) {
    return `Out of bounds. Room is ${room.width}x${room.depth}cm. Item needs (${bounds.x},${bounds.y}) to (${bounds.x + bounds.w},${bounds.y + bounds.d}).`;
  }
  return null;
}

function rectsOverlap(
  a: { x: number; y: number; w: number; d: number },
  b: { x: number; y: number; w: number; d: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.d && a.y + a.d > b.y;
}

function checkOverlap(existing: Item[], newItem: Item): string | null {
  const newBounds = getEffectiveBounds(newItem);
  if (!CATALOG[newItem.type]?.blocking) return null;

  for (const item of existing) {
    if (!CATALOG[item.type]?.blocking) continue;
    if (rectsOverlap(newBounds, getEffectiveBounds(item))) {
      return `Overlaps with ${item.label} (${item.id}). Try a different position.`;
    }
  }
  return null;
}
