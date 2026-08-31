import type { Opening, Room } from '../types';

interface LineSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function RoomOutline({ room }: { room: Room }) {
  const { width, depth, openings } = room;
  const wallLines = [
    ...wallWithGaps(0, 0, width, 0, openings.filter((opening) => opening.wall === 'N'), 'horizontal'),
    ...wallWithGaps(0, depth, width, depth, openings.filter((opening) => opening.wall === 'S'), 'horizontal'),
    ...wallWithGaps(0, 0, 0, depth, openings.filter((opening) => opening.wall === 'W'), 'vertical'),
    ...wallWithGaps(width, 0, width, depth, openings.filter((opening) => opening.wall === 'E'), 'vertical'),
  ];

  return (
    <g className="room-outline" aria-label="Room outline">
      <rect x={0} y={0} width={width} height={depth} rx={3} fill="#fbfaf7" />
      {wallLines.map((line, index) => (
        <line
          key={index}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke="#302d2a"
          strokeWidth={4}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}

      {openings.filter((opening) => opening.kind === 'door').map((opening, index) => (
        <DoorArc key={`door-${index}`} opening={opening} roomWidth={width} roomDepth={depth} />
      ))}
      {openings.filter((opening) => opening.kind === 'window').map((opening, index) => (
        <WindowMark key={`window-${index}`} opening={opening} roomWidth={width} roomDepth={depth} />
      ))}
    </g>
  );
}

function wallWithGaps(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  openings: Pick<Opening, 'offset' | 'width'>[],
  direction: 'horizontal' | 'vertical',
): LineSegment[] {
  const totalLength = direction === 'horizontal' ? Math.abs(x2 - x1) : Math.abs(y2 - y1);
  const lines: LineSegment[] = [];
  let cursor = 0;

  for (const opening of [...openings].sort((a, b) => a.offset - b.offset)) {
    const start = Math.max(0, Math.min(totalLength, opening.offset));
    const end = Math.max(start, Math.min(totalLength, opening.offset + opening.width));
    if (start > cursor) {
      if (direction === 'horizontal') {
        lines.push({ x1: x1 + cursor, y1, x2: x1 + start, y2 });
      } else {
        lines.push({ x1, y1: y1 + cursor, x2, y2: y1 + start });
      }
    }
    cursor = Math.max(cursor, end);
  }

  if (cursor < totalLength) {
    if (direction === 'horizontal') {
      lines.push({ x1: x1 + cursor, y1, x2, y2 });
    } else {
      lines.push({ x1, y1: y1 + cursor, x2, y2 });
    }
  }
  return lines;
}

function DoorArc({
  opening,
  roomWidth,
  roomDepth,
}: {
  opening: Opening;
  roomWidth: number;
  roomDepth: number;
}) {
  const radius = Math.min(opening.width * 0.8, 40);
  let cx = opening.offset;
  let cy = roomDepth;
  let endX = cx + radius;
  let endY = cy;

  if (opening.wall === 'N') {
    cy = 0;
    endX = cx;
    endY = radius;
  } else if (opening.wall === 'W') {
    cx = 0;
    cy = opening.offset;
    endX = radius;
    endY = cy;
  } else if (opening.wall === 'E') {
    cx = roomWidth;
    cy = opening.offset;
    endX = roomWidth - radius;
    endY = cy;
  } else {
    endY = roomDepth - radius;
  }

  return (
    <path
      d={`M ${cx},${cy} A ${radius},${radius} 0 0 1 ${endX},${endY}`}
      fill="none"
      stroke="#a49b91"
      strokeWidth={1.5}
      strokeDasharray="5 4"
      vectorEffect="non-scaling-stroke"
      pointerEvents="none"
    />
  );
}

function WindowMark({
  opening,
  roomWidth,
  roomDepth,
}: {
  opening: Opening;
  roomWidth: number;
  roomDepth: number;
}) {
  const gap = 3;
  if (opening.wall === 'N' || opening.wall === 'S') {
    const y = opening.wall === 'N' ? 0 : roomDepth;
    return (
      <g pointerEvents="none">
        <line
          x1={opening.offset}
          y1={y - gap}
          x2={opening.offset + opening.width}
          y2={y - gap}
          stroke="#5b9fca"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={opening.offset}
          y1={y + gap}
          x2={opening.offset + opening.width}
          y2={y + gap}
          stroke="#5b9fca"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      </g>
    );
  }

  const x = opening.wall === 'W' ? 0 : roomWidth;
  return (
    <g pointerEvents="none">
      <line
        x1={x - gap}
        y1={opening.offset}
        x2={x - gap}
        y2={opening.offset + opening.width}
        stroke="#5b9fca"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={x + gap}
        y1={opening.offset}
        x2={x + gap}
        y2={opening.offset + opening.width}
        stroke="#5b9fca"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}
