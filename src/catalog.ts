export interface CatalogEntry {
  type: string;
  label: string;
  w: number;
  d: number;
  blocking: boolean;
  icon: string;
}

export const CATALOG: Record<string, CatalogEntry> = {
  sofa:          { type: 'sofa',          label: 'Sofa',          w: 220, d: 90,  blocking: true,  icon: '🛋️' },
  loveseat:      { type: 'loveseat',      label: 'Loveseat',      w: 150, d: 85,  blocking: true,  icon: '🛋️' },
  armchair:     { type: 'armchair',      label: 'Armchair',      w: 85,  d: 85,  blocking: true,  icon: '💺' },
  'coffee-table': { type: 'coffee-table', label: 'Coffee Table', w: 110, d: 60, blocking: true,  icon: '☕' },
  'tv-stand':   { type: 'tv-stand',      label: 'TV Stand',      w: 160, d: 45, blocking: true,  icon: '📺' },
  'dining-table': { type: 'dining-table', label: 'Dining Table', w: 160, d: 90, blocking: true,  icon: '🍽️' },
  'dining-chair': { type: 'dining-chair', label: 'Dining Chair', w: 45, d: 45, blocking: true,  icon: '🪑' },
  bookshelf:    { type: 'bookshelf',     label: 'Bookshelf',     w: 90,  d: 35,  blocking: true,  icon: '📚' },
  'bed-queen':  { type: 'bed-queen',     label: 'Queen Bed',     w: 160, d: 210, blocking: true,  icon: '🛏️' },
  desk:         { type: 'desk',          label: 'Desk',          w: 140, d: 70,  blocking: true,  icon: '🖥️' },
  rug:          { type: 'rug',           label: 'Rug',           w: 200, d: 140, blocking: false, icon: '🟫' },
  plant:        { type: 'plant',         label: 'Plant',         w: 40,  d: 40,  blocking: true,  icon: '🌿' },
};

export const CATALOG_TYPES = Object.keys(CATALOG);
