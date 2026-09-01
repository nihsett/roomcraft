# RoomCraft 3D Upgrade — Coding Agent Instructions

> **Read this entire file before writing any code.**
>
> You are upgrading RoomCraft from a 2D SVG canvas to a 3D low-poly diorama view.
> The app already works — room layout, drag-and-drop, WebMCP tools, clearance engine,
> tool log panel, everything. You are ONLY replacing the render layer.

---

## Rule #1: The boundary

**DO NOT TOUCH** any of these files:

- `src/store.ts` — state management (Zustand)
- `src/types.ts` — TypeScript interfaces
- `src/catalog.ts` — furniture catalog
- `src/defaults.ts` — default room and items
- `src/engine/clearance.ts` — BFS clearance algorithm
- `src/engine/geometry.ts` — geometry helpers
- `src/webmcp/register.ts` — tool registration wrapper
- `src/webmcp/tools.ts` — all WebMCP tool handlers
- `src/webmcp/dynamic-tools.ts` — selection-dependent tools
- `src/ui/Sidebar.tsx` — right panel
- `src/ui/ToolLog.tsx` — tool call log
- `src/ui/Header.tsx` — header bar

The store operates in 2D centimeters: `(x, y)` is the top-left corner of the item's
bounding box, `w` and `d` are unrotated width/depth. Tools, clearance engine, journal —
all continue to work in this 2D cm-space. Nothing changes there.

**You ARE changing:**

- `src/canvas/RoomCanvas.tsx` — replace SVG with R3F `<Canvas>`
- `src/canvas/FurnitureItem.tsx` — replace SVG group with 3D mesh group
- `src/canvas/RoomOutline.tsx` — replace SVG walls with 3D wall/floor geometry
- `src/canvas/ClearanceOverlay.tsx` — replace SVG lines with 3D floor ribbons
- `src/canvas/GridDots.tsx` — remove or replace with subtle floor grid
- `src/App.tsx` — minor: may need to adjust the canvas container div
- `src/index.css` — minor: canvas container styling adjustments

---

## Rule #2: Git safety

Before writing any code:

```bash
git add -A && git commit -m "working 2D version before 3D upgrade"
git checkout -b 3d-upgrade
```

If the 3D attempt fails, you revert to main and everything still works. This is your
safety net. Do not skip this step.

---

## Step 1: Install dependencies

```bash
npm install @react-three/fiber @react-three/drei three
npm install -D @types/three
```

No other dependencies. No GLTF loaders, no texture libraries, no physics engines.

---

## Step 2: Coordinate mapping

The store uses 2D centimeters. The 3D scene uses Three.js world units where 1 unit = 1 cm.

Mapping from store `Item` to 3D position:

```ts
import { effectiveSize } from '../types';
import type { Item } from '../types';

// Store (x, y) is top-left of 2D bounding box.
// 3D group position is the CENTER of the footprint, on the floor (y=0).
// Store y-axis → 3D z-axis (depth into scene).
// Store x-axis → 3D x-axis (left-right).
// 3D y-axis is up (height).

function itemTo3DPosition(item: Item): [number, number, number] {
  const eff = effectiveSize(item);
  return [
    item.x + eff.w / 2,   // center x
    0,                      // floor level (each mesh offsets its own y for height)
    item.y + eff.d / 2,   // center z
  ];
}

// Store rotation (0/90/180/270 clockwise in 2D top-down)
// → 3D Y-axis rotation in radians (clockwise when viewed from above)
function itemTo3DRotation(rotation: number): number {
  return -(rotation * Math.PI) / 180;
}
```

---

## Step 3: The 3D scene — `RoomCanvas.tsx`

Replace the entire SVG canvas with an R3F `<Canvas>`. The scene contains:

1. Floor plane
2. Walls (far sides only — near walls omitted so camera sees in, classic diorama)
3. Furniture meshes
4. Clearance overlay ribbons
5. Lights
6. Camera with OrbitControls

```tsx
import { Canvas } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import { useStore } from '../store';
import { Floor } from './Floor';
import { Walls } from './Walls';
import { FurnitureItem3D } from './FurnitureItem3D';
import { ClearanceOverlay3D } from './ClearanceOverlay3D';
import { useRef, useCallback, useState } from 'react';
import * as THREE from 'three';

export function RoomCanvas() {
  const room = useStore((s) => s.room);
  const items = useStore((s) => s.items);
  const selectedId = useStore((s) => s.selectedId);
  const clearanceOverlay = useStore((s) => s.clearanceOverlay);
  const selectItem = useStore((s) => s.selectItem);
  const [autoOrbit, setAutoOrbit] = useState(false);

  // Click on empty space → deselect
  const onPointerMissed = useCallback(() => {
    selectItem(null);
  }, [selectItem]);

  // Camera position: 3/4 bird's-eye looking at room center
  const camTarget: [number, number, number] = [room.width / 2, 0, room.depth / 2];
  const camPosition: [number, number, number] = [
    room.width / 2 + room.width * 0.3,
    Math.max(room.width, room.depth) * 0.9,
    room.depth / 2 + room.depth * 0.5,
  ];

  return (
    <div className="relative h-full w-full">
      {/* Auto-orbit toggle for video recording */}
      <button
        onClick={() => setAutoOrbit(!autoOrbit)}
        className="absolute right-3 top-3 z-10 rounded-lg border border-[#e8e1d9] bg-white/80 px-2.5 py-1.5 text-[10px] font-medium text-[#9b9289] shadow-sm backdrop-blur-sm hover:bg-white"
      >
        {autoOrbit ? 'Stop orbit' : 'Auto orbit'}
      </button>

      <Canvas
        shadows
        camera={{ position: camPosition, fov: 40, near: 1, far: 5000 }}
        onPointerMissed={onPointerMissed}
        style={{ background: '#f0ece4' }}
      >
        {/* Lighting */}
        <ambientLight intensity={0.6} />
        <directionalLight
          position={[room.width * 0.8, room.depth * 1.2, -room.depth * 0.3]}
          intensity={0.8}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-room.width}
          shadow-camera-right={room.width}
          shadow-camera-top={room.depth}
          shadow-camera-bottom={-room.depth}
        />

        {/* Scene contents */}
        <Floor width={room.width} depth={room.depth} />
        <Walls room={room} />

        {items.map((item) => (
          <FurnitureItem3D
            key={item.id}
            item={item}
            isSelected={item.id === selectedId}
          />
        ))}

        {clearanceOverlay && (
          <ClearanceOverlay3D paths={clearanceOverlay} />
        )}

        <ContactShadows
          position={[room.width / 2, 0.1, room.depth / 2]}
          width={room.width}
          height={room.depth}
          opacity={0.3}
          blur={2}
          far={300}
        />

        <OrbitControls
          target={camTarget}
          autoRotate={autoOrbit}
          autoRotateSpeed={0.5}
          maxPolarAngle={Math.PI / 2.3}
          minPolarAngle={Math.PI / 6}
          enablePan={true}
          enableZoom={true}
        />
      </Canvas>
    </div>
  );
}
```

**File naming:** You may rename the files inside `src/canvas/` or create new ones alongside them.
Just make sure the imports in `App.tsx` resolve. The simplest approach is to overwrite
each existing file with its 3D equivalent.

---

## Step 4: Floor — `Floor.tsx`

A flat plane at y=0 covering the room. Warm wood color. Receives shadows.

```tsx
export function Floor({ width, depth }: { width: number; depth: number }) {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[width / 2, 0, depth / 2]}
      receiveShadow
    >
      <planeGeometry args={[width, depth]} />
      <meshStandardMaterial color="#d4c4a8" flatShading />
    </mesh>
  );
}
```

Optional: add a subtle grid overlay using drei's `<Grid>` component or a second slightly-raised
transparent plane with a grid texture. Keep it subtle — it's background, not UI.

---

## Step 5: Walls — `Walls.tsx`

Diorama style: render only the far two walls (north and west, or whichever pair the camera
faces AWAY from). Omit the near walls so the camera sees into the room. Walls are thin
boxes (6cm thick, 250cm tall). Cut gaps for doors and windows.

```tsx
import type { Room, Opening } from '../types';

const WALL_HEIGHT = 250;
const WALL_THICKNESS = 6;
const WALL_COLOR = '#e8e4de';
const WINDOW_COLOR = '#a8d4e6';

export function Walls({ room }: { room: Room }) {
  const { width, depth, openings } = room;

  // North wall (z=0) — far wall, camera looks toward it
  const northOpenings = openings.filter((o) => o.wall === 'N');
  const northSegments = wallSegments(width, northOpenings);

  // West wall (x=0) — left wall
  const westOpenings = openings.filter((o) => o.wall === 'W');
  const westSegments = wallSegments(depth, westOpenings);

  // Optionally render east wall too if there are openings on it (like the balcony door)
  const eastOpenings = openings.filter((o) => o.wall === 'E');
  const eastSegments = wallSegments(depth, eastOpenings);

  return (
    <group>
      {/* North wall segments at z=0 */}
      {northSegments.map((seg, i) => (
        <mesh
          key={`n-${i}`}
          position={[seg.offset + seg.length / 2, WALL_HEIGHT / 2, -WALL_THICKNESS / 2]}
          castShadow receiveShadow
        >
          <boxGeometry args={[seg.length, WALL_HEIGHT, WALL_THICKNESS]} />
          <meshStandardMaterial color={WALL_COLOR} flatShading />
        </mesh>
      ))}

      {/* North wall windows (glass panes in the gaps) */}
      {northOpenings.filter((o) => o.kind === 'window').map((o, i) => (
        <mesh
          key={`nw-${i}`}
          position={[o.offset + o.width / 2, WALL_HEIGHT * 0.55, -WALL_THICKNESS / 2]}
        >
          <boxGeometry args={[o.width - 4, WALL_HEIGHT * 0.45, 2]} />
          <meshStandardMaterial color={WINDOW_COLOR} transparent opacity={0.3} flatShading />
        </mesh>
      ))}

      {/* West wall segments at x=0 */}
      {westSegments.map((seg, i) => (
        <mesh
          key={`w-${i}`}
          position={[-WALL_THICKNESS / 2, WALL_HEIGHT / 2, seg.offset + seg.length / 2]}
          castShadow receiveShadow
        >
          <boxGeometry args={[WALL_THICKNESS, WALL_HEIGHT, seg.length]} />
          <meshStandardMaterial color={WALL_COLOR} flatShading />
        </mesh>
      ))}

      {/* East wall segments at x=width (for balcony door visibility) */}
      {eastSegments.map((seg, i) => (
        <mesh
          key={`e-${i}`}
          position={[width + WALL_THICKNESS / 2, WALL_HEIGHT / 2, seg.offset + seg.length / 2]}
          castShadow receiveShadow
        >
          <boxGeometry args={[WALL_THICKNESS, WALL_HEIGHT, seg.length]} />
          <meshStandardMaterial color={WALL_COLOR} flatShading />
        </mesh>
      ))}
    </group>
  );
}

interface WallSegment {
  offset: number;
  length: number;
}

function wallSegments(totalLength: number, openings: Opening[]): WallSegment[] {
  const sorted = [...openings].sort((a, b) => a.offset - b.offset);
  const segments: WallSegment[] = [];
  let cursor = 0;

  for (const o of sorted) {
    if (o.offset > cursor) {
      segments.push({ offset: cursor, length: o.offset - cursor });
    }
    cursor = o.offset + o.width;
  }

  if (cursor < totalLength) {
    segments.push({ offset: cursor, length: totalLength - cursor });
  }

  return segments;
}
```

---

## Step 6: Furniture — `FurnitureItem3D.tsx`

Each furniture item is an R3F `<group>` positioned using the coordinate mapping from Step 2.
Inside the group, child meshes are composed box/cylinder primitives to form the shape.
**All flat-shaded, no textures, no external assets.**

### Animation

Use `useFrame` to lerp the group position toward the store's target position each frame.
This gives smooth animation for both agent moves and batch moves automatically.

```tsx
import { useRef } from 'react';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { Item } from '../types';
import { effectiveSize } from '../types';
import { useStore } from '../store';

const SNAP = 5;
const LERP_SPEED = 8; // higher = faster animation

// ─── Color palette (pastel, flat-shaded diorama) ───
const COLORS: Record<string, string> = {
  'sofa':          '#8fa4b8',
  'loveseat':      '#8fa4b8',
  'armchair':      '#9aafb8',
  'coffee-table':  '#c4a878',
  'tv-stand':      '#a09890',
  'dining-table':  '#c4a878',
  'dining-chair':  '#b8a080',
  'bookshelf':     '#a08868',
  'bed-queen':     '#a8a0b8',
  'desk':          '#90a890',
  'rug':           '#c8b898',
  'plant':         '#78a068',
};

export function FurnitureItem3D({ item, isSelected }: { item: Item; isSelected: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const selectItem = useStore((s) => s.selectItem);
  const moveItem = useStore((s) => s.moveItem);
  const appendJournal = useStore((s) => s.appendJournal);
  const highlightId = useStore((s) => s.highlightId);
  const isHighlighted = highlightId === item.id;

  const eff = effectiveSize(item);
  const targetX = item.x + eff.w / 2;
  const targetZ = item.y + eff.d / 2;
  const targetRotY = -(item.rotation * Math.PI) / 180;

  // Smooth animation: lerp toward target every frame
  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    group.position.x = THREE.MathUtils.lerp(group.position.x, targetX, 1 - Math.exp(-LERP_SPEED * delta));
    group.position.z = THREE.MathUtils.lerp(group.position.z, targetZ, 1 - Math.exp(-LERP_SPEED * delta));

    // Lerp rotation (handle wrapping)
    const currentY = group.rotation.y;
    let diff = targetRotY - currentY;
    // Shortest path rotation
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    group.rotation.y += diff * (1 - Math.exp(-LERP_SPEED * delta));

    // Highlight bounce effect
    if (isHighlighted) {
      group.position.y = Math.sin(Date.now() * 0.008) * 5 + 2.5;
    } else {
      group.position.y = THREE.MathUtils.lerp(group.position.y, 0, 0.1);
    }
  });

  // ─── Drag via raycast to floor plane ───
  const dragState = useRef<{ startX: number; startZ: number; itemX: number; itemY: number } | null>(null);
  const floorPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const intersectPoint = useRef(new THREE.Vector3());

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
    selectItem(item.id);

    // Raycast to floor plane to get starting world position
    e.ray.intersectPlane(floorPlane.current, intersectPoint.current);
    dragState.current = {
      startX: intersectPoint.current.x,
      startZ: intersectPoint.current.z,
      itemX: item.x,
      itemY: item.y,
    };
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!dragState.current) return;
    e.stopPropagation();

    e.ray.intersectPlane(floorPlane.current, intersectPoint.current);
    const dx = intersectPoint.current.x - dragState.current.startX;
    const dz = intersectPoint.current.z - dragState.current.startZ;

    const newX = Math.round((dragState.current.itemX + dx) / SNAP) * SNAP;
    const newY = Math.round((dragState.current.itemY + dz) / SNAP) * SNAP;
    moveItem(item.id, newX, newY);
  };

  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (!dragState.current) return;
    e.stopPropagation();

    const current = useStore.getState().items.find((i) => i.id === item.id);
    if (current && (current.x !== dragState.current.itemX || current.y !== dragState.current.itemY)) {
      appendJournal({
        action: 'move',
        itemId: item.id,
        from: { x: dragState.current.itemX, y: dragState.current.itemY },
        to: { x: current.x, y: current.y },
      });
    }
    dragState.current = null;
  };

  const color = COLORS[item.type] ?? '#b0a898';
  const selectionColor = '#4285f4';

  return (
    <group
      ref={groupRef}
      position={[targetX, 0, targetZ]}
      rotation={[0, targetRotY, 0]}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Render the furniture shape based on type */}
      <FurnitureShape
        type={item.type}
        w={item.w}   // always pass UNROTATED dimensions
        d={item.d}   // the group rotation handles orientation
        color={color}
        isSelected={isSelected}
        selectionColor={selectionColor}
      />

      {/* Selection ring on the floor */}
      {isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.5, 0]}>
          <ringGeometry args={[Math.max(item.w, item.d) / 2 + 5, Math.max(item.w, item.d) / 2 + 8, 32]} />
          <meshBasicMaterial color={selectionColor} transparent opacity={0.5} />
        </mesh>
      )}
    </group>
  );
}
```

### Furniture shape recipes — `FurnitureShape.tsx`

Each furniture type is a composition of box and cylinder primitives.
**This is the aesthetic. Get this right.** Low-poly, flat-shaded, pastel.

All dimensions below are in cm. The shapes are centered at (0, 0, 0) horizontally,
with the bottom face at y=0 (sitting on the floor).

```tsx
import * as THREE from 'three';

interface ShapeProps {
  type: string;
  w: number;          // unrotated width
  d: number;          // unrotated depth
  color: string;
  isSelected: boolean;
  selectionColor: string;
}

export function FurnitureShape({ type, w, d, color, isSelected, selectionColor }: ShapeProps) {
  const mat = <meshStandardMaterial color={color} flatShading />;
  const selMat = <meshStandardMaterial color={selectionColor} flatShading />;
  const darkerColor = darken(color, 0.15);
  const darkMat = <meshStandardMaterial color={darkerColor} flatShading />;

  switch (type) {
    // ─── SOFA (220×90) ───
    // Base seat + backrest + two armrests
    case 'sofa':
    case 'loveseat': {
      const seatH = 38;
      const backH = 32;
      const armW = 12;
      const armH = 22;
      return (
        <group>
          {/* Seat base */}
          <mesh position={[0, seatH / 2, 0]} castShadow>
            <boxGeometry args={[w, seatH, d]} />
            {mat}
          </mesh>
          {/* Backrest */}
          <mesh position={[0, seatH + backH / 2, -d / 2 + 8]} castShadow>
            <boxGeometry args={[w, backH, 16]} />
            {darkMat}
          </mesh>
          {/* Left armrest */}
          <mesh position={[-w / 2 + armW / 2, seatH + armH / 2, 0]} castShadow>
            <boxGeometry args={[armW, armH, d - 16]} />
            {darkMat}
          </mesh>
          {/* Right armrest */}
          <mesh position={[w / 2 - armW / 2, seatH + armH / 2, 0]} castShadow>
            <boxGeometry args={[armW, armH, d - 16]} />
            {darkMat}
          </mesh>
          {/* Cushion lines (two subtle grooves) */}
          <mesh position={[-w / 6, seatH + 0.5, 4]} castShadow>
            <boxGeometry args={[1.5, 1, d - 20]} />
            {darkMat}
          </mesh>
          <mesh position={[w / 6, seatH + 0.5, 4]} castShadow>
            <boxGeometry args={[1.5, 1, d - 20]} />
            {darkMat}
          </mesh>
        </group>
      );
    }

    // ─── ARMCHAIR (85×85) ───
    case 'armchair': {
      const seatH = 38;
      const backH = 35;
      const armW = 10;
      return (
        <group>
          <mesh position={[0, seatH / 2, 0]} castShadow>
            <boxGeometry args={[w, seatH, d]} />
            {mat}
          </mesh>
          <mesh position={[0, seatH + backH / 2, -d / 2 + 8]} castShadow>
            <boxGeometry args={[w, backH, 16]} />
            {darkMat}
          </mesh>
          <mesh position={[-w / 2 + armW / 2, seatH + 15, 0]} castShadow>
            <boxGeometry args={[armW, 18, d - 16]} />
            {darkMat}
          </mesh>
          <mesh position={[w / 2 - armW / 2, seatH + 15, 0]} castShadow>
            <boxGeometry args={[armW, 18, d - 16]} />
            {darkMat}
          </mesh>
        </group>
      );
    }

    // ─── BED (160×210) ───
    // Base frame + mattress + headboard + two pillows
    case 'bed-queen': {
      const frameH = 25;
      const mattressH = 18;
      const headboardH = 50;
      return (
        <group>
          {/* Frame */}
          <mesh position={[0, frameH / 2, 0]} castShadow>
            <boxGeometry args={[w, frameH, d]} />
            {darkMat}
          </mesh>
          {/* Mattress */}
          <mesh position={[0, frameH + mattressH / 2, 0]} castShadow>
            <boxGeometry args={[w - 4, mattressH, d - 4]} />
            <meshStandardMaterial color="#e8e4f0" flatShading />
          </mesh>
          {/* Headboard */}
          <mesh position={[0, frameH + headboardH / 2, -d / 2 + 5]} castShadow>
            <boxGeometry args={[w, headboardH, 10]} />
            {darkMat}
          </mesh>
          {/* Left pillow */}
          <mesh position={[-w / 4, frameH + mattressH + 5, -d / 2 + 35]} castShadow>
            <boxGeometry args={[w / 3, 10, 30]} />
            <meshStandardMaterial color="#f0ece8" flatShading />
          </mesh>
          {/* Right pillow */}
          <mesh position={[w / 4, frameH + mattressH + 5, -d / 2 + 35]} castShadow>
            <boxGeometry args={[w / 3, 10, 30]} />
            <meshStandardMaterial color="#f0ece8" flatShading />
          </mesh>
        </group>
      );
    }

    // ─── DINING TABLE (160×90) / COFFEE TABLE (110×60) ───
    // Tabletop on four legs
    case 'dining-table':
    case 'coffee-table': {
      const topH = 5;
      const legH = type === 'coffee-table' ? 38 : 72;
      const legW = 5;
      const inset = 10;
      return (
        <group>
          {/* Tabletop */}
          <mesh position={[0, legH + topH / 2, 0]} castShadow>
            <boxGeometry args={[w, topH, d]} />
            {mat}
          </mesh>
          {/* Four legs */}
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
            <mesh key={i} position={[sx * (w / 2 - inset), legH / 2, sz * (d / 2 - inset)]} castShadow>
              <boxGeometry args={[legW, legH, legW]} />
              {darkMat}
            </mesh>
          ))}
        </group>
      );
    }

    // ─── DINING CHAIR (45×45) ───
    // Seat + four legs + backrest
    case 'dining-chair': {
      const seatH = 45;
      const seatThick = 4;
      const legW = 3;
      const backH = 35;
      const inset = 5;
      return (
        <group>
          {/* Seat */}
          <mesh position={[0, seatH, 0]} castShadow>
            <boxGeometry args={[w, seatThick, d]} />
            {mat}
          </mesh>
          {/* Legs */}
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
            <mesh key={i} position={[sx * (w / 2 - inset), seatH / 2, sz * (d / 2 - inset)]} castShadow>
              <boxGeometry args={[legW, seatH, legW]} />
              {darkMat}
            </mesh>
          ))}
          {/* Backrest */}
          <mesh position={[0, seatH + backH / 2, -d / 2 + 3]} castShadow>
            <boxGeometry args={[w - 6, backH, 3]} />
            {darkMat}
          </mesh>
        </group>
      );
    }

    // ─── DESK (140×70) ───
    // Tabletop + two side panels (not four legs — panel-style desk)
    case 'desk': {
      const topH = 4;
      const legH = 72;
      const panelW = 3;
      return (
        <group>
          <mesh position={[0, legH + topH / 2, 0]} castShadow>
            <boxGeometry args={[w, topH, d]} />
            {mat}
          </mesh>
          <mesh position={[-w / 2 + panelW / 2 + 2, legH / 2, 0]} castShadow>
            <boxGeometry args={[panelW, legH, d - 10]} />
            {darkMat}
          </mesh>
          <mesh position={[w / 2 - panelW / 2 - 2, legH / 2, 0]} castShadow>
            <boxGeometry args={[panelW, legH, d - 10]} />
            {darkMat}
          </mesh>
        </group>
      );
    }

    // ─── TV STAND (160×45) ───
    // Low cabinet with a shelf
    case 'tv-stand': {
      const h = 45;
      return (
        <group>
          <mesh position={[0, h / 2, 0]} castShadow>
            <boxGeometry args={[w, h, d]} />
            {mat}
          </mesh>
          {/* Shelf line */}
          <mesh position={[0, h * 0.5, d / 2 + 0.5]}>
            <boxGeometry args={[w - 4, 1, 1]} />
            {darkMat}
          </mesh>
          {/* Screen on top (thin dark rectangle) */}
          <mesh position={[0, h + 30, -d / 4]} castShadow>
            <boxGeometry args={[w * 0.8, 55, 3]} />
            <meshStandardMaterial color="#2d2d2d" flatShading />
          </mesh>
        </group>
      );
    }

    // ─── BOOKSHELF (90×35) ───
    // Tall box with horizontal shelf lines
    case 'bookshelf': {
      const h = 170;
      return (
        <group>
          {/* Outer frame */}
          <mesh position={[0, h / 2, 0]} castShadow>
            <boxGeometry args={[w, h, d]} />
            {mat}
          </mesh>
          {/* Shelves (4 horizontal lines on the front face) */}
          {[0.2, 0.4, 0.6, 0.8].map((frac, i) => (
            <mesh key={i} position={[0, h * frac, d / 2 + 0.5]}>
              <boxGeometry args={[w - 6, 2, 1]} />
              {darkMat}
            </mesh>
          ))}
          {/* Some "book" blocks on shelves for visual interest */}
          {[0.3, 0.5, 0.7].map((frac, i) => (
            <mesh key={`b${i}`} position={[-w / 4 + i * w / 4, h * frac + 12, 0]} castShadow>
              <boxGeometry args={[w / 5, 20, d - 8]} />
              <meshStandardMaterial color={['#c47868', '#6898a8', '#a8b878'][i]} flatShading />
            </mesh>
          ))}
        </group>
      );
    }

    // ─── RUG (200×140) ───
    // Flat rectangle on the floor, slightly raised
    case 'rug':
      return (
        <mesh position={[0, 0.5, 0]} receiveShadow>
          <boxGeometry args={[w, 1, d]} />
          <meshStandardMaterial color={color} flatShading />
        </mesh>
      );

    // ─── PLANT (40×40) ───
    // Pot (cylinder) + foliage sphere/cone
    case 'plant': {
      const potH = 22;
      const potR = w / 3;
      return (
        <group>
          {/* Pot */}
          <mesh position={[0, potH / 2, 0]} castShadow>
            <cylinderGeometry args={[potR, potR * 0.8, potH, 8]} />
            <meshStandardMaterial color="#c49878" flatShading />
          </mesh>
          {/* Soil */}
          <mesh position={[0, potH, 0]}>
            <cylinderGeometry args={[potR - 1, potR - 1, 2, 8]} />
            <meshStandardMaterial color="#6b5840" flatShading />
          </mesh>
          {/* Foliage */}
          <mesh position={[0, potH + 25, 0]} castShadow>
            <dodecahedronGeometry args={[20, 0]} />
            <meshStandardMaterial color={color} flatShading />
          </mesh>
          {/* Second smaller foliage blob */}
          <mesh position={[8, potH + 38, -5]} castShadow>
            <dodecahedronGeometry args={[12, 0]} />
            <meshStandardMaterial color={darken(color, -0.1)} flatShading />
          </mesh>
        </group>
      );
    }

    // ─── FALLBACK ───
    default:
      return (
        <mesh position={[0, 20, 0]} castShadow>
          <boxGeometry args={[w, 40, d]} />
          {mat}
        </mesh>
      );
  }
}

// Darken/lighten a hex color by a fraction
function darken(hex: string, amount: number): string {
  const c = new THREE.Color(hex);
  if (amount > 0) {
    c.lerp(new THREE.Color('#000000'), amount);
  } else {
    c.lerp(new THREE.Color('#ffffff'), -amount);
  }
  return '#' + c.getHexString();
}
```

---

## Step 7: Clearance overlay — `ClearanceOverlay3D.tsx`

Render path segments as flat glowing ribbons on the floor. Green for pass, red for fail.
This is the single best visual in the demo video — a glowing path through a 3D room.

```tsx
import type { ClearancePath } from '../types';
import * as THREE from 'three';

const RIBBON_HEIGHT = 1.5;  // just above the floor
const RIBBON_WIDTH = 8;     // cm wide

export function ClearanceOverlay3D({ paths }: { paths: ClearancePath[] }) {
  return (
    <group>
      {paths.map((path, pi) =>
        path.segments.map((seg, si) => {
          // seg.x1, seg.y1 → seg.x2, seg.y2 are in 2D cm-space
          // Map to 3D: x stays x, y becomes z
          const dx = seg.x2 - seg.x1;
          const dz = seg.y2 - seg.y1;
          const length = Math.sqrt(dx * dx + dz * dz);
          const angle = Math.atan2(dx, dz);
          const cx = (seg.x1 + seg.x2) / 2;
          const cz = (seg.y1 + seg.y2) / 2;

          return (
            <mesh
              key={`${pi}-${si}`}
              position={[cx, RIBBON_HEIGHT, cz]}
              rotation={[0, angle, 0]}
            >
              <boxGeometry args={[RIBBON_WIDTH, 1, length]} />
              <meshStandardMaterial
                color={path.pass ? '#22c55e' : '#ef4444'}
                emissive={path.pass ? '#22c55e' : '#ef4444'}
                emissiveIntensity={0.8}
                transparent
                opacity={0.7}
                flatShading
              />
            </mesh>
          );
        })
      )}
    </group>
  );
}
```

---

## Step 8: Update App.tsx

Minimal change — the `<RoomCanvas />` import stays the same if you overwrote the file.
You may need to adjust the canvas container:

- Remove the `canvas-shell` specific sizing if the R3F canvas handles its own size.
- The R3F `<Canvas>` fills its parent container, so make sure the parent div has
  explicit height (`h-full` or similar).
- Remove the keyboard hints overlay (`kbd` elements) — keyboard shortcuts for R/Delete
  still need to work, but they should be handled via a `window` event listener
  instead of SVG `onKeyDown`. Add this to `App.tsx`:

```tsx
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    const state = useStore.getState();
    const { selectedId } = state;
    if (!selectedId) return;
    const item = state.items.find((i) => i.id === selectedId);
    if (!item) return;

    if (e.key === 'r' || e.key === 'R') {
      const nextRot = ((item.rotation + 90) % 360) as Rotation;
      const result = state.rotateItem(selectedId, nextRot);
      if (result === true) {
        state.appendJournal({
          action: 'rotate', itemId: selectedId,
          from: { rotation: item.rotation }, to: { rotation: nextRot },
        });
      }
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const result = state.removeItem(selectedId);
      if (result === true) {
        state.appendJournal({ action: 'remove', itemId: selectedId });
      }
    }
  };

  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, []);
```

---

## Step 9: Remove or simplify GridDots

The 2D grid dots don't translate to 3D. Either:
- Delete `GridDots.tsx` and remove its import
- Or replace with a very subtle drei `<Grid>` on the floor (optional, not required)

---

## Step 10: Verify

After building, verify these things work:

1. `npm run build` — no TypeScript errors
2. `npm run dev` — scene renders, you see a room with walls, floor, furniture
3. Drag a furniture item — it moves on the floor plane, snaps to grid
4. Press R with item selected — it rotates
5. Press Delete — it removes
6. The sidebar tool log still renders (it's React, completely separate from 3D)
7. Open Chrome with WebMCP flag — tools register, green dot shows (if applicable)
8. Call `get_room_state` from an agent — returns correct data
9. Call `move_items` — furniture glides to new positions simultaneously
10. Call `check_clearance` — glowing green/red ribbons appear on the floor
11. Toggle auto-orbit — camera slowly rotates around the diorama

If drag doesn't work (raycasting to floor plane is the likeliest failure point):
- Acceptable fallback: click to select, then nudge with arrow keys for the human demo beat.
  The agent moves things via tools regardless.
- Debug: make sure the invisible floor plane in the raycast matches y=0, and that
  `onPointerDown/Move/Up` are on the furniture group, not individual child meshes.

---

## Forbidden

- NO external 3D models (GLTF, OBJ, FBX)
- NO texture files (PNG, JPG)
- NO PBR materials — use `meshStandardMaterial` with `flatShading` only
- NO physics engine
- NO post-processing effects
- NO changes to the store, tools, or clearance engine
- DO NOT delete the 2D canvas files until 3D is confirmed working — keep them for rollback
