'use strict';

// ── State ─────────────────────────────────────────────────────────────────
let state = { globalEnabled: true, mocks: [], groups: [] };
let searchQuery = '';
let expandedId = null;
const autoSaveTimers = {};

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

// ── Init ──────────────────────────────────────────────────────────────────
async function init() {
  state = await sendMsg({ type: 'GET_STATE' });
  state.groups = state.groups || [];
  bindToolbar();
  render();
}

function sendMsg(msg) { return chrome.runtime.sendMessage(msg); }

// ── Toolbar ───────────────────────────────────────────────────────────────
function bindToolbar() {
  const gt = q('#global-toggle');
  gt.checked = state.globalEnabled;
  gt.addEventListener('change', async () => {
    state.globalEnabled = gt.checked;
    await sendMsg({ type: 'SET_GLOBAL', enabled: state.globalEnabled });
  });

  q('#btn-search').addEventListener('click', () => {
    const bar = q('#search-bar');
    bar.classList.toggle('hidden');
    if (!bar.classList.contains('hidden')) q('#search-input').focus();
    else { searchQuery = ''; q('#search-input').value = ''; render(); }
  });
  q('#search-input').addEventListener('input', (e) => { searchQuery = e.target.value.toLowerCase(); render(); });
  q('#btn-close-search').addEventListener('click', () => {
    searchQuery = ''; q('#search-input').value = '';
    q('#search-bar').classList.add('hidden'); render();
  });

  q('#btn-clear').addEventListener('click', () => {
    if (!state.mocks.length && !state.groups.length) return;
    showConfirm('Delete ALL mocks and groups?', async () => {
      const res = await sendMsg({ type: 'CLEAR_ALL' });
      state = res.state; expandedId = null; render();
    });
  });

  q('#btn-add').addEventListener('click', () => addNewMock(null));
  q('#btn-add-first').addEventListener('click', () => addNewMock(null));
  q('#btn-add-group').addEventListener('click', addNewGroup);
  q('#btn-close').addEventListener('click', () => window.close());
  bindImportExport();
}

// ── Render ────────────────────────────────────────────────────────────────
function render() {
  const list = q('#mock-list');
  list.innerHTML = '';

  const pass = (m) =>
    !searchQuery ||
    m.url.toLowerCase().includes(searchQuery) ||
    (m.label || '').toLowerCase().includes(searchQuery);

  const groupIds = new Set((state.groups || []).map((g) => g.id));

  // Ungrouped mocks first
  const ungrouped = state.mocks.filter((m) => !m.groupId || !groupIds.has(m.groupId));
  ungrouped.filter(pass).forEach((m) => list.appendChild(buildMockItem(m)));

  // Groups
  (state.groups || []).forEach((group) => {
    const all = state.mocks.filter((m) => m.groupId === group.id);
    const visible = all.filter(pass);
    if (searchQuery && visible.length === 0) return;
    list.appendChild(buildGroupSection(group, visible, all.length));
  });

  const hasMocks = state.mocks.length > 0 || state.groups.length > 0;
  const visibleCount = list.children.length;
  q('#empty-state').classList.toggle('hidden', hasMocks);
  q('#no-results').classList.toggle('hidden', !hasMocks || !searchQuery || visibleCount > 0);
  initDragDrop();
}

// ── Group section ─────────────────────────────────────────────────────────
function buildGroupSection(group, visibleMocks, totalCount) {
  const el = document.createElement('div');
  el.className = 'group-section';
  el.dataset.groupId = group.id;

  el.innerHTML = `
    <div class="group-header ${group.collapsed ? '' : 'open'}">
      <span class="group-drag-handle" title="Drag to reorder group">
        <svg viewBox="0 0 20 20" fill="currentColor">
          <circle cx="7" cy="5" r="1.5"/><circle cx="13" cy="5" r="1.5"/>
          <circle cx="7" cy="10" r="1.5"/><circle cx="13" cy="10" r="1.5"/>
          <circle cx="7" cy="15" r="1.5"/><circle cx="13" cy="15" r="1.5"/>
        </svg>
      </span>
      <span class="group-chevron">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </span>
      <span class="group-folder-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
        </svg>
      </span>
      <span class="group-name">${esc(group.name)}</span>
      <span class="group-count">${totalCount}</span>
      <div class="group-actions">
        <button class="btn-add-to-group icon-btn" title="Add mock to this group">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
        <div class="more-wrap">
          <button class="more-btn">⋮</button>
          <div class="dropdown hidden">
            <button class="btn-rename-group">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Rename
            </button>
            <button class="btn-export-group">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export group
            </button>
            <div class="dropdown-sep"></div>
            <button class="btn-delete-group danger">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
              Delete group
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="group-body ${group.collapsed ? 'hidden' : ''}"></div>
  `;

  const body = q('.group-body', el);
  visibleMocks.forEach((m) => body.appendChild(buildMockItem(m)));
  bindGroupSection(el, group);
  return el;
}

function bindGroupSection(el, group) {
  const header = q('.group-header', el);
  const body = q('.group-body', el);
  const dropdown = q('.dropdown', el);

  // Collapse / expand
  header.addEventListener('click', async (e) => {
    if (e.target.closest('.group-actions')) return;
    group.collapsed = !group.collapsed;
    header.classList.toggle('open', !group.collapsed);
    body.classList.toggle('hidden', group.collapsed);
    await sendMsg({ type: 'SAVE_GROUP', group });
    updateGroupInState(group);
  });

  // Double-click to rename
  q('.group-name', el).addEventListener('dblclick', (e) => {
    e.stopPropagation();
    startGroupRename(el, group);
  });

  // Add mock to this group
  q('.btn-add-to-group', el).addEventListener('click', async (e) => {
    e.stopPropagation();
    if (group.collapsed) {
      group.collapsed = false;
      header.classList.add('open');
      body.classList.remove('hidden');
      await sendMsg({ type: 'SAVE_GROUP', group });
    }
    addNewMock(group.id);
  });

  // More / dropdown
  q('.more-btn', el).addEventListener('click', (e) => {
    e.stopPropagation();
    openDropdown(e.currentTarget, dropdown);
  });

  q('.btn-rename-group', el).addEventListener('click', (e) => {
    e.stopPropagation(); closeDropdown(dropdown);
    startGroupRename(el, group);
  });

  q('.btn-export-group', el).addEventListener('click', (e) => {
    e.stopPropagation(); closeDropdown(dropdown);
    exportGroup(group);
  });

  q('.btn-delete-group', el).addEventListener('click', (e) => {
    e.stopPropagation(); closeDropdown(dropdown);
    showConfirm(`Delete group "${group.name}"?\nMocks inside will become ungrouped.`, async () => {
      const res = await sendMsg({ type: 'DELETE_GROUP', id: group.id });
      state = res.state; render();
    });
  });
}

function startGroupRename(el, group) {
  const nameEl = q('.group-name', el);
  const old = group.name;
  nameEl.contentEditable = 'true';
  nameEl.focus();
  const range = document.createRange();
  range.selectNodeContents(nameEl);
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);

  let done = false;
  const finish = async () => {
    if (done) return; done = true;
    nameEl.contentEditable = 'false';
    const name = nameEl.textContent.trim() || old;
    if (name === old) return; // no change
    group.name = name;
    await sendMsg({ type: 'SAVE_GROUP', group });
    updateGroupInState(group);
    render(); // refresh all mock dropdowns that show group names
  };
  nameEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); }
    if (e.key === 'Escape') { nameEl.textContent = old; nameEl.contentEditable = 'false'; done = true; }
  });
  nameEl.addEventListener('blur', finish);
}

async function addNewGroup() {
  const ng = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: 'New Group', collapsed: false,
  };
  const res = await sendMsg({ type: 'SAVE_GROUP', group: ng });
  state = res.state; render();
  const el = document.querySelector(`[data-group-id="${ng.id}"]`);
  if (el) startGroupRename(el, state.groups.find((g) => g.id === ng.id) || ng);
}

// ── Mock item ─────────────────────────────────────────────────────────────
function buildMoveToGroupBtns(mock) {
  const groups = state.groups || [];
  const items = [];
  if (mock.groupId) {
    items.push(`<button class="btn-move-group" data-gid="">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
        <line x1="9" y1="14" x2="15" y2="14"/><polyline points="12 11 9 14 12 17"/>
      </svg>
      Remove from group
    </button>`);
  }
  groups.filter((g) => g.id !== mock.groupId).forEach((g) => {
    items.push(`<button class="btn-move-group" data-gid="${esc(g.id)}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
        <line x1="9" y1="14" x2="15" y2="14"/><polyline points="12 11 15 14 12 17"/>
      </svg>
      → ${esc(g.name)}
    </button>`);
  });
  if (!items.length) return '';
  return `<div class="dropdown-sep"></div>` + items.join('');
}

function buildMockItem(mock) {
  const el = document.createElement('div');
  el.className = 'mock-item' + (mock.id === expandedId ? ' expanded' : '');
  el.dataset.id = mock.id;

  el.innerHTML = `
    <div class="mock-header">
      <span class="drag-handle" title="Drag to reorder">
        <svg viewBox="0 0 20 20" fill="currentColor">
          <circle cx="7" cy="5" r="1.5"/><circle cx="13" cy="5" r="1.5"/>
          <circle cx="7" cy="10" r="1.5"/><circle cx="13" cy="10" r="1.5"/>
          <circle cx="7" cy="15" r="1.5"/><circle cx="13" cy="15" r="1.5"/>
        </svg>
      </span>
      <span class="chevron">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </span>
      <div class="mock-header-main">
        <span class="mock-name ${mock.enabled ? '' : 'dimmed'}" title="${esc(mock.url)}">${esc(mock.label || getEndpoint(mock.url) || '(empty URL)')}</span>
        <span class="mock-url-sub ${mock.enabled ? '' : 'dimmed'}">${esc(mock.url || '')}</span>
      </div>
      <span class="method-badge ${mock.method}">${esc(mock.method)}</span>
      <span class="hit-badge" title="Hit count">${mock.hitCount || 0}</span>
      <label class="toggle-wrap item-toggle" title="Enable this mock">
        <input type="checkbox" class="mock-toggle" ${mock.enabled ? 'checked' : ''}>
        <span class="toggle-track"><span class="toggle-thumb"></span></span>
      </label>
      <div class="more-wrap">
        <button class="more-btn">⋮</button>
        <div class="dropdown hidden">
          <button class="btn-reset-hits">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/></svg>
            Reset hit count
          </button>
          <button class="btn-duplicate">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            Duplicate
          </button>
          <button class="btn-export-mock">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export mock
          </button>
          ${buildMoveToGroupBtns(mock)}
          <div class="dropdown-sep"></div>
          <button class="btn-delete danger">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
            Delete
          </button>
        </div>
      </div>
    </div>

    <div class="mock-body ${mock.id === expandedId ? '' : 'hidden'}">
      <div class="url-row">
        <input type="text" class="url-input" value="${esc(mock.url)}" placeholder="https://example.com/api/endpoint" autocomplete="off" spellcheck="false">
        <button class="url-clear-btn" title="Clear URL">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="config-row">
        <div class="field">
          <label>HTTP Method</label>
          <select class="method-select">
            ${METHODS.map((m) => `<option ${m === mock.method ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Status code</label>
          <input type="number" class="status-input" value="${mock.statusCode || 200}" min="100" max="599">
        </div>
        <div class="field">
          <label>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Delay (ms)
          </label>
          <input type="number" class="delay-input" value="${mock.delay || 0}" min="0">
        </div>
      </div>
      <div class="tabs">
        <button class="tab-btn active" data-tab="response">Response payload</button>
        <button class="tab-btn" data-tab="request">Request payload</button>
        <button class="tab-btn" data-tab="headers">Response headers</button>
      </div>
      <div class="editor-wrap">
        <div class="line-nums">1</div>
        <textarea class="code-editor" spellcheck="false" data-tab="response">${esc(mock.responseBody || '')}</textarea>
        <textarea class="code-editor hidden" spellcheck="false" data-tab="request">${esc(mock.requestPayload || '')}</textarea>
        <textarea class="code-editor hidden" spellcheck="false" data-tab="headers">${esc(mock.responseHeaders || '')}</textarea>
      </div>
      <div class="action-row">
        <button class="btn-secondary btn-format">Format JSON</button>
        <span class="save-indicator"></span>
      </div>
    </div>
  `;

  bindMockItem(el, mock);
  return el;
}

function bindMockItem(el, mock) {
  // Expand / collapse (ignore dblclick on name — that triggers rename)
  q('.mock-header', el).addEventListener('click', (e) => {
    if (e.target.closest('.item-toggle') || e.target.closest('.more-wrap') || e.target.closest('.mock-name')) return;
    toggleExpand(mock.id, el);
  });

  // Double-click on name to rename
  q('.mock-name', el).addEventListener('dblclick', (e) => {
    e.stopPropagation();
    startMockRename(el, mock);
  });

  // Item toggle
  q('.mock-toggle', el).addEventListener('change', async (e) => {
    e.stopPropagation();
    mock.enabled = e.target.checked;
    q('.mock-url', el).classList.toggle('dimmed', !mock.enabled);
    await sendMsg({ type: 'TOGGLE_MOCK', id: mock.id, enabled: mock.enabled });
    updateMockInState(mock);
  });

  // Dropdown
  const dropdown = q('.dropdown', el);
  q('.more-btn', el).addEventListener('click', (e) => {
    e.stopPropagation();
    openDropdown(e.currentTarget, dropdown);
  });

  q('.btn-reset-hits', el).addEventListener('click', async (e) => {
    e.stopPropagation(); closeDropdown(dropdown);
    await sendMsg({ type: 'RESET_HITS', id: mock.id });
    mock.hitCount = 0; updateMockInState(mock);
    q('.hit-badge', el).textContent = '0';
  });

  q('.btn-duplicate', el).addEventListener('click', (e) => {
    e.stopPropagation(); closeDropdown(dropdown);
    duplicateMock(mock);
  });

  q('.btn-export-mock', el).addEventListener('click', (e) => {
    e.stopPropagation(); closeDropdown(dropdown);
    exportSingleMock(mock);
  });

  // Move to group buttons
  el.querySelectorAll('.btn-move-group').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation(); closeDropdown(dropdown);
      mock.groupId = btn.dataset.gid || null;
      updateMockInState(mock);
      await sendMsg({ type: 'SAVE_MOCK', mock });
      render();
    });
  });

  q('.btn-delete', el).addEventListener('click', (e) => {
    e.stopPropagation(); closeDropdown(dropdown);
    showConfirm(`Delete mock?\n${mock.url || '(empty URL)'}`, async () => {
      const res = await sendMsg({ type: 'DELETE_MOCK', id: mock.id });
      state = res.state;
      if (expandedId === mock.id) expandedId = null;
      render();
    });
  });

  // URL clear
  q('.url-clear-btn', el).addEventListener('click', () => {
    q('.url-input', el).value = '';
    q('.url-input', el).focus();
    scheduleAutoSave(el, mock);
  });

  // Tabs
  const tabBtns = el.querySelectorAll('.tab-btn');
  const editors = el.querySelectorAll('.code-editor');
  const lineNums = q('.line-nums', el);

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      editors.forEach((ed) => ed.classList.toggle('hidden', ed.dataset.tab !== btn.dataset.tab));
      updateLineNums(el.querySelector(`.code-editor[data-tab="${btn.dataset.tab}"]`), lineNums);
    });
  });

  // Editors: line numbers + Tab key + auto-save
  editors.forEach((ed) => {
    ed.addEventListener('input', () => { updateLineNums(ed, lineNums); scheduleAutoSave(el, mock); });
    ed.addEventListener('scroll', () => { lineNums.scrollTop = ed.scrollTop; });
    ed.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = ed.selectionStart, end = ed.selectionEnd;
        ed.value = ed.value.substring(0, s) + '  ' + ed.value.substring(end);
        ed.selectionStart = ed.selectionEnd = s + 2;
        updateLineNums(ed, lineNums);
      }
    });
  });

  const activeEd = el.querySelector('.code-editor:not(.hidden)');
  if (activeEd) updateLineNums(activeEd, lineNums);

  // Config fields auto-save
  ['.url-input', '.status-input', '.delay-input'].forEach((sel) => {
    q(sel, el)?.addEventListener('input', () => scheduleAutoSave(el, mock));
  });
  q('.method-select', el)?.addEventListener('change', () => scheduleAutoSave(el, mock));

  // Format JSON (deep-expand stringified JSON values)
  q('.btn-format', el).addEventListener('click', () => {
    const activeEd = el.querySelector('.code-editor:not(.hidden)');
    if (!activeEd) return;
    try {
      activeEd.value = JSON.stringify(deepExpand(JSON.parse(activeEd.value)), null, 2);
      updateLineNums(activeEd, lineNums);
      scheduleAutoSave(el, mock);
    } catch (_) { flashError(q('.btn-format', el)); }
  });
}

// ── Expand / collapse ─────────────────────────────────────────────────────
function toggleExpand(id, el) {
  const wasExpanded = expandedId === id;
  document.querySelectorAll('.mock-item.expanded').forEach((item) => {
    item.classList.remove('expanded');
    q('.mock-body', item)?.classList.add('hidden');
  });
  if (!wasExpanded) {
    expandedId = id;
    el.classList.add('expanded');
    q('.mock-body', el).classList.remove('hidden');
    const activeEd = el.querySelector('.code-editor:not(.hidden)');
    if (activeEd) updateLineNums(activeEd, q('.line-nums', el));
  } else {
    expandedId = null;
  }
}

// ── Auto-save ─────────────────────────────────────────────────────────────
function scheduleAutoSave(el, mock) {
  clearTimeout(autoSaveTimers[mock.id]);
  setSaveStatus(el, 'pending');
  autoSaveTimers[mock.id] = setTimeout(() => doAutoSave(el, mock), 700);
}

async function doAutoSave(el, mock) {
  setSaveStatus(el, 'saving');
  const updated = readMockFromEl(el, mock);
  if (!updated.url) { setSaveStatus(el, 'idle'); return; }
  const res = await sendMsg({ type: 'SAVE_MOCK', mock: updated });
  state = res.state;
  updateMockInState(updated);
  const badge = q('.method-badge', el);
  if (badge) { badge.className = 'method-badge ' + updated.method; badge.textContent = updated.method; }
  const nameEl = q('.mock-name', el);
  if (nameEl) { nameEl.textContent = updated.label || getEndpoint(updated.url) || updated.url; nameEl.title = updated.url; }
  const subEl = q('.mock-url-sub', el);
  if (subEl) subEl.textContent = updated.url || '';
  setSaveStatus(el, 'saved');
}

function readMockFromEl(el, mock) {
  return {
    ...mock,
    url: q('.url-input', el).value.trim(),
    method: q('.method-select', el).value,
    statusCode: parseInt(q('.status-input', el).value) || 200,
    delay: parseInt(q('.delay-input', el).value) || 0,
    responseBody: el.querySelector('.code-editor[data-tab="response"]').value,
    requestPayload: el.querySelector('.code-editor[data-tab="request"]').value,
    responseHeaders: el.querySelector('.code-editor[data-tab="headers"]').value,
  };
}

function setSaveStatus(el, status) {
  const ind = q('.save-indicator', el);
  if (!ind) return;
  clearTimeout(ind._t);
  const MAP = { pending: ['', ''], saving: ['Saving…', 'saving'], saved: ['✓ Saved', 'saved'], idle: ['', ''] };
  const [text, cls] = MAP[status] || ['', ''];
  ind.textContent = text;
  ind.className = 'save-indicator' + (cls ? ' ' + cls : '');
  if (status === 'saved') ind._t = setTimeout(() => { ind.textContent = ''; ind.className = 'save-indicator'; }, 2000);
}

// ── Add / duplicate ───────────────────────────────────────────────────────
async function addNewMock(groupId) {
  const nm = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    url: '', method: 'GET', enabled: true, statusCode: 200, delay: 0,
    label: '', responseBody: '{\n  \n}', requestPayload: '', responseHeaders: '',
    hitCount: 0, groupId: groupId || null,
  };
  const res = await sendMsg({ type: 'SAVE_MOCK', mock: nm });
  state = res.state; expandedId = nm.id;
  render();
  q(`[data-id="${nm.id}"] .url-input`)?.focus();
}

async function duplicateMock(mock) {
  const dupe = {
    ...mock,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    label: mock.label ? mock.label + ' (copy)' : '', hitCount: 0,
  };
  const res = await sendMsg({ type: 'SAVE_MOCK', mock: dupe });
  state = res.state; expandedId = dupe.id; render();
}

// ── Line numbers ──────────────────────────────────────────────────────────
function updateLineNums(editor, lineNumEl) {
  if (!editor || !lineNumEl) return;
  const lines = editor.value.split('\n').length;
  lineNumEl.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
  lineNumEl.scrollTop = editor.scrollTop;
}

// ── State helpers ─────────────────────────────────────────────────────────
function updateMockInState(updated) {
  const idx = state.mocks.findIndex((m) => m.id === updated.id);
  if (idx >= 0) state.mocks[idx] = { ...state.mocks[idx], ...updated };
}
function updateGroupInState(updated) {
  const idx = (state.groups || []).findIndex((g) => g.id === updated.id);
  if (idx >= 0) state.groups[idx] = { ...state.groups[idx], ...updated };
}

// ── Mock rename ───────────────────────────────────────────────────────────
function startMockRename(el, mock) {
  const nameEl = q('.mock-name', el);
  const oldText = nameEl.textContent;
  nameEl.contentEditable = 'true';
  nameEl.classList.add('editing');
  nameEl.focus();
  const range = document.createRange();
  range.selectNodeContents(nameEl);
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);

  let done = false;
  const finish = async () => {
    if (done) return; done = true;
    nameEl.contentEditable = 'false';
    nameEl.classList.remove('editing');
    const newName = nameEl.textContent.trim();
    const autoName = getEndpoint(mock.url) || '';
    // Clear label if user typed back the auto-generated default
    mock.label = (newName && newName !== autoName) ? newName : '';
    nameEl.textContent = mock.label || autoName || '(empty URL)';
    updateMockInState(mock);
    await sendMsg({ type: 'SAVE_MOCK', mock });
  };
  nameEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); }
    if (e.key === 'Escape') {
      done = true;
      nameEl.textContent = oldText;
      nameEl.contentEditable = 'false';
      nameEl.classList.remove('editing');
    }
  });
  nameEl.addEventListener('blur', finish);
}

// ── Utilities ─────────────────────────────────────────────────────────────
function q(selector, ctx) { return (ctx || document).querySelector(selector); }
function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getEndpoint(url) {
  if (!url) return '';
  try {
    const clean = url.replace(/\*.*$/, '').replace(/\?.*$/, '').replace(/\/$/, '');
    const pathname = new URL(clean).pathname;
    return pathname === '/' ? '/' : pathname;
  } catch {
    const m = url.match(/https?:\/\/[^/]+(\/[^?*]*)/);
    return m ? (m[1].replace(/\/$/, '') || '/') : url;
  }
}

// Recursively expand JSON-encoded strings into proper nested objects/arrays.
// Only expands strings that start with { or [ and parse to an object/array —
// leaves plain strings, numbers, booleans unchanged.
function deepExpand(value) {
  if (typeof value === 'string') {
    const t = value.trim();
    if (t.startsWith('{') || t.startsWith('[')) {
      try {
        const inner = JSON.parse(t);
        if (inner !== null && typeof inner === 'object') return deepExpand(inner);
      } catch (_) {}
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(deepExpand);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepExpand(v);
    return out;
  }
  return value;
}
function flashError(el) {
  el.style.borderColor = 'var(--red)';
  el.style.boxShadow = '0 0 0 2px rgba(239,68,68,.25)';
  setTimeout(() => { el.style.borderColor = ''; el.style.boxShadow = ''; }, 1200);
}

// ── Dropdown helpers ──────────────────────────────────────────────────────
// Use position:fixed so dropdowns escape overflow:hidden containers (e.g. group-section)
function openDropdown(btn, dd) {
  const alreadyOpen = !dd.classList.contains('hidden');
  closeAllDropdowns();
  if (!alreadyOpen) {
    const rect = btn.getBoundingClientRect();
    const rightFromVP = window.innerWidth - rect.right;
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow > 160) {
      dd.style.cssText = `position:fixed;top:${rect.bottom + 4}px;right:${rightFromVP}px;left:auto;`;
    } else {
      dd.style.cssText = `position:fixed;bottom:${window.innerHeight - rect.top + 4}px;right:${rightFromVP}px;left:auto;top:auto;`;
    }
    dd.classList.remove('hidden');
  }
}

function closeDropdown(dd) {
  dd.classList.add('hidden');
  dd.style.cssText = '';
}

function closeAllDropdowns() {
  document.querySelectorAll('.dropdown:not(.hidden)').forEach(closeDropdown);
}

// ── Confirm dialog ────────────────────────────────────────────────────────
function showConfirm(msg, onOk) {
  q('#confirm-msg').textContent = msg;
  q('#confirm-overlay').classList.remove('hidden');
  const ok = q('#confirm-ok'), cancel = q('#confirm-cancel');
  const cleanup = () => {
    q('#confirm-overlay').classList.add('hidden');
    ok.removeEventListener('click', handleOk);
    cancel.removeEventListener('click', handleCancel);
  };
  const handleOk = () => { cleanup(); onOk(); };
  const handleCancel = () => cleanup();
  ok.addEventListener('click', handleOk);
  cancel.addEventListener('click', handleCancel);
}

document.addEventListener('click', () => { closeAllDropdowns(); });

// ── Drag & Drop ───────────────────────────────────────────────────────────
let dragState = null;
let dropInd = null;
let dragDropListInit = false;

function getDropIndicator() {
  if (!dropInd) { dropInd = document.createElement('div'); dropInd.className = 'drop-indicator'; }
  return dropInd;
}

function removeDropIndicator() {
  if (dropInd && dropInd.parentNode) dropInd.parentNode.removeChild(dropInd);
}

function clearDragUI() {
  removeDropIndicator();
  document.querySelectorAll('.drag-group-target').forEach((el) => el.classList.remove('drag-group-target'));
}

function initDragDrop() {
  const list = q('#mock-list');

  // ── Mock items ─────────────────────────────────────────────────────────
  list.querySelectorAll('.mock-item').forEach((el) => {
    const mockId = el.dataset.id;
    el.setAttribute('draggable', 'true');

    el.addEventListener('dragstart', (e) => {
      if (e.target.closest('button,input,select,textarea,label,.toggle-wrap,.more-wrap,[contenteditable="true"]')) {
        e.preventDefault(); return;
      }
      dragState = { type: 'mock', id: mockId };
      setTimeout(() => el.classList.add('dragging'), 0);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', mockId);
      e.stopPropagation();
    });

    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      dragState = null;
      clearDragUI();
    });

    el.addEventListener('dragover', (e) => {
      if (!dragState || dragState.type !== 'mock' || dragState.id === mockId) return;
      e.stopPropagation();
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const ind = getDropIndicator();
      if (e.clientY < rect.top + rect.height / 2) el.parentNode.insertBefore(ind, el);
      else el.parentNode.insertBefore(ind, el.nextSibling);
    });

    el.addEventListener('drop', (e) => {
      if (!dragState || dragState.type !== 'mock' || dragState.id === mockId) return;
      e.stopPropagation(); e.preventDefault();
      const rect = el.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      const targetMock = state.mocks.find((m) => m.id === mockId);
      clearDragUI();
      doMockReorder(dragState.id, mockId, before, targetMock?.groupId ?? null);
    });
  });

  // ── Group sections ─────────────────────────────────────────────────────
  // Only the header is draggable — making the whole section draggable conflicts
  // with nested mock-items that are also draggable.
  list.querySelectorAll('.group-section').forEach((el) => {
    const groupId = el.dataset.groupId;
    const header = q('.group-header', el);
    header.setAttribute('draggable', 'true');

    header.addEventListener('dragstart', (e) => {
      if (e.target.closest('button,.more-wrap,[contenteditable="true"]')) { e.preventDefault(); return; }
      dragState = { type: 'group', id: groupId };
      setTimeout(() => el.classList.add('dragging'), 0);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', groupId);
      e.stopPropagation();
    });

    header.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      dragState = null;
      clearDragUI();
    });

    // Header: drop target for moving mocks into this group
    header.addEventListener('dragover', (e) => {
      if (!dragState || dragState.type !== 'mock') return;
      e.stopPropagation();
      const mock = state.mocks.find((m) => m.id === dragState.id);
      if (mock?.groupId === groupId) return;
      e.preventDefault();
      removeDropIndicator();
      header.classList.add('drag-group-target');
    });

    header.addEventListener('dragleave', (e) => {
      if (!header.contains(e.relatedTarget)) header.classList.remove('drag-group-target');
    });

    header.addEventListener('drop', (e) => {
      header.classList.remove('drag-group-target');
      if (!dragState || dragState.type !== 'mock') return;
      e.stopPropagation(); e.preventDefault();
      doMockMoveToGroup(dragState.id, groupId);
    });
  });

  // ── Group reorder: event delegation on the list ────────────────────────
  // Added once — the list element persists across renders, elements inside do not.
  if (!dragDropListInit) {
    dragDropListInit = true;

    list.addEventListener('dragover', (e) => {
      if (!dragState || dragState.type !== 'group') return;
      const targetSection = e.target.closest('.group-section');
      if (!targetSection || targetSection.dataset.groupId === dragState.id) return;
      e.preventDefault();
      const rect = targetSection.getBoundingClientRect();
      const ind = getDropIndicator();
      if (e.clientY < rect.top + rect.height / 2) list.insertBefore(ind, targetSection);
      else list.insertBefore(ind, targetSection.nextSibling);
    });

    list.addEventListener('drop', (e) => {
      if (!dragState || dragState.type !== 'group') return;
      const targetSection = e.target.closest('.group-section');
      if (!targetSection || targetSection.dataset.groupId === dragState.id) return;
      e.preventDefault();
      const rect = targetSection.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      clearDragUI();
      doGroupReorder(dragState.id, targetSection.dataset.groupId, before);
    });
  }
}

async function doMockReorder(srcId, targetId, before, newGroupId) {
  const mocks = [...state.mocks];
  const srcIdx = mocks.findIndex((m) => m.id === srcId);
  if (srcIdx < 0) return;
  const [src] = mocks.splice(srcIdx, 1);
  src.groupId = newGroupId;
  const tIdx = mocks.findIndex((m) => m.id === targetId);
  mocks.splice(tIdx < 0 ? mocks.length : (before ? tIdx : tIdx + 1), 0, src);
  state.mocks = mocks;
  await sendMsg({ type: 'REORDER_STATE', mocks, groups: state.groups });
  render();
}

async function doMockMoveToGroup(mockId, groupId) {
  const mock = state.mocks.find((m) => m.id === mockId);
  if (!mock) return;
  mock.groupId = groupId;
  const res = await sendMsg({ type: 'SAVE_MOCK', mock });
  state = res.state; state.groups = state.groups || [];
  render();
}

async function doGroupReorder(srcId, targetId, before) {
  const groups = [...state.groups];
  const srcIdx = groups.findIndex((g) => g.id === srcId);
  if (srcIdx < 0) return;
  const [src] = groups.splice(srcIdx, 1);
  const tIdx = groups.findIndex((g) => g.id === targetId);
  groups.splice(tIdx < 0 ? groups.length : (before ? tIdx : tIdx + 1), 0, src);
  state.groups = groups;
  await sendMsg({ type: 'REORDER_STATE', mocks: state.mocks, groups });
  render();
}

// ── Import / Export ───────────────────────────────────────────────────────
let pendingImport = null;

function bindImportExport() {
  q('#btn-export').addEventListener('click', exportMocks);
  q('#btn-import').addEventListener('click', () => { q('#import-file').value = ''; q('#import-file').click(); });

  q('#import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!Array.isArray(data.mocks)) throw new Error('bad format');
        showImportDialog(data);
      } catch (_) {
        showConfirm('Invalid file: expected JSON with a "mocks" array.', () => {});
      }
    };
    reader.readAsText(file);
  });

  q('#import-cancel').addEventListener('click', () => {
    q('#import-overlay').classList.add('hidden');
    pendingImport = null;
  });
  q('#import-replace').addEventListener('click', () => doImport('replace'));
  q('#import-merge').addEventListener('click', () => doImport('merge'));
}

function exportMocks() {
  const data = { version: 1, exportedAt: new Date().toISOString(), mocks: state.mocks, groups: state.groups || [] };
  downloadJSON(data, `api-mock-export-${Date.now()}.json`);
}

function exportGroup(group) {
  const mocks = state.mocks.filter((m) => m.groupId === group.id);
  const slug = group.name.replace(/[^a-z0-9]/gi, '-').slice(0, 40).replace(/-+$/, '');
  downloadJSON({ version: 1, exportedAt: new Date().toISOString(), mocks, groups: [group] }, `group-${slug}.json`);
}

function exportSingleMock(mock) {
  const slug = (mock.label || mock.url || 'mock').replace(/[^a-z0-9]/gi, '-').slice(0, 40).replace(/-+$/, '');
  downloadJSON({ version: 1, exportedAt: new Date().toISOString(), mocks: [mock], groups: [] }, `mock-${slug}.json`);
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

function showImportDialog(data) {
  pendingImport = data;
  const mc = data.mocks.length;
  const gc = (data.groups || []).length;
  q('#import-summary').textContent =
    `Found ${mc} mock${mc !== 1 ? 's' : ''}${gc ? ` and ${gc} group${gc !== 1 ? 's' : ''}` : ''}`;

  // Populate group selector with current groups
  const sel = q('#import-group-select');
  while (sel.options.length > 2) sel.remove(2); // keep __keep__ and ungrouped
  (state.groups || []).forEach((g) => sel.add(new Option(g.name, g.id)));
  // Only show "keep original grouping" if file has group info
  sel.options[0].hidden = gc === 0;
  sel.value = gc > 0 ? '__keep__' : '';

  q('#import-overlay').classList.remove('hidden');
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + Math.random().toString(36).slice(2, 5);
}

async function doImport(mode) {
  q('#import-overlay').classList.add('hidden');
  if (!pendingImport) return;

  const groupTarget = q('#import-group-select').value; // '__keep__' | '' | groupId
  let mocks = (pendingImport.mocks || []).map((m) => ({ ...m }));
  let fileGroups = (pendingImport.groups || []).map((g) => ({ ...g }));

  if (mode === 'merge') {
    if (groupTarget === '__keep__') {
      // Keep file's groups, remap IDs to avoid collisions
      const idMap = {};
      fileGroups = fileGroups.map((g) => {
        const newId = genId(); idMap[g.id] = newId;
        return { ...g, id: newId };
      });
      mocks = mocks.map((m) => ({
        ...m, id: genId(),
        groupId: m.groupId ? (idMap[m.groupId] || null) : null,
      }));
      mocks = [...state.mocks, ...mocks];
      fileGroups = [...(state.groups || []), ...fileGroups];
    } else {
      // Override all imported mocks to go into selected group (or ungrouped)
      mocks = mocks.map((m) => ({ ...m, id: genId(), groupId: groupTarget || null }));
      mocks = [...state.mocks, ...mocks];
      fileGroups = [...(state.groups || [])]; // don't add file's groups
    }
  } else {
    // Replace: clear everything and load from file
    if (groupTarget !== '__keep__') {
      mocks = mocks.map((m) => ({ ...m, groupId: groupTarget || null }));
      fileGroups = []; // discard file groups since we're overriding assignment
    }
  }

  const res = await sendMsg({ type: 'IMPORT_STATE', mocks, groups: fileGroups });
  state = res.state; state.groups = state.groups || [];
  expandedId = null;
  pendingImport = null;
  render();
}

init();
