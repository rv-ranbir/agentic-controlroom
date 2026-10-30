export type Point = {x: number; z: number};
export type Obstacle = {minX: number; maxX: number; minZ: number; maxZ: number};

const MIN_X = -15;
const MAX_X = 15;
const MIN_Z = -11;
const MAX_Z = 11;
const STEP = 0.25;
const CLEARANCE = 0.25;
const COLUMNS = Math.round((MAX_X - MIN_X) / STEP) + 1;
const ROWS = Math.round((MAX_Z - MIN_Z) / STEP) + 1;
const DIRECTIONS = [[0, -1], [-1, 0], [1, 0], [0, 1]] as const;

function validPoint(point: Point): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.z) &&
    point.x >= MIN_X && point.x <= MAX_X && point.z >= MIN_Z && point.z <= MAX_Z;
}

function validObstacles(obstacles: Obstacle[]): boolean {
  return obstacles.every(o => Number.isFinite(o.minX) && Number.isFinite(o.maxX) &&
    Number.isFinite(o.minZ) && Number.isFinite(o.maxZ) &&
    o.minX <= o.maxX && o.minZ <= o.maxZ);
}

/** True when the closed segment stays outside every footprint expanded by clearance. */
export function campusSegmentClear(a: Point, b: Point, obstacles: Obstacle[]): boolean {
  if (!validPoint(a) || !validPoint(b) || !validObstacles(obstacles)) return false;
  for (const obstacle of obstacles) {
    const minX = obstacle.minX - CLEARANCE;
    const maxX = obstacle.maxX + CLEARANCE;
    const minZ = obstacle.minZ - CLEARANCE;
    const maxZ = obstacle.maxZ + CLEARANCE;
    let enter = 0;
    let leave = 1;
    for (const [origin, delta, min, max] of [
      [a.x, b.x - a.x, minX, maxX],
      [a.z, b.z - a.z, minZ, maxZ],
    ]) {
      if (delta === 0) {
        if (origin < min || origin > max) { enter = 1; leave = 0; break; }
        continue;
      }
      let near = (min - origin) / delta;
      let far = (max - origin) / delta;
      if (near > far) [near, far] = [far, near];
      enter = Math.max(enter, near);
      leave = Math.min(leave, far);
      if (enter > leave) break;
    }
    if (enter <= leave && leave >= 0 && enter <= 1) return false;
  }
  return true;
}

function gridPoint(id: number): Point {
  return {x: MIN_X + (id % COLUMNS) * STEP, z: MIN_Z + Math.floor(id / COLUMNS) * STEP};
}

function nearbyVisiblePoints(point: Point, obstacles: Obstacle[]): number[] {
  const centerX = Math.round((point.x - MIN_X) / STEP);
  const centerZ = Math.round((point.z - MIN_Z) / STEP);
  const visible: number[] = [];
  for (let z = Math.max(0, centerZ - 1); z <= Math.min(ROWS - 1, centerZ + 1); z++) {
    for (let x = Math.max(0, centerX - 1); x <= Math.min(COLUMNS - 1, centerX + 1); x++) {
      const id = z * COLUMNS + x;
      if (campusSegmentClear(point, gridPoint(id), obstacles)) visible.push(id);
    }
  }
  return visible;
}

/** Deterministic four-neighbor grid route with exact, unquantized endpoints. */
export function campusRoute(from: Point, to: Point, obstacles: Obstacle[]): Point[] | null {
  if (!campusSegmentClear(from, from, obstacles) || !campusSegmentClear(to, to, obstacles)) return null;
  if (from.x === to.x && from.z === to.z) return [{x: from.x, z: from.z}];

  const starts = nearbyVisiblePoints(from, obstacles);
  const ends = new Uint8Array(COLUMNS * ROWS);
  for (const id of nearbyVisiblePoints(to, obstacles)) ends[id] = 1;
  if (!starts.length || !ends.some(Boolean)) return null;

  const parent = new Int32Array(COLUMNS * ROWS).fill(-2);
  const queue = new Int32Array(COLUMNS * ROWS);
  let head = 0;
  let tail = 0;
  for (const id of starts) {
    if (parent[id] !== -2) continue;
    parent[id] = -1;
    queue[tail++] = id;
  }

  let found = -1;
  while (head < tail) {
    const id = queue[head++];
    if (ends[id]) { found = id; break; }
    const x = id % COLUMNS;
    const z = Math.floor(id / COLUMNS);
    const point = gridPoint(id);
    for (const [dx, dz] of DIRECTIONS) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nx >= COLUMNS || nz < 0 || nz >= ROWS) continue;
      const next = nz * COLUMNS + nx;
      if (parent[next] !== -2 || !campusSegmentClear(point, gridPoint(next), obstacles)) continue;
      parent[next] = id;
      queue[tail++] = next;
    }
  }
  if (found < 0) return null;

  const path: Point[] = [{x: to.x, z: to.z}];
  for (let id = found; id >= 0; id = parent[id]) path.push(gridPoint(id));
  path.push({x: from.x, z: from.z});
  path.reverse();

  const smooth: Point[] = [path[0]];
  let current = 0;
  while (current < path.length - 1) {
    let next = path.length - 1;
    while (next > current + 1 && !campusSegmentClear(path[current], path[next], obstacles)) next--;
    smooth.push(path[next]);
    current = next;
  }
  return smooth;
}
