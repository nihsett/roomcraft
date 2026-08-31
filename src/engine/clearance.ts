import type { ClearancePath, ClearanceResult, Item, Opening, Room } from '../types';
import { effectiveSize } from '../types';
import { CATALOG } from '../catalog';

const CELL = 10;
type Cell = [number, number];
type OccupancyGrid = string[][][];

export function runClearanceCheck(room: Room, items: Item[], clearanceCm: number): ClearanceResult {
  const cols = Math.max(1, Math.ceil(room.width / CELL));
  const rows = Math.max(1, Math.ceil(room.depth / CELL));
  const grid: OccupancyGrid = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => [] as string[]),
  );

  // Rasterize each blocking footprint onto the 10cm grid. Rugs remain visible,
  // but deliberately do not affect walkable space.
  for (const item of items) {
    if (!CATALOG[item.type]?.blocking) continue;
    const size = effectiveSize(item);
    const startCol = Math.floor(item.x / CELL);
    const startRow = Math.floor(item.y / CELL);
    const endCol = Math.ceil((item.x + size.w) / CELL);
    const endRow = Math.ceil((item.y + size.d) / CELL);

    for (let row = startRow; row < endRow; row += 1) {
      for (let col = startCol; col < endCol; col += 1) {
        if (row >= 0 && row < rows && col >= 0 && col < cols) {
          grid[row][col].push(item.id);
        }
      }
    }
  }

  // Expand occupied cells to model the minimum corridor width around furniture.
  const dilateBy = Math.max(0, Math.floor((clearanceCm - CELL) / (2 * CELL)));
  const dilated: boolean[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => false),
  );

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (grid[row][col].length === 0) continue;
      for (let rowOffset = -dilateBy; rowOffset <= dilateBy; rowOffset += 1) {
        for (let colOffset = -dilateBy; colOffset <= dilateBy; colOffset += 1) {
          const nextRow = row + rowOffset;
          const nextCol = col + colOffset;
          if (nextRow >= 0 && nextRow < rows && nextCol >= 0 && nextCol < cols) {
            dilated[nextRow][nextCol] = true;
          }
        }
      }
    }
  }

  const doors = room.openings.filter((opening) => opening.kind === 'door');
  const doorCells = doors.map((opening) => ({
    opening,
    cells: getOpeningCells(opening, room, cols, rows),
  }));
  const paths: ClearancePath[] = [];

  for (let fromIndex = 0; fromIndex < doorCells.length; fromIndex += 1) {
    for (let toIndex = fromIndex + 1; toIndex < doorCells.length; toIndex += 1) {
      const from = doorCells[fromIndex];
      const to = doorCells[toIndex];
      const path = bfs(dilated, from.cells, to.cells, rows, cols);
      const fromLabel = describeOpening(from.opening);
      const toLabel = describeOpening(to.opening);

      if (path) {
        paths.push({
          from: fromLabel,
          to: toLabel,
          pass: true,
          segments: pathToSegments(path),
        });
      } else {
        paths.push({
          from: fromLabel,
          to: toLabel,
          pass: false,
          // A direct red route makes a failed check visible even though no
          // walkable route was found. It is a diagnostic, not a claimed path.
          segments: [directSegment(from.cells, to.cells)],
          blockedBy: findBlockers(grid, from.cells, to.cells, rows, cols),
        });
      }
    }
  }

  return { pass: paths.every((path) => path.pass), paths };
}

function getOpeningCells(opening: Opening, room: Room, cols: number, rows: number): Cell[] {
  const cells: Cell[] = [];
  if (opening.wall === 'N' || opening.wall === 'S') {
    const row = opening.wall === 'N' ? 0 : rows - 1;
    const startCol = Math.max(0, Math.floor(opening.offset / CELL));
    const endCol = Math.min(cols, Math.ceil((opening.offset + opening.width) / CELL));
    for (let col = startCol; col < endCol; col += 1) cells.push([row, col]);
  } else {
    const col = opening.wall === 'W' ? 0 : cols - 1;
    const startRow = Math.max(0, Math.floor(opening.offset / CELL));
    const endRow = Math.min(rows, Math.ceil((opening.offset + opening.width) / CELL));
    for (let row = startRow; row < endRow; row += 1) cells.push([row, col]);
  }
  // Referencing room here keeps the helper explicit about which dimensions
  // define the opening plane and protects it if grid sizing changes later.
  void room;
  return cells;
}

function describeOpening(opening: Opening): string {
  return `${opening.kind} (${opening.wall} wall)`;
}

function bfs(
  blocked: boolean[][],
  startCells: Cell[],
  endCells: Cell[],
  rows: number,
  cols: number,
): Cell[] | null {
  if (startCells.length === 0 || endCells.length === 0) return null;
  const endSet = new Set(endCells.map(([row, col]) => `${row},${col}`));
  const visited = new Map<string, string | null>();
  const queue: Cell[] = [];

  for (const [row, col] of startCells) {
    const key = `${row},${col}`;
    if (!blocked[row][col] || endSet.has(key)) {
      visited.set(key, null);
      queue.push([row, col]);
    }
  }

  const directions: Cell[] = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  let head = 0;
  while (head < queue.length) {
    const [row, col] = queue[head];
    head += 1;
    const key = `${row},${col}`;
    if (endSet.has(key)) {
      const path: Cell[] = [];
      let current: string | null = key;
      while (current !== null) {
        const [pathRow, pathCol] = current.split(',').map(Number);
        path.unshift([pathRow, pathCol]);
        current = visited.get(current) ?? null;
      }
      return path;
    }

    for (const [rowDelta, colDelta] of directions) {
      const nextRow = row + rowDelta;
      const nextCol = col + colDelta;
      if (nextRow < 0 || nextRow >= rows || nextCol < 0 || nextCol >= cols) continue;
      const nextKey = `${nextRow},${nextCol}`;
      if (visited.has(nextKey)) continue;
      if (blocked[nextRow][nextCol] && !endSet.has(nextKey)) continue;
      visited.set(nextKey, key);
      queue.push([nextRow, nextCol]);
    }
  }
  return null;
}

function pathToSegments(path: Cell[]) {
  const segments: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    segments.push({
      x1: path[index][1] * CELL + CELL / 2,
      y1: path[index][0] * CELL + CELL / 2,
      x2: path[index + 1][1] * CELL + CELL / 2,
      y2: path[index + 1][0] * CELL + CELL / 2,
    });
  }
  return segments;
}

function directSegment(startCells: Cell[], endCells: Cell[]) {
  const start = averageCell(startCells);
  const end = averageCell(endCells);
  return {
    x1: start.col * CELL + CELL / 2,
    y1: start.row * CELL + CELL / 2,
    x2: end.col * CELL + CELL / 2,
    y2: end.row * CELL + CELL / 2,
  };
}

function averageCell(cells: Cell[]): { row: number; col: number } {
  if (cells.length === 0) return { row: 0, col: 0 };
  return {
    row: Math.round(cells.reduce((sum, [row]) => sum + row, 0) / cells.length),
    col: Math.round(cells.reduce((sum, [, col]) => sum + col, 0) / cells.length),
  };
}

function findBlockers(
  grid: OccupancyGrid,
  startCells: Cell[],
  endCells: Cell[],
  rows: number,
  cols: number,
): string[] {
  const blockers = new Set<string>();
  const start = averageCell(startCells);
  const end = averageCell(endCells);
  const steps = Math.max(Math.abs(end.row - start.row), Math.abs(end.col - start.col));

  for (let index = 0; index <= steps; index += 1) {
    const ratio = steps === 0 ? 0 : index / steps;
    const row = Math.round(start.row + (end.row - start.row) * ratio);
    const col = Math.round(start.col + (end.col - start.col) * ratio);
    if (row >= 0 && row < rows && col >= 0 && col < cols) {
      grid[row][col].forEach((id) => blockers.add(id));
    }
  }

  // A dilated corner can fail without the exact center line touching an item.
  // In that case, inspect the rectangle between the two openings for a useful
  // diagnostic rather than returning an empty blocker list.
  if (blockers.size === 0) {
    const minRow = Math.max(0, Math.min(start.row, end.row));
    const maxRow = Math.min(rows - 1, Math.max(start.row, end.row));
    const minCol = Math.max(0, Math.min(start.col, end.col));
    const maxCol = Math.min(cols - 1, Math.max(start.col, end.col));
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        grid[row][col].forEach((id) => blockers.add(id));
      }
    }
  }

  return [...blockers];
}
