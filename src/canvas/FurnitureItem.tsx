import { useCallback, useRef, useState } from 'react';
import type { PointerEvent, RefObject } from 'react';
import { CATALOG } from '../catalog';
import { useStore } from '../store';
import type { Item } from '../types';
import { effectiveSize } from '../types';

const SNAP = 5;

interface FurnitureItemProps {
  item: Item;
  isSelected: boolean;
  svgRef: RefObject<SVGSVGElement | null>;
}

const ITEM_COLORS: Record<string, { fill: string; stroke: string }> = {
  sofa: { fill: '#e8edf4', stroke: '#98aabd' },
  loveseat: { fill: '#e8edf4', stroke: '#98aabd' },
  armchair: { fill: '#eee9e3', stroke: '#b8a99a' },
  'coffee-table': { fill: '#ead9c4', stroke: '#bd9870' },
  'tv-stand': { fill: '#e4e0dc', stroke: '#9b948c' },
  'dining-table': { fill: '#eee0cf', stroke: '#bf9f7d' },
  'dining-chair': { fill: '#f1e8dd', stroke: '#c6a989' },
  bookshelf: { fill: '#e8dfd2', stroke: '#ad9479' },
  'bed-queen': { fill: '#e8e8f2', stroke: '#a2a2c0' },
  desk: { fill: '#e3ece9', stroke: '#8fa9a0' },
  rug: { fill: '#eadfcf', stroke: '#c3a77e' },
  plant: { fill: '#e2eee3', stroke: '#8fb18f' },
};

export function FurnitureItem({ item, isSelected, svgRef }: FurnitureItemProps) {
  const moveItem = useStore((state) => state.moveItem);
  const selectItem = useStore((state) => state.selectItem);
  const appendJournal = useStore((state) => state.appendJournal);
  const highlightId = useStore((state) => state.highlightId);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number; itemX: number; itemY: number } | null>(null);
  const size = effectiveSize(item);
  const catalogEntry = CATALOG[item.type];
  const colors = ITEM_COLORS[item.type] ?? { fill: '#eeeae5', stroke: '#b4aaa0' };
  const isHighlighted = highlightId === item.id;

  const toSvgCoords = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM?.();
    if (!svg || !matrix) return { x: clientX, y: clientY };
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const svgPoint = point.matrixTransform(matrix.inverse());
    return { x: svgPoint.x, y: svgPoint.y };
  }, [svgRef]);

  const onPointerDown = useCallback((event: PointerEvent<SVGGElement>) => {
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    selectItem(item.id);
    const point = toSvgCoords(event.clientX, event.clientY);
    dragStart.current = { x: point.x, y: point.y, itemX: item.x, itemY: item.y };
    setDragging(true);
  }, [item.id, item.x, item.y, selectItem, toSvgCoords]);

  const onPointerMove = useCallback((event: PointerEvent<SVGGElement>) => {
    if (!dragging || !dragStart.current) return;
    const point = toSvgCoords(event.clientX, event.clientY);
    const deltaX = point.x - dragStart.current.x;
    const deltaY = point.y - dragStart.current.y;
    const nextX = Math.round((dragStart.current.itemX + deltaX) / SNAP) * SNAP;
    const nextY = Math.round((dragStart.current.itemY + deltaY) / SNAP) * SNAP;
    moveItem(item.id, nextX, nextY);
  }, [dragging, item.id, moveItem, toSvgCoords]);

  const finishDrag = useCallback((event?: PointerEvent<SVGGElement>) => {
    const start = dragStart.current;
    if (!start) return;
    if (event) event.currentTarget.releasePointerCapture?.(event.pointerId);
    const current = useStore.getState().items.find((candidate) => candidate.id === item.id);
    if (current && (current.x !== start.itemX || current.y !== start.itemY)) {
      appendJournal({
        action: 'move',
        itemId: item.id,
        from: { x: start.itemX, y: start.itemY },
        to: { x: current.x, y: current.y },
      });
    }
    dragStart.current = null;
    setDragging(false);
  }, [appendJournal, item.id]);

  const onPointerUp = useCallback((event: PointerEvent<SVGGElement>) => {
    finishDrag(event);
  }, [finishDrag]);

  const onPointerCancel = useCallback(() => {
    finishDrag();
  }, [finishDrag]);

  const onClick = useCallback((event: PointerEvent<SVGGElement>) => {
    event.stopPropagation();
  }, []);

  return (
    <g
      className="room-item"
      data-item-id={item.id}
      role="button"
      aria-label={`${item.label}, ${item.id}`}
      style={{
        transform: `translate(${item.x}px, ${item.y}px)`,
        transformOrigin: '0 0',
        transition: dragging ? 'none' : 'transform 400ms cubic-bezier(0.4, 0, 0.2, 1)',
        cursor: dragging ? 'grabbing' : 'grab',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClick={onClick}
    >
      <title>{`${item.label} · ${item.id} · ${size.w}×${size.d}cm`}</title>
      <rect
        x={0}
        y={0}
        width={size.w}
        height={size.d}
        rx={item.type === 'rug' ? 2 : 4}
        fill={item.type === 'rug' ? `url(#rug-pattern-${item.id})` : (isSelected ? '#f4f7fc' : colors.fill)}
        stroke={isSelected ? '#3678d4' : colors.stroke}
        strokeWidth={isSelected ? 2.5 : 1.5}
        className={isHighlighted ? 'animate-pulse-outline' : undefined}
        vectorEffect="non-scaling-stroke"
      />
      {item.type === 'rug' && (
        <defs>
          <pattern id={`rug-pattern-${item.id}`} width="12" height="12" patternUnits="userSpaceOnUse">
            <rect width="12" height="12" fill="#eadfcf" />
            <path d="M -3,3 L 3,-3 M 0,12 L 12,0 M 9,15 L 15,9" stroke="#d7c4a8" strokeWidth="2" />
          </pattern>
        </defs>
      )}
      <text
        x={size.w / 2}
        y={size.d / 2 - (catalogEntry ? 7 : 0)}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={Math.min(size.w, size.d) > 60 ? 13 : 9}
        fill="#4d4a47"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {catalogEntry?.icon}
      </text>
      <text
        x={size.w / 2}
        y={size.d / 2 + (catalogEntry ? 11 : 0)}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={Math.min(size.w, size.d) > 60 ? 11 : 8}
        fontWeight={isSelected ? 600 : 500}
        fill="#5b5753"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {item.label}
      </text>
      {isSelected && (
        <text
          x={size.w / 2}
          y={size.d / 2 + 25}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={8}
          fill="#7d7770"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {size.w}×{size.d}cm
        </text>
      )}
    </g>
  );
}
