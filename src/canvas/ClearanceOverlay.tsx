import type { ClearancePath } from '../types';

export function ClearanceOverlay({ paths }: { paths: ClearancePath[] }) {
  return (
    <g className="clearance-overlay" aria-label="Clearance paths" pointerEvents="none">
      {paths.map((path, pathIndex) =>
        path.segments.map((segment, segmentIndex) => (
          <line
            key={`${pathIndex}-${segmentIndex}`}
            x1={segment.x1}
            y1={segment.y1}
            x2={segment.x2}
            y2={segment.y2}
            stroke={path.pass ? '#16a66a' : '#e35b4f'}
            strokeWidth={path.pass ? 5 : 7}
            strokeLinecap="round"
            strokeDasharray={path.pass ? undefined : '10 7'}
            opacity={0.64}
            vectorEffect="non-scaling-stroke"
          />
        )),
      )}
    </g>
  );
}
