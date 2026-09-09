import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createDashboardWindowManager } from './projectDashboardWindow.js';

class FakeWindow extends EventEmitter {
  webContents = Object.assign(new EventEmitter(), {
    setWindowOpenHandler: (handler: () => { action: string }) => { this.popup = handler; },
  });
  popup!: () => { action: string };
  urls: string[] = [];
  shown = 0;
  focused = 0;
  destroyed = false;
  load: () => Promise<void> = async () => {};
  loadURL(url: string) { this.urls.push(url); return this.load(); }
  show() { this.shown++; }
  focus() { this.focused++; }
  isDestroyed() { return this.destroyed; }
  close() { this.destroyed = true; this.emit('closed'); }
}
const dashboard = { label: 'Project', url: 'http://localhost:3000/dashboard' };

test('secure hidden window becomes visible only after successful load', async () => {
  const window = new FakeWindow();
  let finish!: () => void;
  window.load = () => new Promise(resolve => { finish = resolve; });
  const manager = createDashboardWindowManager(options => {
    assert.equal(options.width, 1280);
    assert.equal(options.height, 900);
    assert.equal(options.minWidth, 900);
    assert.equal(options.minHeight, 600);
    assert.equal(options.show, false);
    assert.equal(options.title, 'Project');
    assert.deepEqual(options.webPreferences, {
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    });
    return window;
  });
  const pending = manager.open('a', dashboard);
  await Promise.resolve();
  assert.equal(window.shown, 0);
  finish();
  await pending;
  assert.equal(window.shown, 1);
  assert.equal(window.focused, 1);
});

test('reuses per project, reloads changed URLs, and removes closed windows', async () => {
  const windows: FakeWindow[] = [];
  const manager = createDashboardWindowManager(() => {
    const window = new FakeWindow(); windows.push(window); return window;
  });
  await Promise.all([manager.open('a', dashboard), manager.open('a', dashboard)]);
  assert.equal(windows.length, 1);
  assert.equal(windows[0].urls.length, 1);
  assert.equal(windows[0].focused, 2);
  await manager.open('a', { ...dashboard, url: 'http://localhost:4000/' });
  assert.equal(windows[0].urls.length, 2);
  await manager.open('b', dashboard);
  assert.equal(windows.length, 2);
  windows[0].close();
  await manager.open('a', dashboard);
  assert.equal(windows.length, 3);
});

test('failed loads close and remove the window and provide recovery advice', async () => {
  const windows: FakeWindow[] = [];
  const manager = createDashboardWindowManager(() => {
    const window = new FakeWindow();
    window.load = async () => { throw new Error('connection refused'); };
    windows.push(window); return window;
  });
  await assert.rejects(manager.open('a', dashboard), /Start the project service.*localhost:3000/);
  assert.equal(windows[0].destroyed, true);
  assert.equal(windows[0].shown, 0);
  await assert.rejects(manager.open('a', dashboard));
  assert.equal(windows.length, 2);
});

test('blocks cross-origin navigation and redirects, denies all popups', async () => {
  const window = new FakeWindow();
  const manager = createDashboardWindowManager(() => window);
  await manager.open('a', dashboard);
  for (const event of ['will-navigate', 'will-redirect']) {
    for (const [url, blocked] of [
      ['http://localhost:3000/other', false], ['https://example.com', true],
      ['http://localhost:3001', true], ['javascript:alert(1)', true], ['invalid', true],
    ] as const) {
      let prevented = false;
      window.webContents.emit(event, { preventDefault() { prevented = true; } }, url);
      assert.equal(prevented, blocked);
    }
  }
  assert.deepEqual(window.popup(), { action: 'deny' });
});
