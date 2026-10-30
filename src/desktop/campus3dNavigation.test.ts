import {test} from 'node:test';
import assert from 'node:assert/strict';
import {campusRoute, campusSegmentClear, type Obstacle, type Point} from './campus3dNavigation.js';

const wall: Obstacle = {minX: -1, maxX: 1, minZ: -4, maxZ: 4};
const segmentsClear = (path: Point[], obstacles: Obstacle[]) => {
  for (let i = 1; i < path.length; i++) assert.ok(campusSegmentClear(path[i - 1], path[i], obstacles));
};

test('routes around a footprint and preserves exact endpoints', () => {
  const from = {x: -5.123, z: 0.17};
  const to = {x: 5.234, z: 0.31};
  const route = campusRoute(from, to, [wall]);
  assert.ok(route);
  assert.deepEqual(route[0], from);
  assert.deepEqual(route.at(-1), to);
  assert.ok(route.length > 2);
  segmentsClear(route, [wall]);
});

test('rejects endpoints inside expanded obstacles and returns the clear identical point', () => {
  assert.equal(campusRoute({x: 0, z: 0}, {x: 5, z: 0}, [wall]), null);
  assert.equal(campusRoute({x: 5, z: 0}, {x: 0, z: 0}, [wall]), null);
  const point = {x: 2.123, z: 3.456};
  assert.deepEqual(campusRoute(point, point, []), [point]);
});

test('rejects non-finite and out-of-bounds endpoints', () => {
  assert.equal(campusRoute({x: Number.NaN, z: 0}, {x: 0, z: 0}, []), null);
  assert.equal(campusRoute({x: 0, z: 0}, {x: 15.01, z: 0}, []), null);
  assert.equal(campusRoute({x: 0, z: -11.01}, {x: 0, z: 0}, []), null);
});

test('segment collision treats touching an expanded rectangle boundary as blocked', () => {
  assert.equal(campusSegmentClear({x: -2, z: 0}, {x: 2, z: 0}, [wall]), false);
  assert.equal(campusSegmentClear({x: -2, z: 4.25}, {x: 2, z: 4.25}, [wall]), false);
  assert.equal(campusSegmentClear({x: -2, z: 4.251}, {x: 2, z: 4.251}, [wall]), true);
});

test('a full-height closed wall makes the opposite side unreachable', () => {
  const closed: Obstacle = {minX: -0.2, maxX: 0.2, minZ: -11, maxZ: 11};
  assert.equal(campusRoute({x: -10, z: 0}, {x: 10, z: 0}, [closed]), null);
});

test('routes are reversible and safely retarget from an exact mid-walk position', () => {
  const start = {x: -5.123, z: 0.17};
  const target = {x: 5.234, z: 0.31};
  const forward = campusRoute(start, target, [wall]);
  const reverse = campusRoute(target, start, [wall]);
  assert.ok(forward && reverse);
  assert.deepEqual(campusRoute(target, start, [wall]), reverse);
  segmentsClear(forward, [wall]);
  segmentsClear(reverse, [wall]);
  const midwalk = {x: (forward[0].x + forward[1].x) / 2, z: (forward[0].z + forward[1].z) / 2};
  const retargeted = campusRoute(midwalk, start, [wall]);
  assert.ok(retargeted);
  assert.deepEqual(retargeted[0], midwalk);
  assert.deepEqual(retargeted.at(-1), start);
  segmentsClear(retargeted, [wall]);
});

test('four-neighbor search cannot cut a blocked grid corner', () => {
  const corner: Obstacle = {minX: 0, maxX: 0.01, minZ: 0, maxZ: 0.01};
  const route = campusRoute({x: -1, z: -1}, {x: 1, z: 1}, [corner]);
  assert.ok(route);
  segmentsClear(route, [corner]);
});
