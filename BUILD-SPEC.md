# RoomCraft — Full Build Specification

> **What this file is:** A complete, implementation-ready spec for a coding agent (Codex, GPT, etc.) to build RoomCraft from scratch. Every hard part has code examples. Read this entire file before writing any code.

> **Hackathon deadline:** September 3, 2026, 1:00 PM PDT

> **What we're building:** A single-page web app where a human and an AI agent collaboratively design a 2D room layout. The human drags furniture on an SVG canvas. The agent manipulates the same state via WebMCP tools. Both see the same live page.

> **Target browsers:** ChatGPT desktop app (in-app browser, WebMCP on by default) and Chrome 149+ with `chrome://flags/#enable-webmcp-testing`. Test in BOTH.

---

## 1. Tech Stack & Project Setup

### Dependencies (keep minimal)

```
React 18+
Zustand (state management)
Vite (build tool)
Tailwind CSS (styling — utility classes only, no component library)
```

No other dependencies. No backend. No router. Single page.

### Project init

```bash
npm create vite@latest roomcraft -- --template react-ts
cd roomcraft
npm install zustand
npm install -D tailwindcss @tailwindcss/vite
```

Tailwind v4 vite plugin setup in `vite.config.ts`:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

In your main CSS file (`src/index.css`):
```css
@import "tailwindcss";
```

### Project structure

```
src/
  main.tsx              — entry point, renders <App />
  App.tsx               — layout shell (header, canvas, sidebar)
  index.css             — tailwind import + custom styles
  store.ts              — Zustand store (single source of truth)
  types.ts              — TypeScript interfaces
  catalog.ts            — furniture catalog data
  defaults.ts           — default room + default scene items
  webmcp/
    register.ts         — tool registration orchestrator
    tools.ts            — all tool handler functions
    dynamic-tools.ts    — selection-dependent tool registration
  canvas/
    RoomCanvas.tsx      — main SVG canvas component
    FurnitureItem.tsx   — individual furniture piece (SVG group)
    RoomOutline.tsx     — room walls + openings
    ClearanceOverlay.tsx — green/red path overlay
    GridDots.tsx        — background grid
  ui/
    Sidebar.tsx         — right panel (room info + tool log)
    ToolLog.tsx         — live tool call feed
    Header.tsx          — top bar with title + WebMCP status
  engine/
    clearance.ts        — BFS clearance checker
    geometry.ts         — overlap detection, bounds checking, etc.
```

---

## 2. TypeScript Interfaces

Put these in `src/types.ts`. This is the single source of truth for all data shapes. Canvas, store, and tools all use these exact types.

```ts
export type Rotation = 0 | 90 | 180 | 270;
export type Wall = 'N' | 'S' | 'E' | 'W';
export type Direction = 'N' | 'S' | 'E' | 'W';

export interface Item {
  id: string;
  type: string;       // key from catalog, e.g. "sofa"
  label: string;      // human-readable, e.g. "Sofa"
  x: number;          // cm, top-left corner of bounding box AFTER rotation
  y: number;          // cm, top-left corner of bounding box AFTER rotation
  w: number;          // cm, UNROTATED width (left-right)
  d: number;          // cm, UNROTATED depth (top-bottom)
  rotation: Rotation;
}

export interface Opening {
  wall: Wall;
  offset: number;     // cm from left/top of that wall
  width: number;      // cm, width of the opening
  kind: 'door' | 'window';
}

export interface Room {
  width: number;      // cm, x-axis
  depth: number;      // cm, y-axis
  openings: Opening[];
}

export interface JournalEntry {
  ts: number;                    // Date.now()
  action: 'move' | 'rotate' | 'add' | 'remove';
  itemId: string;
  from?: Partial<Item>;          // previous state (for move/rotate)
  to?: Partial<Item>;            // new state
}

export interface PathSegment {
  x1: number; y1: number;
  x2: number; y2: number;
}

export interface ClearancePath {
  from: string;                  // opening description, e.g. "door (S)"
  to: string;                    // opening description
  pass: boolean;
  segments: PathSegment[];
  blockedBy?: string[];          // item IDs causing failure
}

export interface ClearanceResult {
  pass: boolean;
  paths: ClearancePath[];
}

export interface ToolLogEntry {
  ts: number;
  name: string;
  args: Record<string, unknown>;
  result: 'ok' | 'error';
  detail?: string;               // error message or brief summary
}

// The effective bounding box of an item (after rotation)
export function effectiveSize(item: Item): { w: number; d: number } {
  if (item.rotation === 90 || item.rotation === 270) {
    return { w: item.d, d: item.w };
  }
  return { w: item.w, d: item.d };
}
```

---

## 3. Furniture Catalog

Put in `src/catalog.ts`. These are the ONLY furniture types. Dimensions are in centimeters. `blocking: false` means the item is excluded from clearance checks (rugs).

```ts
export interface CatalogEntry {
  type: string;
  label: string;
  w: number;         // unrotated width (cm)
  d: number;         // unrotated depth (cm)
  blocking: boolean; // if false, excluded from clearance (e.g. rug)
  icon: string;      // short emoji or SVG path hint for rendering
}

export const CATALOG: Record<string, CatalogEntry> = {
  'sofa':          { type: 'sofa',          label: 'Sofa',          w: 220, d: 90,  blocking: true,  icon: '🛋️' },
  'loveseat':      { type: 'loveseat',      label: 'Loveseat',      w: 150, d: 85,  blocking: true,  icon: '🛋️' },
  'armchair':      { type: 'armchair',      label: 'Armchair',      w: 85,  d: 85,  blocking: true,  icon: '💺' },
  'coffee-table':  { type: 'coffee-table',  label: 'Coffee Table',  w: 110, d: 60,  blocking: true,  icon: '☕' },
  'tv-stand':      { type: 'tv-stand',      label: 'TV Stand',      w: 160, d: 45,  blocking: true,  icon: '📺' },
  'dining-table':  { type: 'dining-table',  label: 'Dining Table',  w: 160, d: 90,  blocking: true,  icon: '🍽️' },
  'dining-chair':  { type: 'dining-chair',  label: 'Dining Chair',  w: 45,  d: 45,  blocking: true,  icon: '🪑' },
  'bookshelf':     { type: 'bookshelf',     label: 'Bookshelf',     w: 90,  d: 35,  blocking: true,  icon: '📚' },
  'bed-queen':     { type: 'bed-queen',     label: 'Queen Bed',     w: 160, d: 210, blocking: true,  icon: '🛏️' },
  'desk':          { type: 'desk',          label: 'Desk',          w: 140, d: 70,  blocking: true,  icon: '🖥️' },
  'rug':           { type: 'rug',           label: 'Rug',           w: 200, d: 140, blocking: false, icon: '🟫' },
  'plant':         { type: 'plant',         label: 'Plant',         w: 40,  d: 40,  blocking: true,  icon: '🌿' },
};
```

---

## 4. Default Scene

Put in `src/defaults.ts`. This is the initial state when the app loads — a pre-furnished living room.

```ts
import { Room, Item } from './types';

export const DEFAULT_ROOM: Room = {
  width: 500,   // cm
  depth: 400,   // cm
  openings: [
    { wall: 'S', offset: 40,  width: 90,  kind: 'door' },
    { wall: 'E', offset: 280, width: 100, kind: 'door' },    // balcony door
    { wall: 'N', offset: 150, width: 180, kind: 'window' },
  ],
};

// Pre-placed furniture for the default living room scene.
// Positions are in cm from top-left (0,0). Chosen to look like a
// reasonable living room layout.
export const DEFAULT_ITEMS: Item[] = [
  { id: 'sofa-1',     type: 'sofa',         label: 'Sofa',         x: 140, y: 250, w: 220, d: 90,  rotation: 0 },
  { id: 'arm-1',      type: 'armchair',     label: 'Armchair',     x: 40,  y: 260, w: 85,  d: 85,  rotation: 0 },
  { id: 'coffee-1',   type: 'coffee-table', label: 'Coffee Table', x: 170, y: 170, w: 110, d: 60,  rotation: 0 },
  { id: 'tv-1',       type: 'tv-stand',     label: 'TV Stand',     x: 150, y: 10,  w: 160, d: 45,  rotation: 0 },
  { id: 'shelf-1',    type: 'bookshelf',    label: 'Bookshelf',    x: 10,  y: 10,  w: 90,  d: 35,  rotation: 0 },
  { id: 'rug-1',      type: 'rug',          label: 'Rug',          x: 130, y: 150, w: 200, d: 140, rotation: 0 },
  { id: 'plant-1',    type: 'plant',        label: 'Plant',        x: 450, y: 10,  w: 40,  d: 40,  rotation: 0 },
  { id: 'dtable-1',   type: 'dining-table', label: 'Dining Table', x: 30,  y: 80,  w: 160, d: 90,  rotation: 0 },
  { id: 'dchair-1',   type: 'dining-chair', label: 'Chair 1',      x: 50,  y: 55,  w: 45,  d: 45,  rotation: 0 },
  { id: 'dchair-2',   type: 'dining-chair', label: 'Chair 2',      x: 125, y: 55,  w: 45,  d: 45,  rotation: 0 },
  { id: 'dchair-3',   type: 'dining-chair', label: 'Chair 3',      x: 50,  y: 150, w: 45,  d: 45,  rotation: 180 },
  { id: 'dchair-4',   type: 'dining-chair', label: 'Chair 4',      x: 125, y: 150, w: 45,  d: 45,  rotation: 180 },
];
```

---

## 5. Zustand Store

Put in `src/store.ts`. This is the single source of truth. Both the canvas UI and the WebMCP tools read/write through this store.

```ts
import { create } from 'zustand';
import { Item, Room, JournalEntry, ClearancePath, ToolLogEntry, Rotation, effectiveSize } from './types';
import { DEFAULT_ROOM, DEFAULT_ITEMS } from './defaults';
import { CATALOG } from './catalog';

let nextId = 100;
function genId(type: string): string {
  return `${type}-${nextId++}`;
}

interface RoomCraftState {
  room: Room;
  items: Item[];
  journal: JournalEntry[];
  journalCursor: number;         // index of last entry the agent has seen
  clearanceCm: number;
  selectedId: string | null;
  clearanceOverlay: ClearancePath[] | null;
  toolLog: ToolLogEntry[];

  // Actions — called by BOTH UI and tools
  setRoom: (room: Room) => void;
  addItem: (type: string, x: number, y: number, rotation?: Rotation) => Item | string;
  moveItem: (id: string, x: number, y: number) => true | string;
  moveItems: (moves: { id: string; x: number; y: number; rotation?: Rotation }[]) => true | string;
  rotateItem: (id: string, rotation: Rotation) => true | string;
  removeItem: (id: string) => true | string;
  selectItem: (id: string | null) => void;
  setClearanceCm: (cm: number) => void;
  setClearanceOverlay: (paths: ClearancePath[] | null) => void;

  // Journal — human actions only
  appendJournal: (entry: Omit<JournalEntry, 'ts'>) => void;
  getJournalDelta: () => JournalEntry[];

  // Tool log
  logToolCall: (entry: Omit<ToolLogEntry, 'ts'>) => void;

  // Layouts
  saveLayout: (name: string) => void;
  loadLayout: (name: string) => boolean;
  listLayouts: () => string[];

  // State summary for tools
  getStateSummary: () => object;
}

export const useStore = create<RoomCraftState>((set, get) => ({
  room: DEFAULT_ROOM,
  items: DEFAULT_ITEMS,
  journal: [],
  journalCursor: 0,
  clearanceCm: 80,
  selectedId: null,
  clearanceOverlay: null,
  toolLog: [],

  setRoom: (room) => {
    set((s) => {
      // Clamp all items to fit inside new room
      const items = s.items.map((item) => {
        const eff = effectiveSize(item);
        return {
          ...item,
          x: Math.min(item.x, room.width - eff.w),
          y: Math.min(item.y, room.depth - eff.d),
        };
      });
      return { room, items, clearanceOverlay: null };
    });
  },

  addItem: (type, x, y, rotation = 0) => {
    const cat = CATALOG[type];
    if (!cat) return `Unknown furniture type: ${type}. Valid types: ${Object.keys(CATALOG).join(', ')}`;

    const id = genId(type);
    const newItem: Item = { id, type, label: cat.label, x, y, w: cat.w, d: cat.d, rotation };

    // Bounds check
    const boundsErr = checkBounds(get().room, newItem);
    if (boundsErr) return boundsErr;

    // Overlap check (exclude rugs)
    const overlapErr = checkOverlap(get().items, newItem);
    if (overlapErr) return overlapErr;

    set((s) => ({ items: [...s.items, newItem], clearanceOverlay: null }));
    return newItem;
  },

  moveItem: (id, x, y) => {
    const state = get();
    const item = state.items.find((i) => i.id === id);
    if (!item) return `Item not found: ${id}`;

    const moved = { ...item, x, y };
    const boundsErr = checkBounds(state.room, moved);
    if (boundsErr) return boundsErr;

    const overlapErr = checkOverlap(state.items.filter((i) => i.id !== id), moved);
    if (overlapErr) return overlapErr;

    set((s) => ({
      items: s.items.map((i) => (i.id === id ? moved : i)),
      clearanceOverlay: null,
    }));
    return true;
  },

  moveItems: (moves) => {
    const state = get();

    // Build the proposed new items array
    const movedIds = new Set(moves.map((m) => m.id));
    const untouched = state.items.filter((i) => !movedIds.has(i.id));
    const movedItems: Item[] = [];

    for (const move of moves) {
      const item = state.items.find((i) => i.id === move.id);
      if (!item) return `Item not found: ${move.id}`;

      const updated = {
        ...item,
        x: move.x,
        y: move.y,
        rotation: move.rotation ?? item.rotation,
      };
      movedItems.push(updated);
    }

    const allItems = [...untouched, ...movedItems];

    // Validate ALL before applying ANY
    for (const item of movedItems) {
      const boundsErr = checkBounds(state.room, item);
      if (boundsErr) return `${item.label}: ${boundsErr}`;

      const others = allItems.filter((i) => i.id !== item.id);
      const overlapErr = checkOverlap(others, item);
      if (overlapErr) return `${item.label}: ${overlapErr}`;
    }

    set({ items: allItems, clearanceOverlay: null });
    return true;
  },

  rotateItem: (id, rotation) => {
    const state = get();
    const item = state.items.find((i) => i.id === id);
    if (!item) return `Item not found: ${id}`;

    const rotated = { ...item, rotation };
    const boundsErr = checkBounds(state.room, rotated);
    if (boundsErr) return boundsErr;

    const overlapErr = checkOverlap(state.items.filter((i) => i.id !== id), rotated);
    if (overlapErr) return overlapErr;

    set((s) => ({
      items: s.items.map((i) => (i.id === id ? rotated : i)),
      clearanceOverlay: null,
    }));
    return true;
  },

  removeItem: (id) => {
    const state = get();
    if (!state.items.find((i) => i.id === id)) return `Item not found: ${id}`;
    set((s) => ({
      items: s.items.filter((i) => i.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
      clearanceOverlay: null,
    }));
    return true;
  },

  selectItem: (id) => set({ selectedId: id }),

  setClearanceCm: (cm) => set({ clearanceCm: Math.max(80, Math.min(120, cm)), clearanceOverlay: null }),

  setClearanceOverlay: (paths) => set({ clearanceOverlay: paths }),

  appendJournal: (entry) =>
    set((s) => ({ journal: [...s.journal, { ...entry, ts: Date.now() }] })),

  getJournalDelta: () => {
    const state = get();
    const delta = state.journal.slice(state.journalCursor);
    set({ journalCursor: state.journal.length });
    return delta;
  },

  logToolCall: (entry) =>
    set((s) => ({ toolLog: [...s.toolLog, { ...entry, ts: Date.now() }] })),

  getStateSummary: () => {
    const s = get();
    return {
      room: { width: s.room.width, depth: s.room.depth, openings: s.room.openings },
      clearanceCm: s.clearanceCm,
      items: s.items.map((i) => ({
        id: i.id, type: i.type, label: i.label,
        x: i.x, y: i.y, w: i.w, d: i.d, rotation: i.rotation,
      })),
    };
  },

  saveLayout: (name) => {
    const state = get();
    const data = { room: state.room, items: state.items, clearanceCm: state.clearanceCm };
    try { localStorage.setItem(`roomcraft:${name}`, JSON.stringify(data)); } catch {}
  },

  loadLayout: (name) => {
    try {
      const raw = localStorage.getItem(`roomcraft:${name}`);
      if (!raw) return false;
      const data = JSON.parse(raw);
      set({ room: data.room, items: data.items, clearanceCm: data.clearanceCm, clearanceOverlay: null });
      return true;
    } catch { return false; }
  },

  listLayouts: () => {
    const keys: string[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith('roomcraft:')) keys.push(k.replace('roomcraft:', ''));
      }
    } catch {}
    return keys;
  },
}));

// ─── Geometry helpers (used by store actions) ───

function getEffectiveBounds(item: Item) {
  const eff = effectiveSize(item);
  return { x: item.x, y: item.y, w: eff.w, d: eff.d };
}

function checkBounds(room: Room, item: Item): string | null {
  const b = getEffectiveBounds(item);
  if (b.x < 0 || b.y < 0 || b.x + b.w > room.width || b.y + b.d > room.depth) {
    return `Out of bounds. Room is ${room.width}x${room.depth}cm. Item needs (${b.x},${b.y}) to (${b.x + b.w},${b.y + b.d}).`;
  }
  return null;
}

function rectsOverlap(a: { x: number; y: number; w: number; d: number },
                      b: { x: number; y: number; w: number; d: number }): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.d && a.y + a.d > b.y;
}

function checkOverlap(existing: Item[], newItem: Item): string | null {
  const nb = getEffectiveBounds(newItem);
  // Rugs don't collide with anything
  if (!CATALOG[newItem.type]?.blocking) return null;

  for (const item of existing) {
    if (!CATALOG[item.type]?.blocking) continue; // skip rugs
    const eb = getEffectiveBounds(item);
    if (rectsOverlap(nb, eb)) {
      return `Overlaps with ${item.label} (${item.id}). Try a different position.`;
    }
  }
  return null;
}
```

---

## 6. WebMCP Tool Registration

### How WebMCP works (read this carefully)

WebMCP adds `document.modelContext` to the browser. You register tools on it. When an AI agent (ChatGPT, Chrome agent) visits the page, it discovers these tools and can call them.

**Critical pattern:** Check for browser support before registering.

```ts
function isWebMCPAvailable(): boolean {
  return typeof document !== 'undefined'
    && 'modelContext' in document
    && typeof (document as any).modelContext?.registerTool === 'function';
}
```

### Registration wrapper

Put in `src/webmcp/register.ts`. This wraps every tool registration with logging and error handling.

```ts
import { useStore } from '../store';

const modelContext = (document as any).modelContext;

interface ToolDef {
  name: string;
  description: string;
  inputSchema: object;
  execute: (args: any) => Promise<any>;
}

export async function registerTool(tool: ToolDef, signal?: AbortSignal): Promise<void> {
  const wrappedExecute = async (args: any) => {
    const store = useStore.getState();
    try {
      const result = await tool.execute(args);
      store.logToolCall({ name: tool.name, args, result: 'ok', detail: undefined });
      return result;
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      store.logToolCall({ name: tool.name, args, result: 'error', detail: msg });
      return { ok: false, error: msg };
    }
  };

  const opts: any = {};
  if (signal) opts.signal = signal;

  await modelContext.registerTool({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    execute: wrappedExecute,
  }, opts);
}
```

### All static tools

Put in `src/webmcp/tools.ts`. These are registered once on page load.

IMPORTANT: Every tool description is written FOR THE AGENT. Include coordinate system, units, and what the tool returns. The description IS your prompt engineering surface.

IMPORTANT: Every mutating tool returns `{ ok: true, state_summary, human_actions_since_last_call }` on success, or `{ ok: false, error: "..." }` on failure. `state_summary` is the current room state so the agent always has fresh context. `human_actions_since_last_call` is the journal entries since the agent's last tool call (cursor-based).

```ts
import { useStore } from '../store';
import { registerTool } from './register';
import { runClearanceCheck } from '../engine/clearance';
import { findValidPlacements } from '../engine/geometry';

function makeResponse(extra?: Record<string, unknown>) {
  const store = useStore.getState();
  return {
    ok: true,
    state_summary: store.getStateSummary(),
    human_actions_since_last_call: store.getJournalDelta(),
    ...extra,
  };
}

function errResponse(error: string) {
  const store = useStore.getState();
  return {
    ok: false,
    error,
    state_summary: store.getStateSummary(),
    human_actions_since_last_call: store.getJournalDelta(),
  };
}

export async function registerAllStaticTools() {
  // ─── get_room_state ───
  await registerTool({
    name: 'get_room_state',
    description:
      'Returns the current room layout. Coordinate system: origin (0,0) is top-left corner. ' +
      'X increases rightward, Y increases downward. All measurements in centimeters. ' +
      'Items have (x,y) at top-left of their bounding box AFTER rotation. ' +
      'w and d are UNROTATED dimensions; rotation 90/270 swaps them visually. ' +
      'Also returns human_actions_since_last_call: a log of every drag, rotate, add, or delete ' +
      'the human performed since your last tool call. Use this to understand what changed.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    execute: async () => makeResponse(),
  });

  // ─── move_item ───
  await registerTool({
    name: 'move_item',
    description:
      'Move a single furniture item to a new position. ' +
      'x and y are in cm, top-left corner of the item bounding box. ' +
      'Will fail if the position is out of bounds or overlaps another item (rugs excluded from overlap).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The item ID to move' },
        x: { type: 'number', description: 'New x position in cm' },
        y: { type: 'number', description: 'New y position in cm' },
      },
      required: ['id', 'x', 'y'],
    },
    execute: async ({ id, x, y }) => {
      const result = useStore.getState().moveItem(id, x, y);
      if (result === true) return makeResponse();
      return errResponse(result);
    },
  });

  // ─── move_items (BATCH — the key tool for the PARTY demo beat) ───
  await registerTool({
    name: 'move_items',
    description:
      'Move multiple items simultaneously in one atomic batch. ALL moves are validated before ANY are applied. ' +
      'If any single move fails (out of bounds, overlap), the entire batch is rejected and nothing moves. ' +
      'Use this when rearranging a room layout — it produces a smooth simultaneous animation. ' +
      'Each move can optionally include a rotation change.',
    inputSchema: {
      type: 'object',
      properties: {
        moves: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Item ID' },
              x: { type: 'number', description: 'New x in cm' },
              y: { type: 'number', description: 'New y in cm' },
              rotation: { type: 'number', enum: [0, 90, 180, 270], description: 'Optional new rotation' },
            },
            required: ['id', 'x', 'y'],
          },
          description: 'Array of moves to apply atomically',
        },
      },
      required: ['moves'],
    },
    execute: async ({ moves }) => {
      const result = useStore.getState().moveItems(moves);
      if (result === true) return makeResponse();
      return errResponse(result);
    },
  });

  // ─── rotate_item ───
  await registerTool({
    name: 'rotate_item',
    description:
      'Set the rotation of an item. Valid values: 0, 90, 180, 270 degrees clockwise. ' +
      'Rotation 90/270 swaps the item\'s width and depth visually. ' +
      'Will fail if the rotated footprint goes out of bounds or overlaps.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Item ID' },
        rotation: { type: 'number', enum: [0, 90, 180, 270], description: 'Rotation in degrees clockwise' },
      },
      required: ['id', 'rotation'],
    },
    execute: async ({ id, rotation }) => {
      const result = useStore.getState().rotateItem(id, rotation);
      if (result === true) return makeResponse();
      return errResponse(result);
    },
  });

  // ─── add_item ───
  await registerTool({
    name: 'add_item',
    description:
      'Add a new furniture item to the room from the catalog. ' +
      'Valid types: sofa (220x90), loveseat (150x85), armchair (85x85), coffee-table (110x60), ' +
      'tv-stand (160x45), dining-table (160x90), dining-chair (45x45), bookshelf (90x35), ' +
      'bed-queen (160x210), desk (140x70), rug (200x140, non-blocking), plant (40x40). ' +
      'Dimensions are WxD in cm (unrotated). x,y is the top-left of the placed item.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Furniture type from catalog' },
        x: { type: 'number', description: 'X position in cm' },
        y: { type: 'number', description: 'Y position in cm' },
        rotation: { type: 'number', enum: [0, 90, 180, 270], description: 'Optional rotation, default 0' },
      },
      required: ['type', 'x', 'y'],
    },
    execute: async ({ type, x, y, rotation }) => {
      const result = useStore.getState().addItem(type, x, y, rotation);
      if (typeof result === 'string') return errResponse(result);
      return makeResponse({ added_item: result });
    },
  });

  // ─── remove_item ───
  await registerTool({
    name: 'remove_item',
    description: 'Remove a furniture item from the room by its ID.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Item ID to remove' },
      },
      required: ['id'],
    },
    execute: async ({ id }) => {
      const result = useStore.getState().removeItem(id);
      if (result === true) return makeResponse();
      return errResponse(result);
    },
  });

  // ─── measure_distance ───
  await registerTool({
    name: 'measure_distance',
    description:
      'Measure the nearest-edge gap between two items, in centimeters. ' +
      'Returns the shortest distance between the bounding boxes of the two items.',
    inputSchema: {
      type: 'object',
      properties: {
        idA: { type: 'string', description: 'First item ID' },
        idB: { type: 'string', description: 'Second item ID' },
      },
      required: ['idA', 'idB'],
    },
    execute: async ({ idA, idB }) => {
      const state = useStore.getState();
      const a = state.items.find((i) => i.id === idA);
      const b = state.items.find((i) => i.id === idB);
      if (!a) return errResponse(`Item not found: ${idA}`);
      if (!b) return errResponse(`Item not found: ${idB}`);
      const dist = nearestEdgeDistance(a, b);
      return makeResponse({ distance_cm: dist, between: [a.label, b.label] });
    },
  });

  // ─── check_clearance ───
  await registerTool({
    name: 'check_clearance',
    description:
      'Run the clearance checker. Tests whether a person (or wheelchair) can walk between every pair of doors ' +
      'in the room without passing through furniture. Uses current clearanceCm setting (default 80cm, wheelchair 90cm+). ' +
      'Results are displayed as green (pass) and red (fail) path overlays on the canvas. ' +
      'Returns which paths pass/fail and which items block failing paths.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    execute: async () => {
      const state = useStore.getState();
      const result = runClearanceCheck(state.room, state.items, state.clearanceCm);
      state.setClearanceOverlay(result.paths);
      return makeResponse({ clearance: result });
    },
  });

  // ─── set_clearance_mode ───
  await registerTool({
    name: 'set_clearance_mode',
    description:
      'Set the minimum clearance width in cm for walkway checks. ' +
      'Default is 80cm (standard walking). Set to 90cm+ for wheelchair accessibility. Range: 80-120cm. ' +
      'After changing, call check_clearance to re-evaluate paths.',
    inputSchema: {
      type: 'object',
      properties: {
        cm: { type: 'number', description: 'Clearance width in cm (80-120)' },
      },
      required: ['cm'],
    },
    execute: async ({ cm }) => {
      useStore.getState().setClearanceCm(cm);
      return makeResponse();
    },
  });

  // ─── set_room ───
  await registerTool({
    name: 'set_room',
    description:
      'Replace the room dimensions and openings. Items that end up out of bounds will be clamped to fit. ' +
      'Openings define doors and windows. Wall is N/S/E/W, offset is cm from the left (for N/S walls) ' +
      'or top (for E/W walls) of the wall.',
    inputSchema: {
      type: 'object',
      properties: {
        width: { type: 'number', description: 'Room width in cm (x-axis)' },
        depth: { type: 'number', description: 'Room depth in cm (y-axis)' },
        openings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              wall: { type: 'string', enum: ['N', 'S', 'E', 'W'] },
              offset: { type: 'number', description: 'Offset along the wall in cm' },
              width: { type: 'number', description: 'Width of opening in cm' },
              kind: { type: 'string', enum: ['door', 'window'] },
            },
            required: ['wall', 'offset', 'width', 'kind'],
          },
        },
      },
      required: ['width', 'depth', 'openings'],
    },
    execute: async ({ width, depth, openings }) => {
      useStore.getState().setRoom({ width, depth, openings });
      return makeResponse();
    },
  });

  // ─── suggest_positions ───
  await registerTool({
    name: 'suggest_positions',
    description:
      'Returns up to 5 valid, non-overlapping positions where a given item could be placed. ' +
      'Prioritizes wall-snapped positions. Does NOT move the item — just suggests coordinates. ' +
      'Useful before calling move_item or add_item.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Item ID to find positions for (must already exist in room)' },
      },
      required: ['id'],
    },
    execute: async ({ id }) => {
      const state = useStore.getState();
      const item = state.items.find((i) => i.id === id);
      if (!item) return errResponse(`Item not found: ${id}`);
      const positions = findValidPlacements(state.room, state.items, item, 5);
      return makeResponse({ suggested_positions: positions });
    },
  });

  // ─── highlight_item ───
  await registerTool({
    name: 'highlight_item',
    description:
      'Briefly highlight an item on the canvas with a pulsing outline (2 seconds). ' +
      'Use this to visually point at an item when explaining something to the user.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Item ID to highlight' },
      },
      required: ['id'],
    },
    execute: async ({ id }) => {
      const state = useStore.getState();
      if (!state.items.find((i) => i.id === id)) return errResponse(`Item not found: ${id}`);
      // Dispatch a DOM event that the canvas listens for
      window.dispatchEvent(new CustomEvent('roomcraft:highlight', { detail: { id } }));
      return makeResponse();
    },
  });

  // ─── save_layout / load_layout / list_layouts ───
  await registerTool({
    name: 'save_layout',
    description: 'Save the current room layout to browser storage under a name.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Layout name' } },
      required: ['name'],
    },
    execute: async ({ name }) => {
      useStore.getState().saveLayout(name);
      return makeResponse({ saved: name });
    },
  });

  await registerTool({
    name: 'load_layout',
    description: 'Load a previously saved layout by name. Replaces current room state.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Layout name' } },
      required: ['name'],
    },
    execute: async ({ name }) => {
      const ok = useStore.getState().loadLayout(name);
      if (!ok) return errResponse(`Layout not found: ${name}`);
      return makeResponse({ loaded: name });
    },
  });

  await registerTool({
    name: 'list_layouts',
    description: 'List all saved layout names.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    execute: async () => {
      const names = useStore.getState().listLayouts();
      return makeResponse({ layouts: names });
    },
  });
}

// ─── Geometry helper for measure_distance ───
function nearestEdgeDistance(a: Item, b: Item): number {
  const ae = effectiveSize(a);
  const be = effectiveSize(b);
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + ae.w, b.x + be.w));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + ae.d, b.y + be.d));
  return Math.round(Math.sqrt(dx * dx + dy * dy));
}
```

Don't forget to import `effectiveSize` from `types.ts` and `CATALOG` from `catalog.ts` at the top of the store file.

---

## 7. Dynamic Tools (Selection-Dependent)

Put in `src/webmcp/dynamic-tools.ts`.

When an item is selected on the canvas, register 4 extra tools. When deselected, unregister them. Use AbortController to manage lifecycle. This is an advanced WebMCP pattern.

```ts
import { useStore } from '../store';
import { registerTool } from './register';
import { Rotation } from '../types';

let currentController: AbortController | null = null;

export async function updateDynamicTools(selectedId: string | null) {
  // Unregister previous dynamic tools
  if (currentController) {
    currentController.abort();
    currentController = null;
  }

  if (!selectedId) return;

  const controller = new AbortController();
  currentController = controller;
  const signal = controller.signal;

  const item = useStore.getState().items.find((i) => i.id === selectedId);
  if (!item) return;

  await registerTool({
    name: 'rotate_selected',
    description: `Rotate the currently selected item (${item.label}) by 90° clockwise.`,
    inputSchema: { type: 'object', properties: {}, required: [] },
    execute: async () => {
      const state = useStore.getState();
      const current = state.items.find((i) => i.id === selectedId);
      if (!current) return { ok: false, error: 'Item no longer exists' };
      const newRot = ((current.rotation + 90) % 360) as Rotation;
      const result = state.rotateItem(selectedId, newRot);
      if (result === true) {
        state.appendJournal({
          action: 'rotate', itemId: selectedId,
          from: { rotation: current.rotation }, to: { rotation: newRot },
        });
        return { ok: true, state_summary: state.getStateSummary(), human_actions_since_last_call: state.getJournalDelta() };
      }
      return { ok: false, error: result };
    },
  }, signal);

  await registerTool({
    name: 'nudge_selected',
    description: `Nudge the currently selected item (${item.label}) in a compass direction by a given distance.`,
    inputSchema: {
      type: 'object',
      properties: {
        dir: { type: 'string', enum: ['N', 'S', 'E', 'W'], description: 'Direction to nudge' },
        cm: { type: 'number', description: 'Distance to nudge in cm' },
      },
      required: ['dir', 'cm'],
    },
    execute: async ({ dir, cm }) => {
      const state = useStore.getState();
      const current = state.items.find((i) => i.id === selectedId);
      if (!current) return { ok: false, error: 'Item no longer exists' };
      let nx = current.x, ny = current.y;
      if (dir === 'N') ny -= cm;
      if (dir === 'S') ny += cm;
      if (dir === 'E') nx += cm;
      if (dir === 'W') nx -= cm;
      const result = state.moveItem(selectedId, nx, ny);
      if (result === true) {
        return { ok: true, state_summary: state.getStateSummary(), human_actions_since_last_call: state.getJournalDelta() };
      }
      return { ok: false, error: result };
    },
  }, signal);

  await registerTool({
    name: 'remove_selected',
    description: `Remove the currently selected item (${item.label}) from the room.`,
    inputSchema: { type: 'object', properties: {}, required: [] },
    execute: async () => {
      const state = useStore.getState();
      const result = state.removeItem(selectedId);
      if (result === true) {
        return { ok: true, state_summary: state.getStateSummary(), human_actions_since_last_call: state.getJournalDelta() };
      }
      return { ok: false, error: result };
    },
  }, signal);

  await registerTool({
    name: 'swap_selected_with',
    description: `Swap the position of the currently selected item (${item.label}) with another item.`,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID of the item to swap positions with' },
      },
      required: ['id'],
    },
    execute: async ({ id }) => {
      const state = useStore.getState();
      const a = state.items.find((i) => i.id === selectedId);
      const b = state.items.find((i) => i.id === id);
      if (!a) return { ok: false, error: 'Selected item no longer exists' };
      if (!b) return { ok: false, error: `Item not found: ${id}` };
      const result = state.moveItems([
        { id: a.id, x: b.x, y: b.y },
        { id: b.id, x: a.x, y: a.y },
      ]);
      if (result === true) {
        return { ok: true, state_summary: state.getStateSummary(), human_actions_since_last_call: state.getJournalDelta() };
      }
      return { ok: false, error: result };
    },
  }, signal);
}
```

### Wiring dynamic tools to selection changes

In `App.tsx` or wherever you initialize things, subscribe to selection changes:

```ts
import { useStore } from './store';
import { updateDynamicTools } from './webmcp/dynamic-tools';

// Inside a useEffect in App:
useEffect(() => {
  const unsub = useStore.subscribe(
    (state) => state.selectedId,
    (selectedId) => { updateDynamicTools(selectedId); }
  );
  return unsub;
}, []);
```

Note: This uses Zustand's `subscribe` with a selector. Alternatively, use `subscribeWithSelector` middleware.

---

## 8. Clearance Engine

Put in `src/engine/clearance.ts`. This is the most complex algorithm in the app. Read carefully.

### Algorithm overview

1. Rasterize the room to a 10cm grid.
2. Mark cells as occupied if any blocking furniture overlaps them.
3. "Dilate" obstacles — expand occupied cells outward by `(clearanceCm - 10) / 2` cells on each side. This creates a buffer zone representing the width a person/wheelchair needs.
4. For each pair of doors, BFS from one door's cells to the other through unoccupied (un-dilated) cells.
5. If BFS finds a path, record the path segments and mark it passing. If not, record it as failing and list which items block it.

### Implementation

```ts
import { Room, Item, ClearancePath, ClearanceResult, Opening, effectiveSize } from '../types';
import { CATALOG } from '../catalog';

const CELL = 10; // cm per grid cell

export function runClearanceCheck(room: Room, items: Item[], clearanceCm: number): ClearanceResult {
  const cols = Math.ceil(room.width / CELL);
  const rows = Math.ceil(room.depth / CELL);

  // 1. Build occupancy grid
  // Each cell stores the IDs of items blocking it (empty array = free)
  const grid: string[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => [])
  );

  for (const item of items) {
    if (!CATALOG[item.type]?.blocking) continue;
    const eff = effectiveSize(item);
    const startCol = Math.floor(item.x / CELL);
    const startRow = Math.floor(item.y / CELL);
    const endCol = Math.ceil((item.x + eff.w) / CELL);
    const endRow = Math.ceil((item.y + eff.d) / CELL);

    for (let r = startRow; r < endRow && r < rows; r++) {
      for (let c = startCol; c < endCol && c < cols; c++) {
        if (r >= 0 && c >= 0) grid[r][c].push(item.id);
      }
    }
  }

  // 2. Dilate obstacles
  const dilateBy = Math.floor((clearanceCm - CELL) / (2 * CELL));
  const dilated: boolean[][] = Array.from({ length: rows }, () =>
    Array(cols).fill(false)
  );

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c].length > 0) {
        for (let dr = -dilateBy; dr <= dilateBy; dr++) {
          for (let dc = -dilateBy; dc <= dilateBy; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
              dilated[nr][nc] = true;
            }
          }
        }
      }
    }
  }

  // 3. Find door openings and their grid cells
  const doors = room.openings.filter((o) => o.kind === 'door');
  const doorCells: { opening: Opening; cells: [number, number][] }[] = doors.map((o) => ({
    opening: o,
    cells: getOpeningCells(o, room, cols, rows),
  }));

  // 4. BFS between every pair of doors
  const paths: ClearancePath[] = [];

  for (let i = 0; i < doorCells.length; i++) {
    for (let j = i + 1; j < doorCells.length; j++) {
      const from = doorCells[i];
      const to = doorCells[j];
      const bfsResult = bfs(dilated, from.cells, to.cells, rows, cols);

      if (bfsResult) {
        paths.push({
          from: describeOpening(from.opening),
          to: describeOpening(to.opening),
          pass: true,
          segments: pathToSegments(bfsResult),
        });
      } else {
        // Find which items are in the way
        const blockers = findBlockers(grid, from.cells, to.cells, rows, cols);
        paths.push({
          from: describeOpening(from.opening),
          to: describeOpening(to.opening),
          pass: false,
          segments: [],
          blockedBy: [...new Set(blockers)],
        });
      }
    }
  }

  return { pass: paths.every((p) => p.pass), paths };
}

function getOpeningCells(
  o: Opening, room: Room, cols: number, rows: number
): [number, number][] {
  const cells: [number, number][] = [];

  if (o.wall === 'N' || o.wall === 'S') {
    const row = o.wall === 'N' ? 0 : rows - 1;
    const startCol = Math.floor(o.offset / CELL);
    const endCol = Math.ceil((o.offset + o.width) / CELL);
    for (let c = startCol; c < endCol && c < cols; c++) {
      cells.push([row, c]);
    }
  } else {
    const col = o.wall === 'W' ? 0 : cols - 1;
    const startRow = Math.floor(o.offset / CELL);
    const endRow = Math.ceil((o.offset + o.width) / CELL);
    for (let r = startRow; r < endRow && r < rows; r++) {
      cells.push([r, col]);
    }
  }

  return cells;
}

function describeOpening(o: Opening): string {
  return `${o.kind} (${o.wall} wall)`;
}

function bfs(
  blocked: boolean[][],
  startCells: [number, number][],
  endCells: [number, number][],
  rows: number,
  cols: number
): [number, number][] | null {
  const endSet = new Set(endCells.map(([r, c]) => `${r},${c}`));
  const visited = new Map<string, string | null>(); // key -> parent key
  const queue: [number, number][] = [];

  for (const [r, c] of startCells) {
    const key = `${r},${c}`;
    if (!blocked[r][c] || endSet.has(key)) {
      visited.set(key, null);
      queue.push([r, c]);
    }
  }

  const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  let head = 0;

  while (head < queue.length) {
    const [r, c] = queue[head++];
    const key = `${r},${c}`;

    if (endSet.has(key)) {
      // Reconstruct path
      const path: [number, number][] = [];
      let cur: string | null = key;
      while (cur !== null) {
        const [pr, pc] = cur.split(',').map(Number);
        path.unshift([pr, pc]);
        cur = visited.get(cur) ?? null;
      }
      return path;
    }

    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const nkey = `${nr},${nc}`;
      if (visited.has(nkey)) continue;
      if (blocked[nr][nc] && !endSet.has(nkey)) continue;
      visited.set(nkey, key);
      queue.push([nr, nc]);
    }
  }

  return null;
}

function pathToSegments(path: [number, number][]): { x1: number; y1: number; x2: number; y2: number }[] {
  const segments: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    segments.push({
      x1: path[i][1] * CELL + CELL / 2,
      y1: path[i][0] * CELL + CELL / 2,
      x2: path[i + 1][1] * CELL + CELL / 2,
      y2: path[i + 1][0] * CELL + CELL / 2,
    });
  }
  return segments;
}

function findBlockers(
  grid: string[][],
  startCells: [number, number][],
  endCells: [number, number][],
  rows: number,
  cols: number
): string[] {
  // Simple: collect all item IDs that occupy cells along the straight
  // line between the centers of the two door groups
  const blockers: string[] = [];
  const sr = Math.round(startCells.reduce((s, [r]) => s + r, 0) / startCells.length);
  const sc = Math.round(startCells.reduce((s, [, c]) => s + c, 0) / startCells.length);
  const er = Math.round(endCells.reduce((s, [r]) => s + r, 0) / endCells.length);
  const ec = Math.round(endCells.reduce((s, [, c]) => s + c, 0) / endCells.length);

  // Bresenham-like walk
  const steps = Math.max(Math.abs(er - sr), Math.abs(ec - sc));
  for (let i = 0; i <= steps; i++) {
    const r = Math.round(sr + (er - sr) * (i / steps));
    const c = Math.round(sc + (ec - sc) * (i / steps));
    if (r >= 0 && r < rows && c >= 0 && c < cols) {
      blockers.push(...grid[r][c]);
    }
  }

  return blockers;
}
```

### Geometry helpers

Put in `src/engine/geometry.ts`:

```ts
import { Room, Item, effectiveSize } from '../types';
import { CATALOG } from '../catalog';

// Find up to `max` valid non-overlapping placements for an item.
// Prioritize wall-snapped positions, then interior positions.
export function findValidPlacements(
  room: Room, items: Item[], item: Item, max: number
): { x: number; y: number; rotation: number }[] {
  const results: { x: number; y: number; rotation: number }[] = [];
  const eff = effectiveSize(item);
  const step = 10; // check every 10cm

  // Wall-snapped first (x=0, y=0, x=max, y=max)
  const wallPositions = [
    ...generateWallPositions(room, eff, 0, 'N'),  // top wall
    ...generateWallPositions(room, eff, 0, 'W'),  // left wall
    ...generateWallPositions(room, eff, 0, 'S'),  // bottom wall
    ...generateWallPositions(room, eff, 0, 'E'),  // right wall
  ];

  for (const pos of wallPositions) {
    if (results.length >= max) return results;
    if (isValid(room, items, item, pos.x, pos.y)) {
      results.push({ x: pos.x, y: pos.y, rotation: item.rotation });
    }
  }

  // Interior positions
  for (let y = step; y < room.depth - eff.d; y += step * 5) {
    for (let x = step; x < room.width - eff.w; x += step * 5) {
      if (results.length >= max) return results;
      if (isValid(room, items, item, x, y)) {
        results.push({ x, y, rotation: item.rotation });
      }
    }
  }

  return results;
}

function generateWallPositions(
  room: Room, eff: { w: number; d: number }, _rotation: number, wall: string
) {
  const positions: { x: number; y: number }[] = [];
  const step = 20;

  if (wall === 'N') {
    for (let x = 0; x <= room.width - eff.w; x += step) positions.push({ x, y: 0 });
  } else if (wall === 'S') {
    for (let x = 0; x <= room.width - eff.w; x += step) positions.push({ x, y: room.depth - eff.d });
  } else if (wall === 'W') {
    for (let y = 0; y <= room.depth - eff.d; y += step) positions.push({ x: 0, y });
  } else {
    for (let y = 0; y <= room.depth - eff.d; y += step) positions.push({ x: room.width - eff.w, y });
  }

  return positions;
}

function isValid(room: Room, items: Item[], movingItem: Item, x: number, y: number): boolean {
  const eff = effectiveSize(movingItem);
  if (x < 0 || y < 0 || x + eff.w > room.width || y + eff.d > room.depth) return false;
  if (!CATALOG[movingItem.type]?.blocking) return true;

  for (const other of items) {
    if (other.id === movingItem.id) continue;
    if (!CATALOG[other.type]?.blocking) continue;
    const oe = effectiveSize(other);
    if (x < other.x + oe.w && x + eff.w > other.x && y < other.y + oe.d && y + eff.d > other.y) {
      return false;
    }
  }
  return true;
}
```

---

## 9. SVG Canvas Rendering

### Coordinate system

The SVG viewBox maps directly to room centimeters. A 500x400cm room becomes `viewBox="0 0 500 400"`. This means 1 SVG unit = 1 cm. The SVG element itself scales to fit its container via CSS.

### Room outline (`RoomOutline.tsx`)

Draw the room as a rect with wall openings as gaps. Openings are drawn by cutting the wall line.

```tsx
import { Room } from '../types';

export function RoomOutline({ room }: { room: Room }) {
  const { width: w, depth: d, openings } = room;

  // Draw walls as individual line segments, skipping opening gaps
  const wallLines: { x1: number; y1: number; x2: number; y2: number }[] = [];

  // For each wall, generate line segments with gaps for openings
  // North wall: y=0, x goes 0→w
  wallLines.push(...wallWithGaps(0, 0, w, 0, openings.filter(o => o.wall === 'N'), 'horizontal'));
  // South wall: y=d, x goes 0→w
  wallLines.push(...wallWithGaps(0, d, w, d, openings.filter(o => o.wall === 'S'), 'horizontal'));
  // West wall: x=0, y goes 0→d
  wallLines.push(...wallWithGaps(0, 0, 0, d, openings.filter(o => o.wall === 'W'), 'vertical'));
  // East wall: x=w, y goes 0→d
  wallLines.push(...wallWithGaps(w, 0, w, d, openings.filter(o => o.wall === 'E'), 'vertical'));

  return (
    <g className="room-outline">
      {/* Floor background */}
      <rect x={0} y={0} width={w} height={d} fill="#faf8f5" rx={2} />

      {/* Wall segments */}
      {wallLines.map((l, i) => (
        <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
          stroke="#2d2d2d" strokeWidth={4} strokeLinecap="round" />
      ))}

      {/* Door arcs (visual indicator) */}
      {openings.filter(o => o.kind === 'door').map((o, i) => (
        <DoorArc key={i} opening={o} roomWidth={w} roomDepth={d} />
      ))}

      {/* Window marks (double line) */}
      {openings.filter(o => o.kind === 'window').map((o, i) => (
        <WindowMark key={i} opening={o} roomWidth={w} roomDepth={d} />
      ))}
    </g>
  );
}

function wallWithGaps(
  x1: number, y1: number, x2: number, y2: number,
  openings: { offset: number; width: number }[],
  dir: 'horizontal' | 'vertical'
) {
  // Sort openings by offset
  const sorted = [...openings].sort((a, b) => a.offset - b.offset);
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];

  let cursor = 0;
  for (const o of sorted) {
    if (o.offset > cursor) {
      if (dir === 'horizontal') {
        lines.push({ x1: x1 + cursor, y1, x2: x1 + o.offset, y2 });
      } else {
        lines.push({ x1, y1: y1 + cursor, x2, y2: y1 + o.offset });
      }
    }
    cursor = o.offset + o.width;
  }

  const totalLen = dir === 'horizontal' ? (x2 - x1) : (y2 - y1);
  if (cursor < totalLen) {
    if (dir === 'horizontal') {
      lines.push({ x1: x1 + cursor, y1, x2: x1 + totalLen, y2 });
    } else {
      lines.push({ x1, y1: y1 + cursor, x2, y2: y1 + totalLen });
    }
  }

  return lines;
}

// DoorArc: small quarter-circle arc to indicate a door swing
function DoorArc({ opening: o, roomWidth, roomDepth }: { opening: any; roomWidth: number; roomDepth: number }) {
  // Calculate arc position based on wall
  // This draws a small arc to indicate door swing direction
  const r = Math.min(o.width * 0.8, 40); // arc radius

  let cx: number, cy: number, startAngle: number;
  if (o.wall === 'S') { cx = o.offset; cy = roomDepth; startAngle = -90; }
  else if (o.wall === 'N') { cx = o.offset; cy = 0; startAngle = 0; }
  else if (o.wall === 'W') { cx = 0; cy = o.offset; startAngle = 0; }
  else { cx = roomWidth; cy = o.offset; startAngle = 90; }

  // Simple arc path
  const endX = cx + r * Math.cos((startAngle * Math.PI) / 180);
  const endY = cy + r * Math.sin((startAngle * Math.PI) / 180);

  return (
    <path
      d={`M ${cx},${cy} A ${r},${r} 0 0 1 ${endX},${endY}`}
      fill="none" stroke="#999" strokeWidth={1} strokeDasharray="4 3"
    />
  );
}

// WindowMark: double parallel lines
function WindowMark({ opening: o, roomWidth, roomDepth }: { opening: any; roomWidth: number; roomDepth: number }) {
  const gap = 3; // space between the two lines
  let x1: number, y1: number, x2: number, y2: number;

  if (o.wall === 'N' || o.wall === 'S') {
    const y = o.wall === 'N' ? 0 : roomDepth;
    x1 = o.offset; x2 = o.offset + o.width;
    return (
      <g>
        <line x1={x1} y1={y - gap} x2={x2} y2={y - gap} stroke="#5ba3d9" strokeWidth={2} />
        <line x1={x1} y1={y + gap} x2={x2} y2={y + gap} stroke="#5ba3d9" strokeWidth={2} />
      </g>
    );
  } else {
    const x = o.wall === 'W' ? 0 : roomWidth;
    y1 = o.offset; y2 = o.offset + o.width;
    return (
      <g>
        <line x1={x - gap} y1={y1} x2={x - gap} y2={y2} stroke="#5ba3d9" strokeWidth={2} />
        <line x1={x + gap} y1={y1} x2={x + gap} y2={y2} stroke="#5ba3d9" strokeWidth={2} />
      </g>
    );
  }
}
```

### Furniture item (`FurnitureItem.tsx`)

Each item is an SVG `<g>` with a CSS transition on `transform` for smooth animation. Draggable via pointer events.

```tsx
import { Item, effectiveSize } from '../types';
import { useStore } from '../store';
import { useRef, useState, useCallback } from 'react';

const SNAP = 5; // snap to 5cm grid

interface Props {
  item: Item;
  isSelected: boolean;
  svgRef: React.RefObject<SVGSVGElement | null>;
}

export function FurnitureItem({ item, isSelected, svgRef }: Props) {
  const { moveItem, selectItem, appendJournal } = useStore();
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number; itemX: number; itemY: number } | null>(null);
  const eff = effectiveSize(item);

  const toSVGCoords = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const svgPt = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: svgPt.x, y: svgPt.y };
  }, [svgRef]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    selectItem(item.id);
    const svgPt = toSVGCoords(e.clientX, e.clientY);
    dragStart.current = { x: svgPt.x, y: svgPt.y, itemX: item.x, itemY: item.y };
    setDragging(true);
  }, [item.id, item.x, item.y, selectItem, toSVGCoords]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStart.current || !dragging) return;
    const svgPt = toSVGCoords(e.clientX, e.clientY);
    const dx = svgPt.x - dragStart.current.x;
    const dy = svgPt.y - dragStart.current.y;
    const newX = Math.round((dragStart.current.itemX + dx) / SNAP) * SNAP;
    const newY = Math.round((dragStart.current.itemY + dy) / SNAP) * SNAP;
    // During drag, move without animation (handled by removing transition class)
    moveItem(item.id, newX, newY);
  }, [dragging, item.id, moveItem, toSVGCoords]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragStart.current) return;
    setDragging(false);
    // Log to journal (human action)
    if (item.x !== dragStart.current.itemX || item.y !== dragStart.current.itemY) {
      appendJournal({
        action: 'move',
        itemId: item.id,
        from: { x: dragStart.current.itemX, y: dragStart.current.itemY },
        to: { x: item.x, y: item.y },
      });
    }
    dragStart.current = null;
  }, [item, appendJournal]);

  return (
    <g
      // KEY: transform positions the item. CSS transition animates it smoothly
      // UNLESS currently dragging (then no transition for immediate feedback).
      style={{
        transform: `translate(${item.x}px, ${item.y}px)`,
        transition: dragging ? 'none' : 'transform 400ms cubic-bezier(0.4, 0, 0.2, 1)',
        cursor: dragging ? 'grabbing' : 'grab',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Item body */}
      <rect
        x={0} y={0} width={eff.w} height={eff.d}
        rx={4}
        fill={isSelected ? '#e8f0fe' : '#f5f0eb'}
        stroke={isSelected ? '#4285f4' : '#c5b9a8'}
        strokeWidth={isSelected ? 2.5 : 1.5}
      />

      {/* Label */}
      <text
        x={eff.w / 2} y={eff.d / 2}
        textAnchor="middle" dominantBaseline="central"
        fontSize={Math.min(eff.w, eff.d) > 60 ? 12 : 9}
        fill="#555"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {item.label}
      </text>

      {/* Dimensions (show on hover/select) */}
      {isSelected && (
        <text
          x={eff.w / 2} y={eff.d / 2 + 14}
          textAnchor="middle" dominantBaseline="central"
          fontSize={8} fill="#999"
          style={{ pointerEvents: 'none' }}
        >
          {eff.w}×{eff.d}cm
        </text>
      )}
    </g>
  );
}
```

### Critical animation behavior

- **Agent-triggered moves:** Item position in store changes → React re-renders → `transform` CSS property changes → CSS transition animates the movement over 400ms. This is automatic.
- **Human drag:** During drag (`dragging === true`), transition is set to `'none'` so the item follows the pointer immediately. On pointer up, transition re-enables and the item snaps to the nearest grid point with a smooth settle animation.
- **Batch moves (`move_items`):** All items update in the same store mutation → all transform changes happen in the same React render → all items animate simultaneously. This is the PARTY demo beat.

### Main canvas component (`RoomCanvas.tsx`)

```tsx
import { useRef, useCallback } from 'react';
import { useStore } from '../store';
import { RoomOutline } from './RoomOutline';
import { FurnitureItem } from './FurnitureItem';
import { ClearanceOverlay } from './ClearanceOverlay';
import { GridDots } from './GridDots';

export function RoomCanvas() {
  const svgRef = useRef<SVGSVGElement>(null);
  const room = useStore((s) => s.room);
  const items = useStore((s) => s.items);
  const selectedId = useStore((s) => s.selectedId);
  const clearanceOverlay = useStore((s) => s.clearanceOverlay);
  const selectItem = useStore((s) => s.selectItem);

  const onCanvasClick = useCallback(() => {
    selectItem(null);
  }, [selectItem]);

  // Keyboard shortcuts
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!selectedId) return;
    const store = useStore.getState();
    const item = store.items.find(i => i.id === selectedId);
    if (!item) return;

    if (e.key === 'r' || e.key === 'R') {
      const newRot = ((item.rotation + 90) % 360) as 0 | 90 | 180 | 270;
      const oldRot = item.rotation;
      const result = store.rotateItem(selectedId, newRot);
      if (result === true) {
        store.appendJournal({
          action: 'rotate', itemId: selectedId,
          from: { rotation: oldRot }, to: { rotation: newRot },
        });
      }
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      store.removeItem(selectedId);
      store.appendJournal({ action: 'remove', itemId: selectedId });
    }
  }, [selectedId]);

  // Add padding around room for visual breathing room
  const pad = 20;
  const vb = `${-pad} ${-pad} ${room.width + pad * 2} ${room.depth + pad * 2}`;

  return (
    <svg
      ref={svgRef}
      viewBox={vb}
      className="w-full h-full"
      style={{ maxHeight: '100%' }}
      onClick={onCanvasClick}
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      <GridDots width={room.width} height={room.depth} spacing={50} />
      <RoomOutline room={room} />

      {/* Render items sorted: rugs first (bottom), then blocking items, selected on top */}
      {items
        .sort((a, b) => {
          if (a.id === selectedId) return 1;
          if (b.id === selectedId) return -1;
          if (a.type === 'rug') return -1;
          if (b.type === 'rug') return 1;
          return 0;
        })
        .map((item) => (
          <FurnitureItem
            key={item.id}
            item={item}
            isSelected={item.id === selectedId}
            svgRef={svgRef}
          />
        ))
      }

      {clearanceOverlay && <ClearanceOverlay paths={clearanceOverlay} />}
    </svg>
  );
}
```

### Grid dots (`GridDots.tsx`)

```tsx
export function GridDots({ width, height, spacing }: { width: number; height: number; spacing: number }) {
  const dots: { x: number; y: number }[] = [];
  for (let x = 0; x <= width; x += spacing) {
    for (let y = 0; y <= height; y += spacing) {
      dots.push({ x, y });
    }
  }
  return (
    <g>
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={1.5} fill="#e0dbd5" />
      ))}
    </g>
  );
}
```

### Clearance overlay (`ClearanceOverlay.tsx`)

```tsx
import { ClearancePath } from '../types';

export function ClearanceOverlay({ paths }: { paths: ClearancePath[] }) {
  return (
    <g>
      {paths.map((p, i) =>
        p.segments.map((s, j) => (
          <line
            key={`${i}-${j}`}
            x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
            stroke={p.pass ? '#22c55e' : '#ef4444'}
            strokeWidth={6}
            strokeLinecap="round"
            opacity={0.6}
          />
        ))
      )}
    </g>
  );
}
```

---

## 10. UI Layout & Sidebar

### App shell (`App.tsx`)

```tsx
import { useEffect } from 'react';
import { RoomCanvas } from './canvas/RoomCanvas';
import { Sidebar } from './ui/Sidebar';
import { Header } from './ui/Header';
import { registerAllStaticTools } from './webmcp/tools';
import { updateDynamicTools } from './webmcp/dynamic-tools';
import { useStore } from './store';

function isWebMCPAvailable(): boolean {
  return typeof document !== 'undefined'
    && 'modelContext' in document
    && typeof (document as any).modelContext?.registerTool === 'function';
}

export default function App() {
  useEffect(() => {
    if (isWebMCPAvailable()) {
      registerAllStaticTools();
    }
  }, []);

  // Dynamic tools on selection change
  useEffect(() => {
    if (!isWebMCPAvailable()) return;
    const unsub = useStore.subscribe(
      (state) => state.selectedId,
      (selectedId) => { updateDynamicTools(selectedId); },
    );
    return unsub;
  }, []);

  // Highlight event listener (for highlight_item tool)
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail?.id;
      // Find the SVG element for this item and add a pulse animation class
      // The FurnitureItem component should check for this
      // Simple approach: set a state, clear after 2s
    };
    window.addEventListener('roomcraft:highlight', handler);
    return () => window.removeEventListener('roomcraft:highlight', handler);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-[#fdfcfa]">
      <Header connected={isWebMCPAvailable()} />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 p-4">
          <RoomCanvas />
        </div>
        <Sidebar />
      </div>
    </div>
  );
}
```

Note: The `useStore.subscribe` with a selector requires the `subscribeWithSelector` middleware. Add it to the store:

```ts
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export const useStore = create<RoomCraftState>()(
  subscribeWithSelector((set, get) => ({
    // ... all store content
  }))
);
```

### Header (`Header.tsx`)

```tsx
export function Header({ connected }: { connected: boolean }) {
  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-[#e8e3dd]">
      <div>
        <h1 className="text-xl font-semibold text-[#2d2d2d] tracking-tight">RoomCraft</h1>
        <p className="text-sm text-[#888]">Collaborative room design with AI</p>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span
          className={`inline-block w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-amber-400'}`}
        />
        <span className="text-[#888]">
          {connected ? 'WebMCP connected' : 'WebMCP not detected — enable in chrome://flags'}
        </span>
      </div>
    </header>
  );
}
```

### Sidebar with tool log (`Sidebar.tsx`)

```tsx
import { useStore } from '../store';
import { ToolLog } from './ToolLog';

export function Sidebar() {
  const room = useStore((s) => s.room);
  const items = useStore((s) => s.items);
  const clearanceCm = useStore((s) => s.clearanceCm);

  return (
    <aside className="w-80 border-l border-[#e8e3dd] flex flex-col bg-white">
      {/* Room info */}
      <div className="p-4 border-b border-[#e8e3dd]">
        <h2 className="text-sm font-medium text-[#2d2d2d] mb-2">Room</h2>
        <p className="text-sm text-[#666]">
          {room.width}×{room.depth}cm · {items.length} items
        </p>
        <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#f0eeeb] text-xs text-[#666]">
          Clearance: {clearanceCm}cm
          {clearanceCm >= 90 && <span title="Wheelchair accessible">♿</span>}
        </div>
      </div>

      {/* Tool call log — this must look great on video */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <h2 className="text-sm font-medium text-[#2d2d2d] px-4 pt-3 pb-1">Agent Activity</h2>
        <ToolLog />
      </div>
    </aside>
  );
}
```

### Tool log (`ToolLog.tsx`)

This panel shows every WebMCP tool call in real time. It MUST look polished because it's visible in the demo video.

```tsx
import { useEffect, useRef } from 'react';
import { useStore } from '../store';

export function ToolLog() {
  const toolLog = useStore((s) => s.toolLog);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [toolLog.length]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
      {toolLog.length === 0 && (
        <p className="text-xs text-[#bbb] italic">Waiting for agent tool calls...</p>
      )}
      {toolLog.map((entry, i) => (
        <div key={i} className="text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${
              entry.result === 'ok' ? 'bg-green-500' : 'bg-red-500'
            }`} />
            <span className="font-semibold text-[#2d2d2d]">{entry.name}</span>
            <span className="text-[#bbb] ml-auto">
              {new Date(entry.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
          {Object.keys(entry.args).length > 0 && (
            <pre className="text-[#999] mt-0.5 ml-3 truncate max-w-full">
              {JSON.stringify(entry.args)}
            </pre>
          )}
          {entry.detail && (
            <p className="text-red-500 mt-0.5 ml-3">{entry.detail}</p>
          )}
        </div>
      ))}
    </div>
  );
}
```

---

## 11. Highlight Item (Agent Pointing)

The `highlight_item` tool lets the agent visually point at things. Implementation:

Add a `highlightId` field to the store:

```ts
highlightId: string | null;
setHighlightId: (id: string | null) => void;
```

In the tool handler, set it and clear after 2 seconds:

```ts
execute: async ({ id }) => {
  const store = useStore.getState();
  if (!store.items.find((i) => i.id === id)) return errResponse(`Item not found: ${id}`);
  store.setHighlightId(id);
  setTimeout(() => useStore.getState().setHighlightId(null), 2000);
  return makeResponse();
},
```

In `FurnitureItem.tsx`, add a pulsing outline when highlighted:

```tsx
const highlightId = useStore((s) => s.highlightId);
const isHighlighted = highlightId === item.id;

// In the rect element:
<rect
  ...
  className={isHighlighted ? 'animate-pulse-outline' : ''}
/>
```

CSS animation (add to `index.css`):

```css
@keyframes pulse-outline {
  0%, 100% { stroke: #f59e0b; stroke-width: 3; }
  50% { stroke: #f59e0b; stroke-width: 5; }
}
.animate-pulse-outline {
  animation: pulse-outline 0.5s ease-in-out 4;
}
```

---

## 12. Deployment

### Vercel (recommended)

1. Push to GitHub (public repo, MIT license)
2. Connect repo to Vercel
3. Build command: `npm run build`
4. Output directory: `dist`
5. No environment variables needed

### Netlify (alternative)

Same process. Build command: `npm run build`, publish directory: `dist`.

### Origin trial for Chrome (optional but recommended)

Register for the WebMCP origin trial at `developer.chrome.com/origintrials` so the app works in Chrome without the flag. This makes the live URL more judge-friendly.

---

## 13. Demo Video Script (Under 3 Minutes)

### Setup (0:00 – 0:15)
Open screen recording. Show RoomCraft loaded in ChatGPT desktop browser. Quick shot of the pre-furnished living room. Show the "WebMCP connected" green dot.

### Beat 1: PARTY (0:15 – 0:50)
Type in ChatGPT: "I'm hosting a dinner party for 8 people tonight. Can you rearrange the room?"

Show the agent thinking, then watch: tool calls appear in the log panel. The agent calls `get_room_state`, then `add_item` for extra chairs, then `move_items` with a batch of moves. ALL furniture glides to new positions simultaneously. Dining area opens up, sofa group shifts.

Voice: "The agent reads the current layout, plans the rearrangement, and moves everything at once."

### Beat 2: ACCESSIBILITY (0:50 – 1:30)
Type: "Actually, my mom is coming and she uses a wheelchair. Can you make sure she can get around?"

Agent calls `set_clearance_mode(90)`, then `check_clearance`. Red paths appear on canvas where walkways are too narrow. Agent calls `move_items` to fix the blocked paths. Red turns green.

Voice: "With one sentence, the agent switches to wheelchair clearance mode and fixes every tight spot."

### Beat 3: PUSHBACK (1:30 – 2:10)
Manually drag the sofa to block the balcony door. Type: "What do you think?"

Agent calls `get_room_state`, sees the drag in `human_actions_since_last_call`, notices the sofa is blocking the door. Responds pointing it out. Type "fix it." Agent calls `move_items`, sofa glides to a safe position.

Voice: "The agent tracks your changes and pushes back when something doesn't work."

### Closing (2:10 – 2:30)
Quick scroll through the tool log showing all the calls. Flash the code showing `registerTool`. End card with GitHub link.

---

## 14. README Structure

The README is a judging requirement. It must include:

```markdown
# RoomCraft

Collaborative room design where humans and AI agents work on the same canvas.
Built for the [WebMCP Challenge](https://webmcp.devpost.com/).

## How It Works

RoomCraft registers 15+ WebMCP tools that let any AI agent manipulate a 2D room layout.
The human drags furniture directly. The agent calls structured tools. Both see the same
live canvas.

```js
await document.modelContext.registerTool({
  name: 'move_items',
  description: 'Move multiple items simultaneously in one atomic batch...',
  inputSchema: { /* ... */ },
  execute: async ({ moves }) => { /* ... */ },
});
```

## Try It

**ChatGPT Desktop:** Open [roomcraft.example.com] in the ChatGPT browser, then ask
"rearrange this room for a dinner party."

**Chrome 149+:** Enable `chrome://flags/#enable-webmcp-testing`, open the URL, then use
Chrome's agent features.

## Architecture

- **Pull-based journal pattern:** The agent can't observe UI events. Every human action
  (drag, rotate, delete) is logged to a journal. Tool responses include a delta of human
  actions since the agent's last call, so it stays aware of what changed.

- **Atomic batch moves:** `move_items` validates all moves before applying any. One
  simultaneous animation. This enables full room rearrangements in a single tool call.

- **Dynamic tool registration:** Selection-dependent tools (rotate_selected, nudge_selected,
  etc.) register/unregister via AbortController as items are selected/deselected.

- **Clearance engine:** BFS pathfinding on a 10cm grid with obstacle dilation for
  configurable corridor width (standard 80cm, wheelchair 90cm+).

## Tech Stack

React · Zustand · Vite · Tailwind CSS · SVG canvas · No backend

## License

MIT
```

---

## 15. Checklist Before Submission

- [ ] Live URL works in ChatGPT desktop browser
- [ ] Live URL works in Chrome 149+ with flag
- [ ] All 15 static tools register without errors
- [ ] Dynamic tools register on select, unregister on deselect
- [ ] All 3 demo beats work flawlessly
- [ ] Tool log panel shows calls in real time
- [ ] Animations are smooth (no jank)
- [ ] GitHub repo is public
- [ ] MIT license file exists AND is set in repo About section
- [ ] README has registerTool code snippet
- [ ] Demo video is under 3 minutes with audio
- [ ] Devpost submission has: URL, description, video, repo link
