import { useStore } from '../store';
import type { Direction, Rotation } from '../types';
import { registerTool } from './register';

let currentController: AbortController | null = null;

function makeResponse() {
  const state = useStore.getState();
  return {
    ok: true,
    state_summary: state.getStateSummary(),
    human_actions_since_last_call: state.getJournalDelta(),
  };
}

function makeError(error: string) {
  const state = useStore.getState();
  return {
    ok: false,
    error,
    state_summary: state.getStateSummary(),
    human_actions_since_last_call: state.getJournalDelta(),
  };
}

export async function updateDynamicTools(selectedId: string | null): Promise<void> {
  if (currentController) {
    currentController.abort();
    currentController = null;
  }
  if (!selectedId) return;

  const selected = useStore.getState().items.find((item) => item.id === selectedId);
  if (!selected) return;

  const controller = new AbortController();
  currentController = controller;
  const signal = controller.signal;

  try {
    await registerTool({
      name: 'rotate_selected',
      description: `Rotate the currently selected item (${selected.label}) by 90 degrees clockwise. ` +
        'The footprint is revalidated against room bounds and furniture overlaps.',
      inputSchema: { type: 'object', properties: {}, required: [] },
      execute: async () => {
        const state = useStore.getState();
        const current = state.items.find((item) => item.id === selectedId);
        if (!current) return makeError('Selected item no longer exists.');
        const nextRotation = ((current.rotation + 90) % 360) as Rotation;
        const result = state.rotateItem(selectedId, nextRotation);
        return result === true ? makeResponse() : makeError(result);
      },
    }, signal);

    await registerTool({
      name: 'nudge_selected',
      description: `Nudge the currently selected item (${selected.label}) north, south, east, or west by a distance in centimeters. The move is rejected if it leaves the room or overlaps furniture.`,
      inputSchema: {
        type: 'object',
        properties: {
          dir: { type: 'string', enum: ['N', 'S', 'E', 'W'], description: 'Compass direction' },
          cm: { type: 'number', description: 'Distance in centimeters' },
        },
        required: ['dir', 'cm'],
      },
      execute: async ({ dir, cm }) => {
        if (!isDirection(dir)) return makeError('dir must be one of N, S, E, or W.');
        if (typeof cm !== 'number' || !Number.isFinite(cm)) return makeError('cm must be a finite number.');
        const state = useStore.getState();
        const current = state.items.find((item) => item.id === selectedId);
        if (!current) return makeError('Selected item no longer exists.');
        let x = current.x;
        let y = current.y;
        if (dir === 'N') y -= cm;
        if (dir === 'S') y += cm;
        if (dir === 'E') x += cm;
        if (dir === 'W') x -= cm;
        const result = state.moveItem(selectedId, x, y);
        return result === true ? makeResponse() : makeError(result);
      },
    }, signal);

    await registerTool({
      name: 'remove_selected',
      description: `Remove the currently selected item (${selected.label}) from the room.`,
      inputSchema: { type: 'object', properties: {}, required: [] },
      execute: async () => {
        const result = useStore.getState().removeItem(selectedId);
        return result === true ? makeResponse() : makeError(result);
      },
    }, signal);

    await registerTool({
      name: 'swap_selected_with',
      description: `Swap the position of the currently selected item (${selected.label}) with another item. Both resulting positions must fit and not overlap blocking furniture.`,
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string', description: 'ID of the item to swap with' } },
        required: ['id'],
      },
      execute: async ({ id }) => {
        if (id === selectedId) return makeError('Choose a different item to swap with.');
        const state = useStore.getState();
        const a = state.items.find((item) => item.id === selectedId);
        const b = state.items.find((item) => item.id === id);
        if (!a) return makeError('Selected item no longer exists.');
        if (!b) return makeError(`Item not found: ${id}`);
        const result = state.moveItems([
          { id: a.id, x: b.x, y: b.y },
          { id: b.id, x: a.x, y: a.y },
        ]);
        return result === true ? makeResponse() : makeError(result);
      },
    }, signal);
  } catch (error: unknown) {
    // A selection can change while WebMCP is awaiting registration. Aborting that
    // registration is expected and should not surface as an application error.
    if (!isAbortError(error) && !signal.aborted) {
      console.error('RoomCraft dynamic WebMCP registration failed:', error);
    }
  }
}

function isDirection(value: unknown): value is Direction {
  return value === 'N' || value === 'S' || value === 'E' || value === 'W';
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
