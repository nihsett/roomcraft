import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { useStore } from '../store';
import type { Item } from '../types';
import { effectiveSize } from '../types';
import { FurnitureShape } from './FurnitureShape';

const SNAP = 5;
const LERP_SPEED = 8;
const SELECTION_COLOR = '#4285f4';

const COLORS: Record<string, string> = {
  sofa: '#8fa4b8',
  loveseat: '#8fa4b8',
  armchair: '#9aafb8',
  'coffee-table': '#c4a878',
  'tv-stand': '#a09890',
  'dining-table': '#c4a878',
  'dining-chair': '#b8a080',
  bookshelf: '#a08868',
  'bed-queen': '#a8a0b8',
  desk: '#90a890',
  rug: '#c8b898',
  plant: '#78a068',
};

type DragState = {
  startX: number;
  startZ: number;
  itemX: number;
  itemY: number;
};

type PointerCaptureTarget = {
  setPointerCapture?: (pointerId: number) => void;
  releasePointerCapture?: (pointerId: number) => void;
};

export function FurnitureItem3D({ item, isSelected }: { item: Item; isSelected: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const dragState = useRef<DragState | null>(null);
  const floorPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const intersectPoint = useRef(new THREE.Vector3());
  const initialPosition = useRef<[number, number, number] | null>(null);
  const initialRotation = useRef<[number, number, number] | null>(null);

  const selectItem = useStore((state) => state.selectItem);
  const moveItem = useStore((state) => state.moveItem);
  const appendJournal = useStore((state) => state.appendJournal);
  const highlightId = useStore((state) => state.highlightId);
  const isHighlighted = highlightId === item.id;
  const size = effectiveSize(item);
  const targetX = item.x + size.w / 2;
  const targetZ = item.y + size.d / 2;
  const targetRotation = -(item.rotation * Math.PI) / 180;

  if (initialPosition.current === null) {
    initialPosition.current = [targetX, 0, targetZ];
  }
  if (initialRotation.current === null) {
    initialRotation.current = [0, targetRotation, 0];
  }

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    const easing = 1 - Math.exp(-LERP_SPEED * Math.min(delta, 0.1));
    group.position.x = THREE.MathUtils.lerp(group.position.x, targetX, easing);
    group.position.z = THREE.MathUtils.lerp(group.position.z, targetZ, easing);

    let rotationDelta = targetRotation - group.rotation.y;
    while (rotationDelta > Math.PI) rotationDelta -= Math.PI * 2;
    while (rotationDelta < -Math.PI) rotationDelta += Math.PI * 2;
    group.rotation.y += rotationDelta * easing;

    if (isHighlighted) {
      group.position.y = Math.sin(Date.now() * 0.008) * 5 + 2.5;
    } else {
      group.position.y = THREE.MathUtils.lerp(group.position.y, 0, easing);
    }
  });

  const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    event.nativeEvent.preventDefault();
    event.nativeEvent.stopImmediatePropagation();
    capturePointer(event, 'setPointerCapture');
    selectItem(item.id);

    const point = event.ray.intersectPlane(floorPlane.current, intersectPoint.current);
    if (!point) return;
    dragState.current = {
      startX: point.x,
      startZ: point.z,
      itemX: item.x,
      itemY: item.y,
    };
  };

  const onPointerMove = (event: ThreeEvent<PointerEvent>) => {
    const drag = dragState.current;
    if (!drag) return;
    event.stopPropagation();

    const point = event.ray.intersectPlane(floorPlane.current, intersectPoint.current);
    if (!point) return;
    const deltaX = point.x - drag.startX;
    const deltaZ = point.z - drag.startZ;
    const nextX = Math.round((drag.itemX + deltaX) / SNAP) * SNAP;
    const nextY = Math.round((drag.itemY + deltaZ) / SNAP) * SNAP;
    moveItem(item.id, nextX, nextY);
  };

  const finishDrag = (event?: ThreeEvent<PointerEvent>) => {
    const drag = dragState.current;
    if (!drag) return;
    if (event) {
      event.stopPropagation();
      capturePointer(event, 'releasePointerCapture');
    }

    const current = useStore.getState().items.find((candidate) => candidate.id === item.id);
    if (current && (current.x !== drag.itemX || current.y !== drag.itemY)) {
      appendJournal({
        action: 'move',
        itemId: item.id,
        from: { x: drag.itemX, y: drag.itemY },
        to: { x: current.x, y: current.y },
      });
    }
    dragState.current = null;
  };

  const color = COLORS[item.type] ?? '#b0a898';
  const initialPositionValue = initialPosition.current;
  const initialRotationValue = initialRotation.current;
  if (!initialPositionValue || !initialRotationValue) return null;

  return (
    <group
      ref={groupRef}
      position={initialPositionValue}
      rotation={initialRotationValue}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={() => finishDrag()}
    >
      <FurnitureShape
        type={item.type}
        w={item.w}
        d={item.d}
        color={color}
        isSelected={isSelected}
        selectionColor={SELECTION_COLOR}
      />

      {isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 1.2, 0]}>
          <ringGeometry args={[Math.max(size.w, size.d) / 2 + 5, Math.max(size.w, size.d) / 2 + 8, 48]} />
          <meshBasicMaterial color={SELECTION_COLOR} transparent opacity={0.62} />
        </mesh>
      )}
    </group>
  );
}

function capturePointer(event: ThreeEvent<PointerEvent>, method: keyof PointerCaptureTarget) {
  const target = event.target as unknown as PointerCaptureTarget;
  target[method]?.(event.pointerId);
}
