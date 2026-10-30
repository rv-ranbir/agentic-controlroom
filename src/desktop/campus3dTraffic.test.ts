import {test} from 'node:test';
import assert from 'node:assert/strict';
import {campusTrafficClear} from './campus3dTraffic.js';
test('stops before another agent and prevents tunnelling across them',()=>{
 assert.equal(campusTrafficClear({x:0,z:0},{x:.5,z:0},[{x:1,z:0}]),false);
 assert.equal(campusTrafficClear({x:0,z:0},{x:2,z:0},[{x:1,z:0}]),false);
});
test('permits clear passing and retreat from an existing overlap',()=>{
 assert.equal(campusTrafficClear({x:0,z:0},{x:2,z:0},[{x:1,z:1}]),true);
 assert.equal(campusTrafficClear({x:0,z:0},{x:-.1,z:0},[{x:.4,z:0}]),true);
 assert.equal(campusTrafficClear({x:0,z:0},{x:.1,z:0},[{x:.4,z:0}]),false);
});
