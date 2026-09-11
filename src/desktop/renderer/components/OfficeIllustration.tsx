// Decorative SVG furniture/atmosphere for the office floor. Pure presentation —
// no text is baked into any shape, nothing here carries data or blocks pointer
// events, so labels/buttons drawn on top by OfficeFloor.tsx stay fully usable.
import type { RoomKind } from "../../officeLayout";

interface Rect { x: number; y: number; width: number; height: number }
interface Point { x: number; y: number }

export function PlantDecor({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x}, ${y}) scale(${scale})`}>
      <ellipse cx="0" cy="32" rx="20" ry="5" fill="var(--floor-a)" opacity="0.5" />
      <rect x="-13" y="10" width="26" height="20" rx="4" fill="var(--wood-dark)" />
      <path d="M0 12 C -17 -4 -13 -28 0 -32 C 13 -28 17 -4 0 12 Z" fill="var(--sage)" />
      <path d="M0 8 C -9 -6 -7 -22 0 -26 C 7 -22 9 -6 0 8 Z" fill="var(--sage-dark)" opacity="0.75" />
    </g>
  );
}

// A desk sits behind an agent's home cell — furniture only, never overlapping
// the character button's clickable area, which is drawn later in normal DOM flow.
export function DeskFurniture({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x + 18}, ${y + 2})`} aria-hidden="true">
      <ellipse cx="30" cy="88" rx="40" ry="7" fill="var(--floor-a)" opacity="0.45" />
      <rect x="0" y="48" width="60" height="9" rx="2" fill="var(--wood-dark)" />
      <rect x="0" y="32" width="60" height="18" rx="3" fill="var(--wood)" />
      <rect x="4" y="57" width="6" height="22" fill="var(--wood-dark)" />
      <rect x="50" y="57" width="6" height="22" fill="var(--wood-dark)" />
      <rect x="15" y="4" width="30" height="21" rx="2" fill="#2B2A28" stroke="var(--rule)" strokeWidth="1" />
      <rect x="28" y="25" width="4" height="7" fill="var(--wood-dark)" />
      <rect x="10" y="26" width="14" height="4" rx="1" fill="var(--ivory)" opacity="0.5" />
      <circle cx="30" cy="80" r="10" fill="var(--sage)" opacity="0.8" />
    </g>
  );
}

export function DeskFurnitureLayer({ homes, width, height }: { homes: Point[]; width: number; height: number }) {
  if (homes.length === 0) return null;
  return (
    <svg
      className="osFurnitureLayer"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      focusable="false"
    >
      {homes.map((h, i) => <DeskFurniture key={i} x={h.x} y={h.y} />)}
    </svg>
  );
}

// Floor texture, corridor lighting and the door gaps that connect the corridor
// to each room — the "walls" of the office, drawn once behind everything else.
export function OfficeAtmosphere({
  deskZone,
  corridor,
  roomEntrances,
}: {
  deskZone: Rect;
  corridor: Rect;
  roomEntrances: { x: number; width: number }[];
}) {
  const height = corridor.y + corridor.height;
  const width = Math.max(deskZone.x + deskZone.width, corridor.x + corridor.width);
  const lightCount = Math.max(2, Math.round(corridor.width / 220));
  return (
    <svg
      className="osAtmosphere"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern id="of-wood-floor" width="36" height="36" patternUnits="userSpaceOnUse">
          <rect width="36" height="36" fill="var(--floor-a)" />
          <rect width="36" height="15" fill="var(--floor-b)" opacity="0.5" />
        </pattern>
        <pattern id="of-corridor-tile" width="26" height="26" patternUnits="userSpaceOnUse">
          <rect width="26" height="26" fill="var(--floor-b)" />
          <rect width="25" height="25" x="0.5" y="0.5" fill="none" stroke="var(--rule)" strokeWidth="0.6" opacity="0.35" />
        </pattern>
      </defs>
      <rect x={deskZone.x} y={deskZone.y} width={deskZone.width} height={deskZone.height} rx="10" fill="url(#of-wood-floor)" />
      <rect x={corridor.x} y={corridor.y} width={corridor.width} height={corridor.height} fill="url(#of-corridor-tile)" />
      <rect x={corridor.x} y={corridor.y} width={corridor.width} height="2" fill="var(--wood-dark)" opacity="0.5" />
      <rect x={corridor.x} y={corridor.y + corridor.height - 2} width={corridor.width} height="2" fill="var(--wood-dark)" opacity="0.5" />
      {Array.from({ length: lightCount }).map((_, i) => {
        const cx = corridor.x + ((i + 0.5) / lightCount) * corridor.width;
        return (
          <g key={i} transform={`translate(${cx}, ${corridor.y + 10})`}>
            <rect x="-24" y="0" width="48" height="6" rx="3" fill="var(--ivory)" opacity="0.85" />
            <ellipse cx="0" cy="34" rx="50" ry="16" fill="var(--ivory)" opacity="0.05" />
          </g>
        );
      })}
      {roomEntrances.map((r, i) => (
        <g key={i}>
          <rect x={r.x - 5} y={corridor.y + corridor.height - 6} width="5" height="20" fill="var(--wood-dark)" />
          <rect x={r.x + r.width} y={corridor.y + corridor.height - 6} width="5" height="20" fill="var(--wood-dark)" />
        </g>
      ))}
      <PlantDecor x={deskZone.x + 26} y={deskZone.y + deskZone.height - 14} />
      <PlantDecor x={deskZone.x + deskZone.width - 26} y={deskZone.y + 30} scale={0.85} />
    </svg>
  );
}

const ROOM_RUG_VAR: Record<RoomKind, string> = { meeting: "var(--wood-light)", debate: "var(--wood-dark)", planning: "var(--sage)" };

export function RoomFloor({ width, height, kind }: { width: number; height: number; kind: RoomKind }) {
  return <rect x="6" y="6" width={width - 12} height={height - 12} rx="8" fill={ROOM_RUG_VAR[kind]} opacity="0.14" />;
}

export function Whiteboard({ x, y, width }: { x: number; y: number; width: number }) {
  const h = 30;
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect x="0" y="0" width={width} height={h} rx="4" fill="var(--ivory)" stroke="var(--rule)" strokeWidth="1.25" />
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={width * f} y1="4" x2={width * f} y2={h - 4} stroke="var(--rule)" strokeWidth="0.75" opacity="0.3" />
      ))}
      <rect x={width * 0.1} y={h * 0.28} width="12" height="10" rx="2" fill="var(--sage)" opacity="0.55" />
      <rect x={width * 0.28} y={h * 0.4} width="12" height="10" rx="2" fill="var(--wood)" opacity="0.5" />
    </g>
  );
}

// The head chair reads a boardroom table as distinct from a plain meeting table.
export function HeadChair({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect x="-13" y="-9" width="26" height="18" rx="4" fill="var(--wood-dark)" />
      <circle cx="0" cy="0" r="11" fill="var(--sage-dark)" />
    </g>
  );
}
