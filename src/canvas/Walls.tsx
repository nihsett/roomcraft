import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Opening, Room } from '../types';

const WALL_HEIGHT = 250;
const WALL_THICKNESS = 6;
const WALL_COLOR = '#e8e4de';
const WINDOW_COLOR = '#a8d4e6';
const WINDOW_HEIGHT = 105;
const WINDOW_BOTTOM = 105;

type WallSpan = {
  offset: number;
  width: number;
  kind: Opening['kind'];
};

interface WallSegment {
  offset: number;
  length: number;
}

/** Walls fade out when the camera orbits behind them so you can always see into the room. */
function FadingWallGroup({
  children,
  side,
  roomWidth,
  roomDepth,
}: {
  children: React.ReactNode;
  side: 'north' | 'south' | 'east' | 'west';
  roomWidth: number;
  roomDepth: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const { camera } = useThree();

  useFrame(() => {
    if (!groupRef.current) return;
    const cx = camera.position.x;
    const cz = camera.position.z;
    const midX = roomWidth / 2;
    const midZ = roomDepth / 2;

    let behind = false;
    if (side === 'north') behind = cz < midZ;
    if (side === 'south') behind = cz > midZ;
    if (side === 'west') behind = cx < midX;
    if (side === 'east') behind = cx > midX;

    const targetOpacity = behind ? 0.08 : 1;
    groupRef.current.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mat = child.material as THREE.MeshStandardMaterial;
        if (!mat.transparent) mat.transparent = true;
        mat.opacity = THREE.MathUtils.lerp(mat.opacity, targetOpacity, 0.12);
      }
    });
  });

  return <group ref={groupRef}>{children}</group>;
}

/** Diorama walls with camera-aware fading. */
export function Walls({ room }: { room: Room }) {
  const { width, depth } = room;
  const northOpenings = normalizeOpenings(room.openings, 'N', width);
  const westOpenings = normalizeOpenings(room.openings, 'W', depth);
  const eastOpenings = normalizeOpenings(room.openings, 'E', depth);
  const southOpenings = normalizeOpenings(room.openings, 'S', width);

  return (
    <group>
      <FadingWallGroup side="north" roomWidth={width} roomDepth={depth}>
        <WallRun
          axis="north"
          segments={wallSegments(width, northOpenings)}
          wallHeight={WALL_HEIGHT}
        />
        <OpeningWindows
          axis="north"
          openings={northOpenings}
          roomWidth={width}
        />
      </FadingWallGroup>

      <FadingWallGroup side="west" roomWidth={width} roomDepth={depth}>
        <WallRun
          axis="west"
          segments={wallSegments(depth, westOpenings)}
          wallHeight={WALL_HEIGHT}
        />
        <OpeningWindows
          axis="west"
          openings={westOpenings}
          roomWidth={width}
        />
      </FadingWallGroup>

      {eastOpenings.length > 0 && (
        <FadingWallGroup side="east" roomWidth={width} roomDepth={depth}>
          <WallRun
            axis="east"
            segments={wallSegments(depth, eastOpenings)}
            wallHeight={WALL_HEIGHT}
            roomWidth={width}
          />
          <OpeningWindows
            axis="east"
            openings={eastOpenings}
            roomWidth={width}
          />
        </FadingWallGroup>
      )}

      <FadingWallGroup side="south" roomWidth={width} roomDepth={depth}>
        <WallRun
          axis="south"
          segments={wallSegments(width, southOpenings)}
          wallHeight={WALL_HEIGHT}
          roomDepth={depth}
        />
        <OpeningWindows
          axis="south"
          openings={southOpenings}
          roomWidth={width}
          roomDepth={depth}
        />
      </FadingWallGroup>
    </group>
  );
}

function WallRun({
  axis,
  segments,
  wallHeight,
  roomWidth = 0,
  roomDepth = 0,
}: {
  axis: 'north' | 'south' | 'west' | 'east';
  segments: WallSegment[];
  wallHeight: number;
  roomWidth?: number;
  roomDepth?: number;
}) {
  return (
    <>
      {segments.map((segment, index) => {
        let position: [number, number, number];
        let size: [number, number, number];

        switch (axis) {
          case 'north':
            position = [segment.offset + segment.length / 2, wallHeight / 2, -WALL_THICKNESS / 2];
            size = [segment.length, wallHeight, WALL_THICKNESS];
            break;
          case 'south':
            position = [segment.offset + segment.length / 2, wallHeight / 2, roomDepth + WALL_THICKNESS / 2];
            size = [segment.length, wallHeight, WALL_THICKNESS];
            break;
          case 'west':
            position = [-WALL_THICKNESS / 2, wallHeight / 2, segment.offset + segment.length / 2];
            size = [WALL_THICKNESS, wallHeight, segment.length];
            break;
          case 'east':
            position = [roomWidth + WALL_THICKNESS / 2, wallHeight / 2, segment.offset + segment.length / 2];
            size = [WALL_THICKNESS, wallHeight, segment.length];
            break;
        }

        return (
          <mesh
            key={`${axis}-${index}`}
            position={position}
            castShadow
            receiveShadow
          >
            <boxGeometry args={size} />
            <meshStandardMaterial color={WALL_COLOR} flatShading />
          </mesh>
        );
      })}
    </>
  );
}

function OpeningWindows({
  axis,
  openings,
  roomWidth,
  roomDepth = 0,
}: {
  axis: 'north' | 'south' | 'west' | 'east';
  openings: WallSpan[];
  roomWidth: number;
  roomDepth?: number;
}) {
  return (
    <>
      {openings
        .filter((opening) => opening.kind === 'window')
        .map((opening, index) => {
          let position: [number, number, number];
          let size: [number, number, number];
          const hCenter = WINDOW_BOTTOM + WINDOW_HEIGHT / 2;

          switch (axis) {
            case 'north':
              position = [opening.offset + opening.width / 2, hCenter, -WALL_THICKNESS / 2];
              size = [Math.max(1, opening.width - 4), WINDOW_HEIGHT, 2];
              break;
            case 'south':
              position = [opening.offset + opening.width / 2, hCenter, roomDepth + WALL_THICKNESS / 2];
              size = [Math.max(1, opening.width - 4), WINDOW_HEIGHT, 2];
              break;
            case 'west':
              position = [-WALL_THICKNESS / 2, hCenter, opening.offset + opening.width / 2];
              size = [2, WINDOW_HEIGHT, Math.max(1, opening.width - 4)];
              break;
            case 'east':
              position = [roomWidth + WALL_THICKNESS / 2, hCenter, opening.offset + opening.width / 2];
              size = [2, WINDOW_HEIGHT, Math.max(1, opening.width - 4)];
              break;
          }

          return (
            <group key={`${axis}-window-${index}`}>
              <mesh position={position}>
                <boxGeometry args={size} />
                <meshStandardMaterial
                  color={WINDOW_COLOR}
                  transparent
                  opacity={0.38}
                  side={THREE.DoubleSide}
                  flatShading
                />
              </mesh>
              <WindowFrame
                axis={axis}
                opening={opening}
                roomWidth={roomWidth}
              />
            </group>
          );
        })}
    </>
  );
}

function WindowFrame({
  axis,
  opening,
  roomWidth,
  roomDepth = 0,
}: {
  axis: 'north' | 'south' | 'west' | 'east';
  opening: WallSpan;
  roomWidth: number;
  roomDepth?: number;
}) {
  const frame = 3;
  const isHorizontal = axis === 'north' || axis === 'south';
  const wallCoordinate = axis === 'north'
    ? -WALL_THICKNESS / 2 - 0.6
    : axis === 'south'
      ? roomDepth + WALL_THICKNESS / 2 + 0.6
      : axis === 'west'
        ? -WALL_THICKNESS / 2 - 0.6
        : roomWidth + WALL_THICKNESS / 2 + 0.6;
  const xPositions = isHorizontal
    ? [opening.offset, opening.offset + opening.width]
    : [wallCoordinate, wallCoordinate];
  const zPositions = isHorizontal
    ? [wallCoordinate, wallCoordinate]
    : [opening.offset, opening.offset + opening.width];

  return (
    <group>
      {([0, 1] as const).map((index) => {
        const position: [number, number, number] = isHorizontal
          ? [xPositions[index], WINDOW_BOTTOM + WINDOW_HEIGHT / 2, wallCoordinate]
          : [wallCoordinate, WINDOW_BOTTOM + WINDOW_HEIGHT / 2, zPositions[index]];
        const size: [number, number, number] = [frame, WINDOW_HEIGHT + frame * 2, frame];
        return (
          <mesh key={`vertical-${index}`} position={position} castShadow>
            <boxGeometry args={size} />
            <meshStandardMaterial color="#c8b9a8" flatShading />
          </mesh>
        );
      })}
      <mesh
        position={
          isHorizontal
            ? [opening.offset + opening.width / 2, WINDOW_BOTTOM + WINDOW_HEIGHT + frame / 2, wallCoordinate]
            : [wallCoordinate, WINDOW_BOTTOM + WINDOW_HEIGHT + frame / 2, opening.offset + opening.width / 2]
        }
      >
        <boxGeometry
          args={
            isHorizontal
              ? [opening.width + frame * 2, frame, frame]
              : [frame, frame, opening.width + frame * 2]
          }
        />
        <meshStandardMaterial color="#c8b9a8" flatShading />
      </mesh>
      <mesh
        position={
          isHorizontal
            ? [opening.offset + opening.width / 2, WINDOW_BOTTOM - frame / 2, wallCoordinate]
            : [wallCoordinate, WINDOW_BOTTOM - frame / 2, opening.offset + opening.width / 2]
        }
      >
        <boxGeometry
          args={
            isHorizontal
              ? [opening.width + frame * 2, frame, frame * 1.5]
              : [frame * 1.5, frame, opening.width + frame * 2]
          }
        />
        <meshStandardMaterial color="#c8b9a8" flatShading />
      </mesh>
    </group>
  );
}

function normalizeOpenings(roomOpenings: Opening[], wall: Opening['wall'], totalLength: number): WallSpan[] {
  return roomOpenings
    .filter((opening) => opening.wall === wall && Number.isFinite(opening.offset) && Number.isFinite(opening.width))
    .map((opening) => {
      const start = Math.max(0, Math.min(totalLength, opening.offset));
      const end = Math.max(start, Math.min(totalLength, opening.offset + Math.max(0, opening.width)));
      return { offset: start, width: end - start, kind: opening.kind };
    })
    .filter((opening) => opening.width > 0)
    .sort((a, b) => a.offset - b.offset);
}

function wallSegments(totalLength: number, openings: WallSpan[]): WallSegment[] {
  const segments: WallSegment[] = [];
  let cursor = 0;

  for (const opening of openings) {
    if (opening.offset > cursor) {
      segments.push({ offset: cursor, length: opening.offset - cursor });
    }
    cursor = Math.max(cursor, opening.offset + opening.width);
  }

  if (cursor < totalLength) {
    segments.push({ offset: cursor, length: totalLength - cursor });
  }
  return segments;
}
