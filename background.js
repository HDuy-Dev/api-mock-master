const STORAGE_KEY = 'mockMasterState';
const DEFAULT_STATE = { globalEnabled: true, mocks: [], groups: [] };

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

async function getState() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || DEFAULT_STATE;
}

async function setState(state) {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

function matchUrl(pattern, url) {
  if (!pattern || !url) return false;
  if (pattern === url) return true;
  const urlToMatch = pattern.includes('?') ? url : url.split('?')[0];
  if (pattern === urlToMatch) return true;
  try {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp('^' + escaped + '$').test(urlToMatch);
  } catch (_) {
    return false;
  }
}

// ── Icon management ───────────────────────────────────────────────────────
function drawIcon(size, active) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const s = size;
  const r = s * 0.22;

  // Rounded rectangle background
  ctx.beginPath();
  ctx.moveTo(r, 0); ctx.lineTo(s - r, 0);
  ctx.arcTo(s, 0, s, r, r);
  ctx.lineTo(s, s - r);
  ctx.arcTo(s, s, s - r, s, r);
  ctx.lineTo(r, s);
  ctx.arcTo(0, s, 0, s - r, r);
  ctx.lineTo(0, r);
  ctx.arcTo(0, 0, r, 0, r);
  ctx.closePath();
  ctx.fillStyle = active ? '#f59e0b' : '#4b5563';
  ctx.fill();

  // ">" chevron symbol
  ctx.beginPath();
  ctx.moveTo(s * 0.30, s * 0.27);
  ctx.lineTo(s * 0.68, s * 0.50);
  ctx.lineTo(s * 0.30, s * 0.73);
  ctx.strokeStyle = active ? '#1c1917' : '#9ca3af';
  ctx.lineWidth = s * 0.115;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  return ctx.getImageData(0, 0, s, s);
}

async function updateIcon(enabled) {
  try {
    await chrome.action.setIcon({
      imageData: {
        16:  drawIcon(16,  enabled),
        32:  drawIcon(32,  enabled),
        48:  drawIcon(48,  enabled),
        128: drawIcon(128, enabled),
      },
    });
    await chrome.action.setTitle({
      title: `API Mock Master — ${enabled ? 'Active' : 'Disabled'}`,
    });
    await chrome.action.setBadgeText({ text: enabled ? '' : 'OFF' });
    if (!enabled) await chrome.action.setBadgeBackgroundColor({ color: '#4b5563' });
  } catch (e) {
    console.warn('updateIcon failed:', e);
  }
}

// Set icon on startup / install
async function initIcon() {
  const state = await getState();
  await updateIcon(state.globalEnabled);
}
chrome.runtime.onInstalled.addListener(initIcon);
chrome.runtime.onStartup.addListener(initIcon);

// ── Persistent popup window ───────────────────────────────────────────────
let popupWindowId = null;

chrome.action.onClicked.addListener(async () => {
  if (popupWindowId !== null) {
    try {
      await chrome.windows.update(popupWindowId, { focused: true });
      return;
    } catch (_) {
      popupWindowId = null;
    }
  }
  const win = await chrome.windows.create({
    url: chrome.runtime.getURL('popup.html'),
    type: 'popup',
    width: 660,
    height: 660,
    focused: true,
  });
  popupWindowId = win.id;
});

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === popupWindowId) popupWindowId = null;
});

// ── Message handler ───────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  switch (msg.type) {
    case 'GET_MOCK':
      getState().then(async (state) => {
        if (!state.globalEnabled) { respond(null); return; }
        const mock = state.mocks.find(
          (m) =>
            m.enabled &&
            m.method.toUpperCase() === (msg.method || 'GET').toUpperCase() &&
            matchUrl(m.url, msg.url)
        );
        if (mock) {
          mock.hitCount = (mock.hitCount || 0) + 1;
          await setState(state);
          respond(mock);
        } else {
          respond(null);
        }
      });
      return true;

    case 'GET_STATE':
      getState().then(respond);
      return true;

    case 'SAVE_MOCK':
      getState().then(async (state) => {
        const m = msg.mock;
        const idx = state.mocks.findIndex((x) => x.id === m.id);
        if (idx >= 0) {
          state.mocks[idx] = { ...state.mocks[idx], ...m };
        } else {
          state.mocks.unshift({ hitCount: 0, ...m, id: m.id || uid() });
        }
        await setState(state);
        respond({ ok: true, state });
      });
      return true;

    case 'DELETE_MOCK':
      getState().then(async (state) => {
        state.mocks = state.mocks.filter((m) => m.id !== msg.id);
        await setState(state);
        respond({ ok: true, state });
      });
      return true;

    case 'TOGGLE_MOCK':
      getState().then(async (state) => {
        const m = state.mocks.find((x) => x.id === msg.id);
        if (m) m.enabled = msg.enabled;
        await setState(state);
        respond({ ok: true });
      });
      return true;

    case 'SET_GLOBAL':
      getState().then(async (state) => {
        state.globalEnabled = msg.enabled;
        await setState(state);
        await updateIcon(msg.enabled);
        respond({ ok: true });
      });
      return true;

    case 'SAVE_GROUP':
      getState().then(async (state) => {
        state.groups = state.groups || [];
        const idx = state.groups.findIndex((g) => g.id === msg.group.id);
        if (idx >= 0) {
          state.groups[idx] = { ...state.groups[idx], ...msg.group };
        } else {
          state.groups.push({ ...msg.group, id: msg.group.id || uid() });
        }
        await setState(state);
        respond({ ok: true, state });
      });
      return true;

    case 'DELETE_GROUP':
      getState().then(async (state) => {
        state.groups = (state.groups || []).filter((g) => g.id !== msg.id);
        // Ungroup mocks that belonged to this group
        state.mocks.forEach((m) => { if (m.groupId === msg.id) m.groupId = null; });
        await setState(state);
        respond({ ok: true, state });
      });
      return true;

    case 'CLEAR_ALL':
      getState().then(async (state) => {
        state.mocks = [];
        state.groups = [];
        await setState(state);
        respond({ ok: true, state });
      });
      return true;

    case 'RESET_HITS':
      getState().then(async (state) => {
        const m = state.mocks.find((x) => x.id === msg.id);
        if (m) m.hitCount = 0;
        await setState(state);
        respond({ ok: true });
      });
      return true;

    case 'REORDER_STATE':
      getState().then(async (state) => {
        state.mocks = msg.mocks;
        state.groups = msg.groups || [];
        await setState(state);
        respond({ ok: true, state });
      });
      return true;

    case 'IMPORT_STATE':
      getState().then(async (state) => {
        state.mocks = msg.mocks || [];
        state.groups = msg.groups || [];
        await setState(state);
        respond({ ok: true, state });
      });
      return true;
  }
});
