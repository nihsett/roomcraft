export type FrontEdge = 'N' | 'S' | 'E' | 'W';

export interface CatalogEntry {
  type: string;
  label: string;
  w: number;
  d: number;
  blocking: boolean;
  icon: string;
  frontEdge: FrontEdge | null;  // which edge is the "front" at rotation=0; null = omnidirectional
}

export const CATALOG: Record<string, CatalogEntry> = {
  sofa:           { type: 'sofa',          label: 'Sofa',          w: 220, d: 90,  blocking: true,  icon: '🛋️', frontEdge: 'S' },
  loveseat:       { type: 'loveseat',      label: 'Loveseat',      w: 150, d: 85,  blocking: true,  icon: '🛋️', frontEdge: 'S' },
  armchair:       { type: 'armchair',      label: 'Armchair',      w: 85,  d: 85,  blocking: true,  icon: '💺', frontEdge: 'S' },
  'coffee-table': { type: 'coffee-table',  label: 'Coffee Table',  w: 110, d: 60,  blocking: true,  icon: '☕', frontEdge: null },
  'tv-stand':     { type: 'tv-stand',      label: 'TV Stand',      w: 160, d: 45,  blocking: true,  icon: '📺', frontEdge: 'S' },
  'dining-table': { type: 'dining-table',  label: 'Dining Table',  w: 160, d: 90,  blocking: true,  icon: '🍽️', frontEdge: null },
  'dining-chair': { type: 'dining-chair',  label: 'Dining Chair',  w: 45,  d: 45,  blocking: true,  icon: '🪑', frontEdge: 'S' },
  bookshelf:      { type: 'bookshelf',     label: 'Bookshelf',     w: 90,  d: 35,  blocking: true,  icon: '📚', frontEdge: 'S' },
  'bed-queen':    { type: 'bed-queen',     label: 'Queen Bed',     w: 160, d: 210, blocking: true,  icon: '🛏️', frontEdge: 'S' },
  desk:           { type: 'desk',          label: 'Desk',          w: 140, d: 70,  blocking: true,  icon: '🖥️', frontEdge: 'S' },
  rug:            { type: 'rug',           label: 'Rug',           w: 200, d: 140, blocking: false, icon: '🟫', frontEdge: null },
  plant:          { type: 'plant',         label: 'Plant',         w: 40,  d: 40,  blocking: true,  icon: '🌿', frontEdge: null },
};

export const CATALOG_TYPES = Object.keys(CATALOG);
