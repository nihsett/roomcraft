import { Grid } from '@react-three/drei';
import * as THREE from 'three';

interface FloorProps {
  width: number;
  depth: number;
}

/**
 * The room's coordinate plane. The store's x/y coordinates map to the floor's
 * x/z axes, with the origin at the room's north-west corner.
 */
export function Floor({ width, depth }: FloorProps) {
  return (
    <group>
      <mesh
        position={[width / 2, 0, depth / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color="#d4c4a8" flatShading />
      </mesh>

      {/* A quiet 50cm grid keeps the centimetre layout legible without becoming UI. */}
      <Grid
        args={[width, depth]}
        position={[width / 2, 0.24, depth / 2]}
        cellSize={50}
        sectionSize={100}
        cellColor="#c4b59f"
        sectionColor="#b8a78f"
        cellThickness={0.35}
        sectionThickness={0.65}
        fadeDistance={850}
        fadeStrength={0.45}
        side={THREE.DoubleSide}
        raycast={() => null}
      />
    </group>
  );
}
