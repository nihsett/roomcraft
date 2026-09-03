import { useStore } from '../store';
import { effectiveSize } from '../types';
import type { Item, Opening, Rotation } from '../types';
import { CATALOG, CATALOG_TYPES } from '../catalog';
import { runClearanceCheck } from '../engine/clearance';
import { findValidPlacements } from '../engine/geometry';
import {
  critiqueLayout,
  itemCenter,
  placeAgainstWall,
  rotationToFace,
} from '../engine/semantics';
import { registerTool } from './register';

let highlightTimer: number | null = null;

function makeResponse(extra: Record<string, unknown> = {}) {
  const store = useStore.getState();
  const warnings = critiqueLayout(store.items, store.room);
  return {
    ok: true,
    state_summary: store.getStateSummary(),
    human_actions_since_last_call: store.getJournalDelta(),
    ...(warnings.length > 0 ? { layout_warnings: warnings } : {}),
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

export async function registerAllStaticTools(): Promise<void> {
  await registerTool({
    name: 'get_room_state',
    description:
      'Returns the current room layout. Coordinate system: origin (0,0) is the top-left corner. ' +
      'X increases rightward and Y increases downward. All measurements are in centimeters. ' +
      'Items have (x,y) at the top-left of their bounding box AFTER rotation; w and d are ' +
      'UNROTATED dimensions, so rotation 90/270 swaps the visual footprint. Also returns ' +
      'human_actions_since_last_call: every drag, rotate, add, or delete the human performed ' +
      'since your last tool call. Use it to understand what changed. For dinner guests, hosting, ' +
      'When seating a dining group, place each chair facing its table.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    execute: async () => makeResponse(),
  });

  await registerTool({
    name: 'move_item',
    description:
      'Move one furniture item to a new position. x and y are centimeters measured from the ' +
      'top-left corner of the room and identify the top-left corner of the item footprint. ' +
      'Fails if the item is out of bounds or overlaps another blocking item; rugs do not collide. ' +
      'Do not hand-place dining chairs blindly; seat them facing the table.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID of the item to move' },
        x: { type: 'number', description: 'New x position in centimeters' },
        y: { type: 'number', description: 'New y position in centimeters' },
      },
      required: ['id', 'x', 'y'],
    },
    execute: async ({ id, x, y }) => {
      const result = useStore.getState().moveItem(id, x, y);
      return result === true ? makeResponse() : errResponse(result);
    },
  });

  await registerTool({
    name: 'move_items',
    description:
      'Move multiple items simultaneously in one atomic batch. ALL moves are validated before ANY ' +
      'are applied. If one move is out of bounds or overlaps another blocking item, the entire batch ' +
      'is rejected and nothing moves. Use this for a coordinated room rearrangement; all accepted ' +
      'items animate together. Each move may optionally include rotation 0, 90, 180, or 270. ' +
      'When arranging dining chairs around a table, make every chair face the table.',
    inputSchema: {
      type: 'object',
      properties: {
        moves: {
          type: 'array',
          description: 'Array of item moves to apply atomically',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Item ID' },
              x: { type: 'number', description: 'New x in centimeters' },
              y: { type: 'number', description: 'New y in centimeters' },
              rotation: {
                type: 'number',
                enum: [0, 90, 180, 270],
                description: 'Optional clockwise rotation',
              },
            },
            required: ['id', 'x', 'y'],
          },
        },
      },
      required: ['moves'],
    },
    execute: async ({ moves }) => {
      if (!Array.isArray(moves)) return errResponse('moves must be an array.');
      const result = useStore.getState().moveItems(moves);
      return result === true ? makeResponse() : errResponse(result);
    },
  });

  await registerTool({
    name: 'rotate_item',
    description:
      'Set an item rotation to 0, 90, 180, or 270 degrees clockwise. Rotation 90/270 swaps ' +
      'the item width and depth visually. Fails if the rotated footprint is out of bounds or overlaps.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID of the item to rotate' },
        rotation: {
          type: 'number',
          enum: [0, 90, 180, 270],
          description: 'Clockwise rotation in degrees',
        },
      },
      required: ['id', 'rotation'],
    },
    execute: async ({ id, rotation }) => {
      const result = useStore.getState().rotateItem(id, rotation);
      return result === true ? makeResponse() : errResponse(result);
    },
  });

  await registerTool({
    name: 'add_item',
    description:
      `Add furniture from the catalog. Valid types: ${CATALOG_TYPES.map((type) => {
        const item = CATALOG[type];
        return `${type} (${item.w}x${item.d}cm)`;
      }).join(', ')}. ` +
      'Dimensions are unrotated width x depth in centimeters. x,y is the top-left of the placed ' +
      'footprint. Fails if the item is out of bounds or overlaps blocking furniture; rugs are non-blocking. ' +
      'Dining chairs can be placed with add_item — aim each chair at the table it faces.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Furniture type from the catalog' },
        x: { type: 'number', description: 'X position in centimeters' },
        y: { type: 'number', description: 'Y position in centimeters' },
        rotation: {
          type: 'number',
          enum: [0, 90, 180, 270],
          description: 'Optional clockwise rotation; defaults to 0',
        },
      },
      required: ['type', 'x', 'y'],
    },
    execute: async ({ type, x, y, rotation }) => {
      const result = useStore.getState().addItem(type, x, y, rotation);
      return typeof result === 'string'
        ? errResponse(result)
        : makeResponse({ added_item: result });
    },
  });

  await registerTool({
    name: 'remove_item',
    description: 'Remove a furniture item from the room by its ID.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'ID of the item to remove' } },
      required: ['id'],
    },
    execute: async ({ id }) => {
      const result = useStore.getState().removeItem(id);
      return result === true ? makeResponse() : errResponse(result);
    },
  });

  await registerTool({
    name: 'measure_distance',
    description:
      'Measure the nearest-edge gap between two item bounding boxes in centimeters. Returns 0 ' +
      'when their footprints overlap. The distance is measured using the effective rotated footprints.',
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
      const a = state.items.find((item) => item.id === idA);
      const b = state.items.find((item) => item.id === idB);
      if (!a) return errResponse(`Item not found: ${idA}`);
      if (!b) return errResponse(`Item not found: ${idB}`);
      return makeResponse({
        distance_cm: nearestEdgeDistance(a, b),
        between: [a.label, b.label],
      });
    },
  });

  await registerTool({
    name: 'check_clearance',
    description:
      'Run the clearance checker between every pair of doors. It tests whether a person or ' +
      'wheelchair can walk through the room without crossing blocking furniture, using the current ' +
      'clearanceCm setting (80cm default; use 90cm or more for wheelchair access). Results appear ' +
      'as green passing and red failing path overlays. Returns each path and its blocking item IDs.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    execute: async () => {
      const state = useStore.getState();
      const clearance = runClearanceCheck(state.room, state.items, state.clearanceCm);
      state.setClearanceOverlay(clearance.paths);
      return makeResponse({ clearance });
    },
  });

  await registerTool({
    name: 'set_clearance_mode',
    description:
      'Set the minimum walkway clearance width in centimeters. The accepted range is 80-120cm. ' +
      'Use 80cm for standard walking and 90cm or more for wheelchair accessibility. Call ' +
      'check_clearance afterward to re-evaluate the current room.',
    inputSchema: {
      type: 'object',
      properties: {
        cm: { type: 'number', description: 'Clearance width in centimeters, from 80 to 120' },
      },
      required: ['cm'],
    },
    execute: async ({ cm }) => {
      useStore.getState().setClearanceCm(cm);
      return makeResponse();
    },
  });

  await registerTool({
    name: 'set_room',
    description:
      'Replace room dimensions and openings. Origin is the top-left; width is the x-axis and depth ' +
      'is the y-axis, all in centimeters. Items outside the new room are clamped to the nearest fit. ' +
      'For N/S openings, offset is measured from the left; for E/W openings, offset is measured from the top. ' +
      'Each opening has wall N/S/E/W, offset, width, and kind door/window.',
    inputSchema: {
      type: 'object',
      properties: {
        width: { type: 'number', description: 'Room width in centimeters' },
        depth: { type: 'number', description: 'Room depth in centimeters' },
        openings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              wall: { type: 'string', enum: ['N', 'S', 'E', 'W'] },
              offset: { type: 'number', description: 'Offset along the wall in centimeters' },
              width: { type: 'number', description: 'Opening width in centimeters' },
              kind: { type: 'string', enum: ['door', 'window'] },
            },
            required: ['wall', 'offset', 'width', 'kind'],
          },
        },
      },
      required: ['width', 'depth', 'openings'],
    },
    execute: async ({ width, depth, openings }) => {
      if (!isPositiveNumber(width) || !isPositiveNumber(depth)) {
        return errResponse('Room width and depth must be positive numbers.');
      }
      if (!Array.isArray(openings) || !openings.every(isValidOpening)) {
        return errResponse('Each opening needs a valid wall, offset, width, and door/window kind.');
      }
      if (openings.some((opening: Opening) => !openingFits(opening, width, depth))) {
        return errResponse('Every opening must fit within its wall.');
      }
      useStore.getState().setRoom({ width, depth, openings });
      return makeResponse();
    },
  });

  await registerTool({
    name: 'suggest_positions',
    description:
      'Return up to 5 valid, non-overlapping positions for an existing item. Coordinates are in ' +
      'centimeters from the room top-left. Wall-snapped positions are prioritized, followed by interior ' +
      'positions. This does not move the item.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Existing item ID' } },
      required: ['id'],
    },
    execute: async ({ id }) => {
      const state = useStore.getState();
      const item = state.items.find((candidate) => candidate.id === id);
      if (!item) return errResponse(`Item not found: ${id}`);
      return makeResponse({
        suggested_positions: findValidPlacements(state.room, state.items, item, 5),
      });
    },
  });

  await registerTool({
    name: 'highlight_item',
    description:
      'Briefly highlight an item on the canvas with a warm pulsing outline for two seconds. Use ' +
      'this to visually point at an item while explaining it to the user.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'ID of the item to highlight' } },
      required: ['id'],
    },
    execute: async ({ id }) => {
      const state = useStore.getState();
      if (!state.items.some((item) => item.id === id)) return errResponse(`Item not found: ${id}`);
      state.setHighlightId(id);
      if (highlightTimer !== null) window.clearTimeout(highlightTimer);
      highlightTimer = window.setTimeout(() => {
        useStore.getState().setHighlightId(null);
        highlightTimer = null;
      }, 2000);
      window.dispatchEvent(new CustomEvent('roomcraft:highlight', { detail: { id } }));
      return makeResponse();
    },
  });

  await registerTool({
    name: 'save_layout',
    description: 'Save the current room, furniture, and clearance setting to browser storage under a name.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Name for the saved layout' } },
      required: ['name'],
    },
    execute: async ({ name }) => {
      if (typeof name !== 'string' || !name.trim()) return errResponse('Layout name cannot be empty.');
      useStore.getState().saveLayout(name);
      return makeResponse({ saved: name.trim() });
    },
  });

  await registerTool({
    name: 'load_layout',
    description: 'Load a previously saved layout by name, replacing the current room state.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Saved layout name' } },
      required: ['name'],
    },
    execute: async ({ name }) => {
      if (typeof name !== 'string' || !name.trim()) return errResponse('Layout name cannot be empty.');
      const loaded = useStore.getState().loadLayout(name);
      return loaded ? makeResponse({ loaded: name.trim() }) : errResponse(`Layout not found: ${name.trim()}`);
    },
  });

  await registerTool({
    name: 'list_layouts',
    description: 'List all saved layout names in browser storage.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    execute: async () => makeResponse({ layouts: useStore.getState().listLayouts() }),
  });

  await registerTool({
    name: 'place_facing',
    description:
      'Rotate a directional furniture item so its front faces toward another item. ' +
      'For example, rotate a sofa to face the TV. Only changes rotation, not position.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID of the item to rotate' },
        target_id: { type: 'string', description: 'ID of the item to face toward' },
      },
      required: ['id', 'target_id'],
    },
    execute: async ({ id, target_id }) => {
      const state = useStore.getState();
      const item = state.items.find((i) => i.id === id);
      if (!item) return errResponse(`Item not found: ${id}`);
      const target = state.items.find((i) => i.id === target_id);
      if (!target) return errResponse(`Target item not found: ${target_id}`);

      const [tx, ty] = itemCenter(target);
      const rotation = rotationToFace(item, tx, ty);
      const result = state.rotateItem(id, rotation);
      return result === true ? makeResponse() : errResponse(result);
    },
  });

  await registerTool({
    name: 'place_against_wall',
    description:
      'Move a furniture item flush against a wall with its back to the wall and front facing ' +
      'into the room. Optionally specify an offset along the wall in centimeters from the wall\'s start.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID of the item to place' },
        wall: { type: 'string', enum: ['N', 'S', 'E', 'W'], description: 'Which wall to place against' },
        offset: { type: 'number', description: 'Optional position along the wall in centimeters' },
      },
      required: ['id', 'wall'],
    },
    execute: async ({ id, wall, offset }) => {
      const state = useStore.getState();
      const item = state.items.find((i) => i.id === id);
      if (!item) return errResponse(`Item not found: ${id}`);

      const placement = placeAgainstWall(item, wall, state.room, offset);
      const result = state.moveItems([{ id, x: placement.x, y: placement.y, rotation: placement.rotation }]);
      return result === true ? makeResponse() : errResponse(result as string);
    },
  });



  await registerTool({
    name: 'critique_layout',
    description:
      'Analyze the current furniture layout and return warnings about issues: seating facing walls ' +
      'instead of the TV, chairs too far from tables, TV not facing seating, etc. Call this after ' +
      'making changes to verify the layout makes sense.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    execute: async () => {
      const state = useStore.getState();
      const warnings = critiqueLayout(state.items, state.room);
      return makeResponse({
        warnings,
        verdict: warnings.length === 0
          ? 'Layout looks good!'
          : `Found ${warnings.length} issue(s) to address.`,
      });
    },
  });
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isValidOpening(value: unknown): value is Opening {
  if (!value || typeof value !== 'object') return false;
  const opening = value as Partial<Opening>;
  return (
    (opening.wall === 'N' || opening.wall === 'S' || opening.wall === 'E' || opening.wall === 'W') &&
    typeof opening.offset === 'number' && Number.isFinite(opening.offset) && opening.offset >= 0 &&
    typeof opening.width === 'number' && Number.isFinite(opening.width) && opening.width > 0 &&
    (opening.kind === 'door' || opening.kind === 'window')
  );
}

function openingFits(opening: Opening, roomWidth: number, roomDepth: number): boolean {
  const wallLength = opening.wall === 'N' || opening.wall === 'S' ? roomWidth : roomDepth;
  return opening.offset + opening.width <= wallLength;
}

function nearestEdgeDistance(a: Item, b: Item): number {
  const aSize = effectiveSize(a);
  const bSize = effectiveSize(b);
  const gapX = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + aSize.w, b.x + bSize.w));
  const gapY = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + aSize.d, b.y + bSize.d));
  return Math.round(Math.sqrt(gapX * gapX + gapY * gapY));
}
