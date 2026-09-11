import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRooms, createOfficeLayoutState, agentRoomMap } from './officeLayout.js';
import type { OfficeSession } from './officePresence.js';

const roster = new Set(['a1', 'a2', 'a3', 'a4']);

test('one room per active session, one empty placeholder per unused kind', () => {
  const state = createOfficeLayoutState();
  const sessions: OfficeSession[] = [{ id: 's1', projectId: 'p1', kind: 'meeting', agentIds: ['a1', 'a2'] }];
  const rooms = buildRooms(sessions, roster, state);
  const meetingRooms = rooms.filter((r) => r.kind === 'meeting');
  const debateRooms = rooms.filter((r) => r.kind === 'debate');
  const planningRooms = rooms.filter((r) => r.kind === 'planning');
  assert.equal(meetingRooms.length, 1);
  assert.equal(meetingRooms[0].sessionId, 's1');
  assert.equal(debateRooms.length, 1);
  assert.equal(debateRooms[0].sessionId, null);
  assert.equal(planningRooms.length, 1);
  assert.equal(planningRooms[0].sessionId, null);
});

test('concurrent same-kind sessions get separate rooms with distinct slots', () => {
  const state = createOfficeLayoutState();
  const sessions: OfficeSession[] = [
    { id: 's1', projectId: 'p1', kind: 'meeting', agentIds: ['a1'] },
    { id: 's2', projectId: 'p1', kind: 'meeting', agentIds: ['a2'] },
  ];
  const rooms = buildRooms(sessions, roster, state);
  const meetingRooms = rooms.filter((r) => r.kind === 'meeting');
  assert.equal(meetingRooms.length, 2);
  assert.deepEqual(meetingRooms.map((r) => r.slot).sort(), [0, 1]);
  assert.deepEqual(meetingRooms.map((r) => r.sessionId).sort(), ['s1', 's2']);
});

test('ending one session leaves the other assigned to its original slot', () => {
  const state = createOfficeLayoutState();
  const first: OfficeSession[] = [
    { id: 's1', projectId: 'p1', kind: 'meeting', agentIds: ['a1'] },
    { id: 's2', projectId: 'p1', kind: 'meeting', agentIds: ['a2'] },
  ];
  const roomsBefore = buildRooms(first, roster, state);
  const s2Slot = roomsBefore.find((r) => r.sessionId === 's2')!.slot;

  // s1 ends; only s2 remains active.
  const second: OfficeSession[] = [{ id: 's2', projectId: 'p1', kind: 'meeting', agentIds: ['a2'] }];
  const roomsAfter = buildRooms(second, roster, state);
  const meetingRooms = roomsAfter.filter((r) => r.kind === 'meeting');
  assert.equal(meetingRooms.length, 1);
  assert.equal(meetingRooms[0].sessionId, 's2');
  assert.equal(meetingRooms[0].slot, s2Slot);
});

test('a new session after another ends does not reuse the freed slot', () => {
  const state = createOfficeLayoutState();
  buildRooms([{ id: 's1', projectId: 'p1', kind: 'debate', agentIds: ['a1'] }], roster, state);
  // s1 ends, s3 starts.
  const rooms = buildRooms([{ id: 's3', projectId: 'p1', kind: 'debate', agentIds: ['a2'] }], roster, state);
  const debateRoom = rooms.find((r) => r.kind === 'debate')!;
  assert.equal(debateRoom.sessionId, 's3');
  assert.equal(debateRoom.slot, 1);
});

test('agent ids outside the roster are ignored', () => {
  const state = createOfficeLayoutState();
  const rooms = buildRooms([{ id: 's1', projectId: 'p1', kind: 'planning', agentIds: ['a1', 'ghost'] }], roster, state);
  const planningRoom = rooms.find((r) => r.kind === 'planning')!;
  assert.deepEqual(planningRoom.agentIds, ['a1']);
});

test('an agent in two concurrent sessions is placed in exactly one, deterministically', () => {
  const state = createOfficeLayoutState();
  const sessions: OfficeSession[] = [
    { id: 's2', projectId: 'p1', kind: 'meeting', agentIds: ['a1'] },
    { id: 's1', projectId: 'p1', kind: 'meeting', agentIds: ['a1'] },
  ];
  const rooms = buildRooms(sessions, roster, state);
  const withAgent = rooms.filter((r) => r.agentIds.includes('a1'));
  assert.equal(withAgent.length, 1);
  assert.equal(withAgent[0].sessionId, 's1'); // lower session id wins
});

test('agentRoomMap maps each placed agent to its room, home agents absent', () => {
  const state = createOfficeLayoutState();
  const rooms = buildRooms([{ id: 's1', projectId: 'p1', kind: 'meeting', agentIds: ['a1', 'a2'] }], roster, state);
  const map = agentRoomMap(rooms);
  assert.equal(map.get('a1')?.sessionId, 's1');
  assert.equal(map.get('a2')?.sessionId, 's1');
  assert.equal(map.get('a3'), undefined);
});


test('physical columns remain stable across endings and new room kinds', () => {
  const state = createOfficeLayoutState();
  const a: OfficeSession = { id: 'a', projectId: 'p', kind: 'meeting', agentIds: ['a1'] };
  const b: OfficeSession = { id: 'b', projectId: 'p', kind: 'meeting', agentIds: ['a2'] };
  const before = buildRooms([a,b], roster, state).find(r=>r.sessionId==='b')!.position;
  const after = buildRooms([b,{id:'c',projectId:'p',kind:'planning',agentIds:['a3']}],roster,state);
  assert.equal(after.find(r=>r.sessionId==='b')!.position,before);
  assert.equal(new Set(after.map(r=>r.position)).size,after.length);
});

test('repeated sessions reuse physical space and remove ended session state', () => {
  const state = createOfficeLayoutState();
  for(let i=0;i<100;i++) {
    const rooms=buildRooms([{id:String(i),projectId:'p',kind:'meeting',agentIds:['a1']}],roster,state);
    assert.equal(rooms.find(r=>r.sessionId!==null)!.position,0);
    assert.equal(state.positionBySession.size,1);
    assert.equal(state.slotBySession.size,1);
  }
  buildRooms([],roster,state);
  assert.equal(state.positionBySession.size,0);
});

test('duplicate participant IDs produce a single seat assignment', () => {
  const rooms=buildRooms([{id:'s',projectId:'p',kind:'planning',agentIds:['a1','a1','ghost']}],roster,createOfficeLayoutState());
  assert.deepEqual(rooms.find(r=>r.sessionId==='s')!.agentIds,['a1']);
});
