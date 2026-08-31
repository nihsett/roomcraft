import type { Item, Room } from './types';

export const DEFAULT_ROOM: Room = {
  width: 500,
  depth: 400,
  openings: [
    { wall: 'S', offset: 40, width: 90, kind: 'door' },
    { wall: 'E', offset: 280, width: 100, kind: 'door' },
    { wall: 'N', offset: 150, width: 180, kind: 'window' },
  ],
};

export const DEFAULT_ITEMS: Item[] = [
  { id: 'sofa-1',   type: 'sofa',         label: 'Sofa',         x: 140, y: 250, w: 220, d: 90,  rotation: 0 },
  { id: 'arm-1',    type: 'armchair',     label: 'Armchair',     x: 40,  y: 260, w: 85,  d: 85,  rotation: 0 },
  { id: 'coffee-1', type: 'coffee-table', label: 'Coffee Table', x: 170, y: 170, w: 110, d: 60,  rotation: 0 },
  { id: 'tv-1',     type: 'tv-stand',     label: 'TV Stand',     x: 150, y: 10,  w: 160, d: 45,  rotation: 0 },
  { id: 'shelf-1',  type: 'bookshelf',    label: 'Bookshelf',    x: 10,  y: 10,  w: 90,  d: 35,  rotation: 0 },
  { id: 'rug-1',    type: 'rug',          label: 'Rug',          x: 130, y: 150, w: 200, d: 140, rotation: 0 },
  { id: 'plant-1',  type: 'plant',        label: 'Plant',        x: 450, y: 10,  w: 40,  d: 40,  rotation: 0 },
  { id: 'dtable-1', type: 'dining-table',  label: 'Dining Table', x: 30,  y: 80,  w: 160, d: 90,  rotation: 0 },
  { id: 'dchair-1', type: 'dining-chair',  label: 'Chair 1',      x: 50,  y: 55,  w: 45,  d: 45,  rotation: 0 },
  { id: 'dchair-2', type: 'dining-chair',  label: 'Chair 2',      x: 125, y: 55,  w: 45,  d: 45,  rotation: 0 },
  { id: 'dchair-3', type: 'dining-chair',  label: 'Chair 3',      x: 50,  y: 150, w: 45,  d: 45,  rotation: 180 },
  { id: 'dchair-4', type: 'dining-chair',  label: 'Chair 4',      x: 125, y: 150, w: 45,  d: 45,  rotation: 180 },
];
