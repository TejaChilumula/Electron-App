// main.js
const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron');
const path = require('path');
const { loadState, saveState } = require('./state');

let overlayWin = null;
let controlWin = null;

const DEFAULT = {
  x: 80, y: 80, w: 520, h: 380,
  opacity: 0.9,
  blur: true,                // UI blur toggle
  clickThrough: true,
  wheelToOverlay: false,     // ignore mouse by default (safe mode)
  mode: 'mirror',            // 'mirror' | 'url'
  url: 'https://chatgpt.com',
  wsBase: '',                // e.g. wss://YOUR.worker.dev/?ws=1
  room: 'demo',
  pass: 'secret',
  visible: true
};

let STATE = { ...DEFAULT };

function applyWindowEffects() {
  if (!overlayWin) return;
  const isMac = process.platform === 'darwin';
  try {
    // True OS blur (not just CSS backdrop)
    if (isMac && overlayWin.setVibrancy) {
      overlayWin.setVibrancy(STATE.blur ? 'under-window' : null);
      overlayWin.setVisualEffectState('active');
    } else if (overlayWin.setBackgroundMaterial) {
      // Windows acrylic (fallback to none)
      overlayWin.setBackgroundMaterial(STATE.blur ? 'acrylic' : 'none');
    }
  } catch {}
}

function createOverlay() {
  if (overlayWin) return;

  const isMac = process.platform === 'darwin';
  overlayWin = new BrowserWindow({
    x: STATE.x, y: STATE.y, width: STATE.w, height: STATE.h,
    focusable: false,
    frame: false,
    transparent: true,
    resizable: true,
    hasShadow: false,
    show: false,
    backgroundColor: '#00ffffff',
    vibrancy: isMac ? 'under-window' : undefined,
    visualEffectState: isMac ? 'active' : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: true
    }
  });

  // Keep it above everything and visible on full-screen Spaces
  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWin.setFullScreenable(false);

  // Hide from screen recordings/sharing
  overlayWin.setContentProtection(true);

  // Click-through (keeps test tab focused)
  overlayWin.setIgnoreMouseEvents(!!STATE.clickThrough, { forward: true });

  applyWindowEffects();

  overlayWin.loadFile(path.join(__dirname, 'overlay.html'));
  overlayWin.once('ready-to-show', () => {
    overlayWin.showInactive(); // don't steal focus
    overlayWin.webContents.send('STATE', STATE);
  });

  const saveBounds = () => {
    try {
      const b = overlayWin.getBounds();
      STATE = { ...STATE, x: b.x, y: b.y, w: b.width, h: b.height };
      saveState(app.getPath('userData'), STATE);
    } catch {}
  };
  overlayWin.on('moved', saveBounds);
  overlayWin.on('resized', saveBounds);
}

function createControl() {
  if (controlWin && !controlWin.isDestroyed()) { controlWin.focus(); return; }
  controlWin = new BrowserWindow({
    width: 460, height: 520,
    focusable: false,
    alwaysOnTop: true,
    title: 'Overlay Control',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  controlWin.loadFile(path.join(__dirname, 'control.html'));
  controlWin.on('closed', () => (controlWin = null));
}

function applyAndBroadcast() {
  if (!overlayWin) return;
  overlayWin.setIgnoreMouseEvents(!!STATE.clickThrough, { forward: true });
  applyWindowEffects();
  overlayWin.webContents.send('STATE', STATE);
  saveState(app.getPath('userData'), STATE);
}

function registerShortcuts() {
  // ---- Move nudges (unchanged) ----
  function nudge(dx, dy) {
    if (!overlayWin) return;
    const b = overlayWin.getBounds();
    const nb = { x: b.x + dx, y: b.y + dy, width: b.width, height: b.height };
    overlayWin.setBounds(nb);
    STATE.x = nb.x; STATE.y = nb.y;
    saveState(app.getPath('userData'), STATE);
  }

  const STEP = 10; // pixels per nudge
  globalShortcut.register('Alt+Shift+Up',    () => nudge( 0, -STEP));
  globalShortcut.register('Alt+Shift+Down',  () => nudge( 0,  STEP));
  globalShortcut.register('Alt+Shift+Left',  () => nudge(-STEP, 0));
  globalShortcut.register('Alt+Shift+Right', () => nudge( STEP, 0));

  // ---- Show/Hide overlay (unchanged) ----
  globalShortcut.register('Alt+Shift+M', () => {
    STATE.visible = !STATE.visible;
    if (STATE.visible) { createOverlay(); overlayWin.showInactive(); }
    else overlayWin?.hide();
    saveState(app.getPath('userData'), STATE);
  });

  // ---- Scroll with double-tap latch (NEW) ----
  const STEP_SCROLL      = 150;   // px per single tap
const LATCH_MS         = 350;   // double-tap window
const AUTO_INTERVAL_MS = 90;    // slower repeat (was 30 ms)
const AUTO_STEP        = Math.max(1, Math.round(STEP_SCROLL / 12)); // smaller per-tick step

const scrollState = {
  down: { last: 0, timer: null },
  up:   { last: 0, timer: null },
};

function tickScroll(dy) {
  overlayWin?.webContents.send('SCROLL', dy);
}
function startAuto(dir) {
  stopAuto(dir);
  const dy = dir === 'down' ? +AUTO_STEP : -AUTO_STEP;
  scrollState[dir].timer = setInterval(() => tickScroll(dy), AUTO_INTERVAL_MS);
}
function stopAuto(dir) {
  const s = scrollState[dir];
  if (s.timer) { clearInterval(s.timer); s.timer = null; }
}
function handleScrollKey(dir) {
  const now = Date.now();
  const s = scrollState[dir];

  if (s.timer) { stopAuto(dir); s.last = 0; return; }          // tap to stop
  if (now - s.last <= LATCH_MS) { startAuto(dir); s.last = 0; return; } // double-tap to start

  tickScroll(dir === 'down' ? STEP_SCROLL : -STEP_SCROLL);      // single step
  s.last = now;
}

globalShortcut.register('Alt+Shift+J', () => handleScrollKey('down'));
globalShortcut.register('Alt+Shift+K', () => handleScrollKey('up'));


  // ---- Click-through toggle (unchanged) ----
  globalShortcut.register('Alt+Shift+T', () => {
    STATE.clickThrough = !STATE.clickThrough;
    applyAndBroadcast();
  });

  // Wheel routing toggle (kept; only matters if you use it elsewhere)
  globalShortcut.register('Alt+Shift+O', () => {
    STATE.wheelToOverlay = !STATE.wheelToOverlay;
    applyAndBroadcast();
  });

  // Control window
  globalShortcut.register('Alt+Shift+C', () => createControl());

  // Quick hide
  globalShortcut.register('Alt+Shift+W', () => {
    overlayWin?.hide();
    STATE.visible = false;
    saveState(app.getPath('userData'), STATE);
  });

  // DevTools
  globalShortcut.register('Alt+Shift+D', () => {
    overlayWin?.webContents.openDevTools({ mode: 'detach' });
  });

  // Ensure timers stop on quit
  app.on('will-quit', () => {
    ['down','up'].forEach(dir => {
      if (scrollState[dir].timer) clearInterval(scrollState[dir].timer);
    });
  });
}

app.whenReady().then(() => {
  const saved = loadState(app.getPath('userData'));
  if (saved) STATE = { ...DEFAULT, ...saved };
  createOverlay();
  registerShortcuts();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createOverlay();
  });
});

app.on('will-quit', () => globalShortcut.unregisterAll());

// IPC from renderer/control
ipcMain.handle('SET_STATE', (e, patch) => {
  STATE = { ...STATE, ...patch };
  applyAndBroadcast();
  return { ok: true };   // let control.js toast + close
});

ipcMain.handle('GET_STATE', () => STATE);

ipcMain.handle('CLOSE_OVERLAY', () => {
  overlayWin?.hide();
  STATE.visible = false;
  saveState(app.getPath('userData'), STATE);
});

// Allow overlay top bar to temporarily disable click-through so the ✕ is clickable
ipcMain.handle('SET_CLICK_THROUGH', (e, on) => {
  STATE.clickThrough = !!on;
  overlayWin?.setIgnoreMouseEvents(!!on, { forward: true });
  saveState(app.getPath('userData'), STATE);
  return { ok: true };
});
