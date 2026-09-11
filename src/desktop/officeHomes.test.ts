import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileHomes } from './officeHomes.js';

// Mock localStorage
const mockStorage: Record<string, string> = {};
const originalLocalStorage = global.localStorage;

function setupStorage() {
  global.localStorage = {
    getItem: (key: string) => mockStorage[key] ?? null,
    setItem: (key: string, value: string) => {
      mockStorage[key] = value;
    },
    removeItem: (key: string) => {
      delete mockStorage[key];
    },
    clear: () => {
      for (const key in mockStorage) delete mockStorage[key];
    },
    key: (index: number) => {
      const keys = Object.keys(mockStorage);
      return keys[index] ?? null;
    },
    length: Object.keys(mockStorage).length,
  } as any;
}

function cleanup() {
  global.localStorage = originalLocalStorage;
  Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
}

test('assigns slots to new agents in order', () => {
  setupStorage();
  try {
    const slots = reconcileHomes("proj1", ["a", "b", "c"]);
    assert.equal(slots.get("a"), 0);
    assert.equal(slots.get("b"), 1);
    assert.equal(slots.get("c"), 2);
  } finally {
    cleanup();
  }
});

test('retains saved slots for existing agents', () => {
  setupStorage();
  try {
    reconcileHomes("proj1", ["a", "b"]);
    const slots2 = reconcileHomes("proj1", ["a", "b", "c"]);
    assert.equal(slots2.get("a"), 0);
    assert.equal(slots2.get("b"), 1);
    assert.equal(slots2.get("c"), 2);
  } finally {
    cleanup();
  }
});

test('drops slots for removed agents', () => {
  setupStorage();
  try {
    reconcileHomes("proj1", ["a", "b", "c"]);
    const slots2 = reconcileHomes("proj1", ["a", "c"]);
    assert.equal(slots2.get("a"), 0);
    assert.equal(slots2.get("c"), 2);
    assert.equal(slots2.get("b"), undefined);
  } finally {
    cleanup();
  }
});

test('handles agent reorder by retaining saved slots', () => {
  setupStorage();
  try {
    reconcileHomes("proj1", ["a", "b", "c"]);
    const slots2 = reconcileHomes("proj1", ["c", "a", "b"]);
    assert.equal(slots2.get("a"), 0);
    assert.equal(slots2.get("b"), 1);
    assert.equal(slots2.get("c"), 2);
  } finally {
    cleanup();
  }
});

test('assigns lowest free slot to new agents', () => {
  setupStorage();
  try {
    reconcileHomes("proj1", ["a", "b"]);
    reconcileHomes("proj1", ["b"]);
    const slots3 = reconcileHomes("proj1", ["b", "c"]);
    assert.equal(slots3.get("b"), 1);
    assert.equal(slots3.get("c"), 0);
  } finally {
    cleanup();
  }
});

test('separates slot data by project', () => {
  setupStorage();
  try {
    const slots1 = reconcileHomes("proj1", ["a", "b"]);
    const slots2 = reconcileHomes("proj2", ["a", "b"]);
    assert.equal(slots1.get("a"), 0);
    assert.equal(slots2.get("a"), 0);
    reconcileHomes("proj1", ["a", "x"]);
    const slots1b = reconcileHomes("proj1", ["a", "x", "b"]);
    const slots2b = reconcileHomes("proj2", ["a", "b"]);
    assert.equal(slots1b.get("a"), 0);
    assert.equal(slots1b.get("x"), 1);
    assert.equal(slots1b.get("b"), 2);
    assert.equal(slots2b.get("a"), 0);
    assert.equal(slots2b.get("b"), 1);
  } finally {
    cleanup();
  }
});

test('rejects invalid slots during reconcile', () => {
  setupStorage();
  try {
    mockStorage["office-homes:v1:proj3"] = JSON.stringify({ a: -1, b: 10001, c: 1.5, d: "not a number" });
    const slots = reconcileHomes("proj3", ["a", "b", "c", "d", "e"]);
    assert.equal(slots.get("a"), 0);
    assert.equal(slots.get("b"), 1);
    assert.equal(slots.get("c"), 2);
    assert.equal(slots.get("d"), 3);
    assert.equal(slots.get("e"), 4);
  } finally {
    cleanup();
  }
});

test('handles empty roster safely', () => {
  setupStorage();
  try {
    const slots = reconcileHomes("proj4", []);
    assert.equal(slots.size, 0);
  } finally {
    cleanup();
  }
});

test('handles malformed JSON in storage', () => {
  setupStorage();
  try {
    mockStorage["office-homes:v1:proj5"] = "{ invalid json";
    const slots = reconcileHomes("proj5", ["a", "b"]);
    assert.equal(slots.get("a"), 0);
    assert.equal(slots.get("b"), 1);
  } finally {
    cleanup();
  }
});

test('handles non-object storage values', () => {
  setupStorage();
  try {
    mockStorage["office-homes:v1:proj6"] = '["array", "not", "object"]';
    const slots = reconcileHomes("proj6", ["a", "b"]);
    assert.equal(slots.get("a"), 0);
    assert.equal(slots.get("b"), 1);
  } finally {
    cleanup();
  }
});

test('ignores dangerous object keys during parse', () => {
  setupStorage();
  try {
    mockStorage["office-homes:v1:proj7"] = JSON.stringify({
      __proto__: 99,
      constructor: 88,
      a: 0,
    });
    const slots = reconcileHomes("proj7", ["a", "b"]);
    assert.equal(slots.get("a"), 0);
    assert.equal(slots.get("b"), 1);
  } finally {
    cleanup();
  }
});

test('caps slot values at SLOT_MAX', () => {
  setupStorage();
  try {
    mockStorage["office-homes:v1:proj8"] = JSON.stringify({ a: 9999, b: 10000, c: 10001 });
    const slots = reconcileHomes("proj8", ["a", "b", "c"]);
    assert.equal(slots.get("a"), 9999);
    assert.equal(slots.get("b"), 0);
    assert.equal(slots.get("c"), 1);
  } finally {
    cleanup();
  }
});

test('handles very large rosters', () => {
  setupStorage();
  try {
    const ids = Array.from({ length: 100 }, (_, i) => `agent-${i}`);
    const slots = reconcileHomes("proj9", ids);
    assert.equal(slots.size, 100);
    for (let i = 0; i < 100; i++) {
      assert.equal(slots.get(`agent-${i}`), i);
    }
  } finally {
    cleanup();
  }
});

test('persists slot assignments across reconciles', () => {
  setupStorage();
  try {
    reconcileHomes("proj10", ["a", "b", "c"]);
    const slots2 = reconcileHomes("proj10", ["a", "b", "c"]);
    assert.equal(slots2.get("a"), 0);
    assert.equal(slots2.get("b"), 1);
    assert.equal(slots2.get("c"), 2);
  } finally {
    cleanup();
  }
});

test('respects slot bounds when finding lowest free', () => {
  setupStorage();
  try {
    mockStorage["office-homes:v1:proj11"] = JSON.stringify({ a: 0, c: 2 });
    const slots = reconcileHomes("proj11", ["a", "b", "c"]);
    assert.equal(slots.get("a"), 0);
    assert.equal(slots.get("c"), 2);
    assert.equal(slots.get("b"), 1);
  } finally {
    cleanup();
  }
});

test('silently ignores storage write errors', () => {
  setupStorage();
  try {
    let writeCount = 0;
    const originalSetItem = global.localStorage.setItem;
    global.localStorage.setItem = (() => {
      writeCount++;
      throw new Error("Storage full");
    }) as any;
    const slots = reconcileHomes("proj12", ["a", "b"]);
    assert.equal(slots.get("a"), 0);
    assert.equal(slots.get("b"), 1);
    assert.ok(writeCount > 0);
    global.localStorage.setItem = originalSetItem;
  } finally {
    cleanup();
  }
});

test('handles integer coercion edge cases', () => {
  setupStorage();
  try {
    mockStorage["office-homes:v1:proj13"] = JSON.stringify({ a: 1.9, b: 2.1, c: 0 });
    const slots = reconcileHomes("proj13", ["a", "b", "c"]);
    assert.equal(slots.get("c"), 0);
    assert.equal(slots.get("a"), 1);
    assert.equal(slots.get("b"), 2);
  } finally {
    cleanup();
  }
});


test('duplicate saved slots and reserved IDs remain unique and persistent', () => {
 setupStorage();try {
 mockStorage['office-homes:v1:repair']='{"a":0,"b":0,"__proto__":4,"constructor":5}';
 const ids=['a','b','__proto__','constructor'];
 const slots=reconcileHomes('repair',ids);
 assert.equal(new Set(slots.values()).size,4);
 assert.equal(slots.get('__proto__'),4);
 assert.equal(slots.get('constructor'),5);
 const restored=reconcileHomes('repair',ids);for(const id of ids)assert.equal(restored.get(id),slots.get(id));
 }finally{cleanup();}
});
