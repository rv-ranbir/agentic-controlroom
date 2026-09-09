import type { BrowserWindow, BrowserWindowConstructorOptions } from 'electron';

type DashboardWindow = Pick<BrowserWindow,
  'loadURL' | 'show' | 'focus' | 'close' | 'isDestroyed'> & {
  on(event: 'closed', listener: () => void): unknown;
  webContents: {
    on(event: 'will-navigate' | 'will-redirect',
      listener: (event: { preventDefault(): void }, url: string) => void): unknown;
    setWindowOpenHandler(handler: () => { action: 'deny' }): void;
  };
};

/** Pass options => new BrowserWindow(options) from the Electron main process. */
export function createDashboardWindowManager(
  createWindow: (options: BrowserWindowConstructorOptions) => DashboardWindow,
) {
  const windows = new Map<string, {
    window: DashboardWindow;
    url?: string;
    origin: string;
    pending: Promise<void>;
  }>();

  return {
    async open(id: string, dashboard: { label: string; url: string }, parent?: BrowserWindow): Promise<void> {
      let target: URL;
      try {
        target = new URL(dashboard.url);
        if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Unsupported protocol');
      } catch {
        throw new Error(`Invalid dashboard URL for ${dashboard.label}: use an HTTP or HTTPS URL.`);
      }
      let entry = windows.get(id);
      if (!entry || entry.window.isDestroyed()) {
        const window = createWindow({
          title: dashboard.label, width: 1280, height: 900,
          minWidth: 900, minHeight: 600, show: false, parent,
          webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
        });
        entry = { window, origin: target.origin, pending: Promise.resolve() };
        const current = entry;
        windows.set(id, current);
        window.on('closed', () => {
          if (windows.get(id) === current) windows.delete(id);
        });
        const guard = (event: { preventDefault(): void }, url: string) => {
          try {
            if (new URL(url).origin === current.origin) return;
          } catch { /* Malformed navigation is blocked too. */ }
          event.preventDefault();
        };
        window.webContents.on('will-navigate', guard);
        window.webContents.on('will-redirect', guard);
        window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      }
      const current = entry;
      current.pending = current.pending.then(async () => {
        if (current.window.isDestroyed()) throw new Error('Dashboard window was closed. Open it again.');
        if (current.url !== dashboard.url) {
          current.origin = target.origin;
          try {
            await current.window.loadURL(dashboard.url);
            current.url = dashboard.url;
          } catch (cause) {
            if (windows.get(id) === current) windows.delete(id);
            if (!current.window.isDestroyed()) current.window.close();
            throw new Error(
              `Could not open ${dashboard.label}. Start the project service at ${dashboard.url}, then try again.`,
              { cause },
            );
          }
        }
        if (!current.window.isDestroyed()) {
          current.window.show();
          current.window.focus();
        }
      });
      return current.pending;
    },
  };
}
