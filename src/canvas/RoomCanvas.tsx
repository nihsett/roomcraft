import { useCallback, useRef } from 'react';
import { useStore } from '../store';
import type { Rotation } from '../types';
import { ClearanceOverlay } from './ClearanceOverlay';
import { FurnitureItem } from './FurnitureItem';
import { GridDots } from './GridDots';
import { RoomOutline } from './RoomOutline';

export function RoomCanvas() {
  const svgRef = useRef<SVGSVGElement>(null);
  const room = useStore((state) => state.room);
  const items = useStore((state) => state.items);
  const selectedId = useStore((state) => state.selectedId);
  const clearanceOverlay = useStore((state) => state.clearanceOverlay);
  const selectItem = useStore((state) => state.selectItem);

  const onCanvasClick = useCallback(() => {
    selectItem(null);
  }, [selectItem]);

  const onKeyDown = useCallback((event: React.KeyboardEvent<SVGSVGElement>) => {
    if (!selectedId) return;
    const state = useStore.getState();
    const item = state.items.find((candidate) => candidate.id === selectedId);
    if (!item) return;

    if (event.key === 'r' || event.key === 'R') {
      event.preventDefault();
      const nextRotation = ((item.rotation + 90) % 360) as Rotation;
      const result = state.rotateItem(selectedId, nextRotation);
      if (result === true) {
        state.appendJournal({
          action: 'rotate',
          itemId: selectedId,
          from: { rotation: item.rotation },
          to: { rotation: nextRotation },
        });
      }
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      const result = state.removeItem(selectedId);
      if (result === true) state.appendJournal({ action: 'remove', itemId: selectedId });
    }
  }, [selectedId]);

  const padding = 24;
  const viewBox = `${-padding} ${-padding} ${room.width + padding * 2} ${room.depth + padding * 2}`;
  const sortedItems = [...items].sort((a, b) => {
    if (a.id === selectedId) return 1;
    if (b.id === selectedId) return -1;
    if (a.type === 'rug') return -1;
    if (b.type === 'rug') return 1;
    return 0;
  });

  return (
    <svg
      ref={svgRef}
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      className="room-canvas h-full w-full"
      aria-label={`Room layout, ${room.width} by ${room.depth} centimeters`}
      onClick={onCanvasClick}
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      <RoomOutline room={room} />
      <GridDots width={room.width} height={room.depth} spacing={50} />
      {sortedItems.map((item) => (
        <FurnitureItem
          key={item.id}
          item={item}
          isSelected={item.id === selectedId}
          svgRef={svgRef}
        />
      ))}
      {clearanceOverlay && <ClearanceOverlay paths={clearanceOverlay} />}

      <g className="room-dimensions" aria-hidden="true" pointerEvents="none">
        <text x={room.width / 2} y={-10} textAnchor="middle">{room.width} cm</text>
        <text x={room.width + 11} y={room.depth / 2} textAnchor="middle" transform={`rotate(90 ${room.width + 11} ${room.depth / 2})`}>
          {room.depth} cm
        </text>
      </g>
    </svg>
  );
}
