interface GridDotsProps {
  width: number;
  height: number;
  spacing: number;
}

export function GridDots({ width, height, spacing }: GridDotsProps) {
  const dots: { x: number; y: number }[] = [];
  for (let x = 0; x <= width; x += spacing) {
    for (let y = 0; y <= height; y += spacing) {
      dots.push({ x, y });
    }
  }

  return (
    <g aria-hidden="true">
      {dots.map((dot) => (
        <circle key={`${dot.x}-${dot.y}`} cx={dot.x} cy={dot.y} r={1.5} fill="#ded8cf" />
      ))}
    </g>
  );
}
