import type { ClearancePath, PathSegment } from '../types';

const RIBBON_Y = 1.7;
const RIBBON_WIDTH = 8;
const RIBBON_HEIGHT = 1.4;

/** Draws the clearance engine's 2D route on the room floor without changing its data. */
export function ClearanceOverlay3D({ paths }: { paths: ClearancePath[] }) {
  return (
    <group name="clearance-overlay">
      {paths.map((path, pathIndex) =>
        mergeCollinearSegments(path.segments).map((segment, segmentIndex) => {
          const dx = segment.x2 - segment.x1;
          const dz = segment.y2 - segment.y1;
          const length = Math.hypot(dx, dz);
          if (length === 0) return null;

          const angle = Math.atan2(dx, dz);
          const color = path.pass ? '#22c55e' : '#ef4444';
          const center: [number, number, number] = [
            (segment.x1 + segment.x2) / 2,
            RIBBON_Y,
            (segment.y1 + segment.y2) / 2,
          ];

          return (
            <mesh
              key={`${pathIndex}-${segmentIndex}`}
              position={center}
              rotation={[0, angle, 0]}
              castShadow={false}
            >
              <boxGeometry args={[RIBBON_WIDTH, RIBBON_HEIGHT, length]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={0.8}
                transparent
                opacity={path.pass ? 0.78 : 0.68}
                flatShading
              />
            </mesh>
          );
        }),
      )}
    </group>
  );
}

function mergeCollinearSegments(segments: PathSegment[]): PathSegment[] {
  const merged: PathSegment[] = [];

  for (const segment of segments) {
    const current = { ...segment };
    const previous = merged[merged.length - 1];
    if (!previous) {
      merged.push(current);
      continue;
    }

    const previousHorizontal = previous.y1 === previous.y2;
    const currentHorizontal = current.y1 === current.y2;
    const joins = previous.x2 === current.x1 && previous.y2 === current.y1;

    if (joins && previousHorizontal === currentHorizontal) {
      previous.x2 = current.x2;
      previous.y2 = current.y2;
    } else {
      merged.push(current);
    }
  }

  return merged;
}
