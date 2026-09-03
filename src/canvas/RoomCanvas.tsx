import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { ClearanceOverlay3D } from './ClearanceOverlay3D';
import { Floor } from './Floor';
import { FurnitureItem3D } from './FurnitureItem3D';
import { Walls } from './Walls';
import { WebGLGuard, WebGLUnavailable } from './WebGLGuard';

export function RoomCanvas() {
  return (
    <WebGLGuard>
      <RoomCanvas3D />
    </WebGLGuard>
  );
}

function RoomCanvas3D() {
  const room = useStore((state) => state.room);
  const items = useStore((state) => state.items);
  const selectedId = useStore((state) => state.selectedId);
  const clearanceOverlay = useStore((state) => state.clearanceOverlay);
  const selectItem = useStore((state) => state.selectItem);
  const [autoOrbit, setAutoOrbit] = useState(true);

  const onEmptySpace = useCallback(() => {
    selectItem(null);
  }, [selectItem]);

  const { position: cameraPosition, target: cameraTarget } = useMemo(
    () => getInitialCameraFraming(room.width, room.depth),
    [room.depth, room.width],
  );
  const camera = useMemo(() => ({ position: cameraPosition, fov: 44, near: 1, far: 5000 }), [cameraPosition]);
  const sortedItems = useMemo(() => [...items].sort((a, b) => {
    if (a.type === 'rug' && b.type !== 'rug') return -1;
    if (b.type === 'rug' && a.type !== 'rug') return 1;
    if (a.id === selectedId) return 1;
    if (b.id === selectedId) return -1;
    return 0;
  }), [items, selectedId]);

  return (
    <div className="room-canvas relative h-full w-full">
      <button
        type="button"
        onClick={() => setAutoOrbit((value) => !value)}
        className="absolute right-3 top-3 z-10 rounded-lg border border-[#e8e1d9] bg-white/80 px-2.5 py-1.5 text-[10px] font-medium text-[#9b9289] shadow-sm backdrop-blur-sm transition-colors hover:bg-white hover:text-[#6f675f]"
      >
        {autoOrbit ? 'Stop orbit' : 'Auto orbit'}
      </button>

      <Canvas
        shadows
        dpr={[1, 2]}
        fallback={<WebGLUnavailable />}
        camera={camera}
        onPointerMissed={onEmptySpace}
        style={{ background: '#f0ece4' }}
      >
        <CameraFraming width={room.width} depth={room.depth} />
        <color attach="background" args={['#f0ece4']} />
        <ambientLight intensity={0.62} />
        <directionalLight
          position={[room.width * 0.78, Math.max(room.width, room.depth) * 1.25, -room.depth * 0.35]}
          intensity={0.9}
          castShadow
          shadow-bias={-0.0005}
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-room.width}
          shadow-camera-right={room.width}
          shadow-camera-top={room.depth}
          shadow-camera-bottom={-room.depth}
        />

        <group onPointerDown={onEmptySpace}>
          <Floor width={room.width} depth={room.depth} />
          <Walls room={room} />

          {sortedItems.map((item) => (
            <FurnitureItem3D
              key={item.id}
              item={item}
              isSelected={item.id === selectedId}
            />
          ))}

          {clearanceOverlay && <ClearanceOverlay3D paths={clearanceOverlay} />}

          <ContactShadows
            position={[room.width / 2, 0.2, room.depth / 2]}
            width={room.width}
            height={room.depth}
            opacity={0.28}
            blur={2.2}
            far={300}
          />
        </group>

        <OrbitControls
          target={cameraTarget}
          autoRotate={autoOrbit}
          autoRotateSpeed={0.5}
          enableDamping
          dampingFactor={0.08}
          maxPolarAngle={Math.PI / 2.3}
          minPolarAngle={Math.PI / 6}
          minDistance={Math.max(180, Math.min(room.width, room.depth) * 0.55)}
          maxDistance={Math.max(room.width, room.depth) * 2.2}
          enablePan
          enableZoom
        />
      </Canvas>
    </div>
  );
}

function CameraFraming({ width, depth }: { width: number; depth: number }) {
  const { camera } = useThree();

  useEffect(() => {
    const { position, target } = getInitialCameraFraming(width, depth);
    camera.position.set(...position);
    camera.lookAt(...target);
    camera.updateProjectionMatrix();
  }, [camera, depth, width]);

  return null;
}

function getInitialCameraFraming(width: number, depth: number): {
  position: [number, number, number];
  target: [number, number, number];
} {
  const roomScale = Math.max(width, depth);
  return {
    // Look in through the open southeast corner at a lower, room-scale
    // perspective. Furniture reads as furniture instead of floor-plan icons,
    // while the slightly offset target keeps the entire room in frame.
    position: [
      width + roomScale * 0.48,
      roomScale * 0.72,
      depth + roomScale * 0.62,
    ],
    target: [width * 0.48, roomScale * 0.11, depth * 0.46],
  };
}
