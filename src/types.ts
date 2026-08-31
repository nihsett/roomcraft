export type Rotation = 0 | 90 | 180 | 270;
export type Wall = 'N' | 'S' | 'E' | 'W';
export type Direction = 'N' | 'S' | 'E' | 'W';

export interface Item {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  w: number;
  d: number;
  rotation: Rotation;
}

export interface Opening {
  wall: Wall;
  offset: number;
  width: number;
  kind: 'door' | 'window';
}

export interface Room {
  width: number;
  depth: number;
  openings: Opening[];
}

export interface JournalEntry {
  ts: number;
  action: 'move' | 'rotate' | 'add' | 'remove';
  itemId: string;
  from?: Partial<Item>;
  to?: Partial<Item>;
}

export interface PathSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ClearancePath {
  from: string;
  to: string;
  pass: boolean;
  segments: PathSegment[];
  blockedBy?: string[];
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
  detail?: string;
}

export function effectiveSize(item: Item): { w: number; d: number } {
  if (item.rotation === 90 || item.rotation === 270) {
    return { w: item.d, d: item.w };
  }
  return { w: item.w, d: item.d };
}
