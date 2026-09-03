import * as THREE from 'three';

interface ShapeProps {
  type: string;
  w: number;
  d: number;
  color: string;
  isSelected: boolean;
  selectionColor: string;
}

const TABLE_CORNERS: [number, number][] = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

/** Low-poly furniture built entirely from primitive Three.js geometry. */
export function FurnitureShape({ type, w, d, color, isSelected, selectionColor }: ShapeProps) {
  const width = Math.max(1, w);
  const depth = Math.max(1, d);
  const primary = isSelected ? mixColors(color, selectionColor, 0.14) : color;
  const dark = darken(primary, 0.16);
  const darker = darken(primary, 0.28);

  switch (type) {
    case 'sofa':
    case 'loveseat': {
      const seatHeight = 38;
      const backHeight = 32;
      const armWidth = Math.min(12, width / 5);
      const armHeight = 22;
      return (
        <group>
          <mesh position={[0, seatHeight / 2, 0]} castShadow>
            <boxGeometry args={[width, seatHeight, depth]} />
            <Surface color={primary} />
          </mesh>
          <mesh position={[0, seatHeight + backHeight / 2, -depth / 2 + 8]} castShadow>
            <boxGeometry args={[width, backHeight, 16]} />
            <Surface color={dark} />
          </mesh>
          <mesh position={[-width / 2 + armWidth / 2, seatHeight + armHeight / 2, 0]} castShadow>
            <boxGeometry args={[armWidth, armHeight, Math.max(1, depth - 16)]} />
            <Surface color={dark} />
          </mesh>
          <mesh position={[width / 2 - armWidth / 2, seatHeight + armHeight / 2, 0]} castShadow>
            <boxGeometry args={[armWidth, armHeight, Math.max(1, depth - 16)]} />
            <Surface color={dark} />
          </mesh>
          <mesh position={[-width / 6, seatHeight + 0.8, 4]} castShadow>
            <boxGeometry args={[1.5, 1, Math.max(1, depth - 20)]} />
            <Surface color={darker} />
          </mesh>
          <mesh position={[width / 6, seatHeight + 0.8, 4]} castShadow>
            <boxGeometry args={[1.5, 1, Math.max(1, depth - 20)]} />
            <Surface color={darker} />
          </mesh>
        </group>
      );
    }

    case 'armchair': {
      const seatHeight = 38;
      const backHeight = 35;
      const armWidth = Math.min(10, width / 5);
      return (
        <group>
          <mesh position={[0, seatHeight / 2, 0]} castShadow>
            <boxGeometry args={[width, seatHeight, depth]} />
            <Surface color={primary} />
          </mesh>
          <mesh position={[0, seatHeight + backHeight / 2, -depth / 2 + 8]} castShadow>
            <boxGeometry args={[width, backHeight, 16]} />
            <Surface color={dark} />
          </mesh>
          <mesh position={[-width / 2 + armWidth / 2, seatHeight + 15, 0]} castShadow>
            <boxGeometry args={[armWidth, 18, Math.max(1, depth - 16)]} />
            <Surface color={dark} />
          </mesh>
          <mesh position={[width / 2 - armWidth / 2, seatHeight + 15, 0]} castShadow>
            <boxGeometry args={[armWidth, 18, Math.max(1, depth - 16)]} />
            <Surface color={dark} />
          </mesh>
        </group>
      );
    }

    case 'bed-queen': {
      const frameHeight = 25;
      const mattressHeight = 18;
      const headboardHeight = 50;
      return (
        <group>
          <mesh position={[0, frameHeight / 2, 0]} castShadow>
            <boxGeometry args={[width, frameHeight, depth]} />
            <Surface color={dark} />
          </mesh>
          <mesh position={[0, frameHeight + mattressHeight / 2, 0]} castShadow>
            <boxGeometry args={[Math.max(1, width - 4), mattressHeight, Math.max(1, depth - 4)]} />
            <Surface color="#e8e4f0" />
          </mesh>
          <mesh position={[0, frameHeight + headboardHeight / 2, -depth / 2 + 5]} castShadow>
            <boxGeometry args={[width, headboardHeight, 10]} />
            <Surface color={dark} />
          </mesh>
          <mesh position={[-width / 4, frameHeight + mattressHeight + 5, -depth / 2 + 35]} castShadow>
            <boxGeometry args={[width / 3, 10, 30]} />
            <Surface color="#f0ece8" />
          </mesh>
          <mesh position={[width / 4, frameHeight + mattressHeight + 5, -depth / 2 + 35]} castShadow>
            <boxGeometry args={[width / 3, 10, 30]} />
            <Surface color="#f0ece8" />
          </mesh>
        </group>
      );
    }

    case 'dining-table':
    case 'coffee-table': {
      const topHeight = 5;
      const legHeight = type === 'coffee-table' ? 38 : 72;
      const legWidth = 5;
      const inset = 10;
      return (
        <group>
          <mesh position={[0, legHeight + topHeight / 2, 0]} castShadow>
            <boxGeometry args={[width, topHeight, depth]} />
            <Surface color={primary} />
          </mesh>
          {TABLE_CORNERS.map(([sx, sz], index) => (
            <mesh
              key={index}
              position={[sx * (width / 2 - inset), legHeight / 2, sz * (depth / 2 - inset)]}
              castShadow
            >
              <boxGeometry args={[legWidth, legHeight, legWidth]} />
              <Surface color={dark} />
            </mesh>
          ))}
        </group>
      );
    }

    case 'dining-chair': {
      const seatHeight = 45;
      const seatThickness = 4;
      const legWidth = 3;
      const backHeight = 35;
      const inset = 5;
      return (
        <group>
          <mesh position={[0, seatHeight, 0]} castShadow>
            <boxGeometry args={[width, seatThickness, depth]} />
            <Surface color={primary} />
          </mesh>
          {TABLE_CORNERS.map(([sx, sz], index) => (
            <mesh
              key={index}
              position={[sx * (width / 2 - inset), seatHeight / 2, sz * (depth / 2 - inset)]}
              castShadow
            >
              <boxGeometry args={[legWidth, seatHeight, legWidth]} />
              <Surface color={dark} />
            </mesh>
          ))}
          <mesh position={[0, seatHeight + backHeight / 2, -depth / 2 + 3]} castShadow>
            <boxGeometry args={[Math.max(1, width - 6), backHeight, 3]} />
            <Surface color={dark} />
          </mesh>
        </group>
      );
    }

    case 'desk': {
      const topHeight = 4;
      const legHeight = 72;
      const panelWidth = 3;
      return (
        <group>
          <mesh position={[0, legHeight + topHeight / 2, 0]} castShadow>
            <boxGeometry args={[width, topHeight, depth]} />
            <Surface color={primary} />
          </mesh>
          <mesh position={[-width / 2 + panelWidth / 2 + 2, legHeight / 2, 0]} castShadow>
            <boxGeometry args={[panelWidth, legHeight, Math.max(1, depth - 10)]} />
            <Surface color={dark} />
          </mesh>
          <mesh position={[width / 2 - panelWidth / 2 - 2, legHeight / 2, 0]} castShadow>
            <boxGeometry args={[panelWidth, legHeight, Math.max(1, depth - 10)]} />
            <Surface color={dark} />
          </mesh>
        </group>
      );
    }

    case 'tv-stand': {
      const cabinetHeight = 45;
      return (
        <group>
          <mesh position={[0, cabinetHeight / 2, 0]} castShadow>
            <boxGeometry args={[width, cabinetHeight, depth]} />
            <Surface color={primary} />
          </mesh>
          <mesh position={[0, cabinetHeight * 0.5, depth / 2 + 0.7]}>
            <boxGeometry args={[Math.max(1, width - 4), 1, 1]} />
            <Surface color={dark} />
          </mesh>
          <mesh position={[0, cabinetHeight + 30, -depth / 4]} castShadow>
            <boxGeometry args={[width * 0.8, 55, 3]} />
            <Surface color="#2d2d2d" />
          </mesh>
          <mesh position={[0, cabinetHeight + 30, -depth / 4 + 2]}>
            <boxGeometry args={[width * 0.68, 45, 1]} />
            <Surface color="#4b5660" />
          </mesh>
        </group>
      );
    }

    case 'bookshelf': {
      const height = 170;
      const postWidth = 7;
      const shelfThickness = 6;
      const shelfDepth = Math.max(1, depth - 3);
      return (
        <group>
          <mesh position={[0, height / 2, -depth / 2 + 2]} castShadow>
            <boxGeometry args={[width, height, 4]} />
            <Surface color={dark} />
          </mesh>
          <mesh position={[-width / 2 + postWidth / 2, height / 2, 0]} castShadow>
            <boxGeometry args={[postWidth, height, depth]} />
            <Surface color={primary} />
          </mesh>
          <mesh position={[width / 2 - postWidth / 2, height / 2, 0]} castShadow>
            <boxGeometry args={[postWidth, height, depth]} />
            <Surface color={primary} />
          </mesh>
          {[0, 0.2, 0.4, 0.6, 0.8, 1].map((fraction, index) => (
            <mesh key={index} position={[0, Math.max(3, height * fraction), 0]} castShadow>
              <boxGeometry args={[width - postWidth * 2, shelfThickness, shelfDepth]} />
              <Surface color={primary} />
            </mesh>
          ))}
          {[
            { x: -width * 0.22, y: 38, h: 25, color: '#c47868' },
            { x: width * 0.02, y: 72, h: 31, color: '#6898a8' },
            { x: width * 0.23, y: 109, h: 22, color: '#a8b878' },
          ].map((book, index) => (
            <mesh key={`book-${index}`} position={[book.x, book.y, depth / 5]} castShadow>
              <boxGeometry args={[Math.max(4, width / 7), book.h, Math.max(4, depth - 10)]} />
              <Surface color={book.color} />
            </mesh>
          ))}
        </group>
      );
    }

    case 'rug':
      return (
        <mesh position={[0, 0.6, 0]} receiveShadow>
          <boxGeometry args={[width, 1.2, depth]} />
          <Surface color={primary} />
        </mesh>
      );

    case 'plant': {
      const potHeight = 22;
      const potRadius = width / 3;
      return (
        <group>
          <mesh position={[0, potHeight / 2, 0]} castShadow>
            <cylinderGeometry args={[potRadius, potRadius * 0.8, potHeight, 8]} />
            <Surface color="#c49878" />
          </mesh>
          <mesh position={[0, potHeight, 0]}>
            <cylinderGeometry args={[Math.max(1, potRadius - 1), Math.max(1, potRadius - 1), 2, 8]} />
            <Surface color="#6b5840" />
          </mesh>
          <mesh position={[0, potHeight + 25, 0]} castShadow>
            <dodecahedronGeometry args={[20, 0]} />
            <Surface color={primary} />
          </mesh>
          <mesh position={[8, potHeight + 38, -5]} castShadow>
            <dodecahedronGeometry args={[12, 0]} />
            <Surface color={darken(primary, -0.1)} />
          </mesh>
        </group>
      );
    }

    default:
      return (
        <mesh position={[0, 20, 0]} castShadow>
          <boxGeometry args={[width, 40, depth]} />
          <Surface color={primary} />
        </mesh>
      );
  }
}

function Surface({ color }: { color: string }) {
  return <meshStandardMaterial color={color} flatShading />;
}

function darken(hex: string, amount: number): string {
  const color = new THREE.Color(hex);
  if (amount > 0) color.lerp(new THREE.Color('#000000'), amount);
  if (amount < 0) color.lerp(new THREE.Color('#ffffff'), -amount);
  return `#${color.getHexString()}`;
}

function mixColors(first: string, second: string, amount: number): string {
  const color = new THREE.Color(first);
  color.lerp(new THREE.Color(second), amount);
  return `#${color.getHexString()}`;
}
