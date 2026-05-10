import {
  clearTelemetry,
  getConsoleEvents,
  getNetworkEvents,
  syncToSidecar,
  writeDomSnapshotToSidecar,
} from './doctor-sdk';
import type {ConsoleEvent, NetworkEvent} from './types';

const css = `
  :host, * { box-sizing: border-box; }
  .doctor { position: fixed; z-index: 2147483647; font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #ecf4ff; }
  .fab { width: 46px; height: 46px; border-radius: 999px; border: 1px solid #6bb6ff; background: #07111f; color: #e8f5ff; cursor: grab; box-shadow: 0 12px 34px rgba(0,0,0,.55), 0 0 0 2px rgba(107,182,255,.18); font-size: 22px; line-height: 1; display: flex; align-items: center; justify-content: center; position: relative; }
  .fab.warn { border-color: #ffb020; box-shadow: 0 0 0 3px rgba(255,176,32,.28), 0 12px 34px rgba(0,0,0,.55); }
  .badge { position: absolute; top: -6px; right: -6px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; background: #ff3b30; color: white; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 800; border: 1px solid #fff; }
  .panel { position: absolute; right: 0; bottom: 58px; width: 560px; max-width: min(560px, calc(100vw - 32px)); max-height: min(78vh, 720px); display: flex; flex-direction: column; background: #07111f; color: #e6edf7; border: 1px solid #29415f; border-radius: 8px; box-shadow: 0 18px 54px rgba(0,0,0,.62); overflow: hidden; }
  .header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; background: #0e2035; border-bottom: 1px solid #29415f; cursor: grab; user-select: none; }
  .title { color: #8bd0ff; font-weight: 800; letter-spacing: .04em; }
  .actions { display: flex; gap: 8px; align-items: center; }
  button { font: inherit; border-radius: 6px; border: 1px solid #355778; background: #10243a; color: #e6edf7; padding: 0 8px; height: 26px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
  button:hover { background: #183452; }
  button:disabled { opacity: .62; cursor: wait; pointer-events: none; }
  .btn-icon { width: 26px; padding: 0; justify-content: center; font-size: 14px; flex-shrink: 0; }
  label { display: flex; gap: 6px; align-items: center; color: #b9c8da; cursor: pointer; }
  .status { padding: 7px 12px; border-bottom: 1px solid #1f334d; background: #091827; }
  .status.ok { color: #75e596; }
  .status.warn { color: #ffca63; }
  .status.error { color: #ff8a80; }
  .tabs { display: flex; overflow-x: auto; background: #091827; border-bottom: 1px solid #29415f; }
  .tab { border: 0; border-right: 1px solid #1f334d; border-radius: 0; background: transparent; color: #9fb0c4; padding: 5px 10px; height: 30px; white-space: nowrap; }
  .tab.active { color: #9bd6ff; background: #10243a; box-shadow: inset 0 -2px #6bb6ff; }
  .content { overflow: auto; min-height: 220px; }
  .row { padding: 8px 12px; border-bottom: 1px solid #18314c; }
  .row:hover { background: #0c1d30; }
  .meta { display: flex; gap: 8px; align-items: baseline; min-width: 0; }
  .pill { font-size: 10px; padding: 1px 5px; border-radius: 999px; background: #173452; color: #9bd6ff; flex-shrink: 0; }
  .ok { color: #75e596; }
  .warn { color: #ffca63; }
  .bad { color: #ff8a80; }
  .muted { color: #7f91a8; }
  .url { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .empty { padding: 32px 16px; color: #74879d; text-align: center; }
  pre { margin: 0; white-space: pre-wrap; word-break: break-word; color: #cad8e8; }
  .settings { padding: 14px; display: flex; flex-direction: column; gap: 16px; }
  .setting-group { display: flex; flex-direction: column; gap: 6px; }
  .setting-group h4 { margin: 0 0 2px; color: #9bd6ff; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; }
  .toggle-row { display: flex; gap: 4px; }
  .btn-seg { background: #091827; border-color: #1f334d; color: #7f91a8; }
  .btn-seg.active { background: #1a3a5c; border-color: #6bb6ff; color: #9bd6ff; }
`;

type Tab = 'network' | 'console' | 'settings';

const POS_KEY = 'ids-doctor-position';
const NET_KEY = 'ids-doctor-network-filter';
const DOM_KEY = 'ids-doctor-include-dom';

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function statusCls(code: number): string {
  return code === 0 || code >= 500 ? 'bad' : code >= 400 ? 'warn' : 'ok';
}

function loadPos(): {right: number; bottom: number} {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) ?? '') as {right: unknown; bottom: unknown};
    if (typeof p.right === 'number' && typeof p.bottom === 'number') {
      return p as {right: number; bottom: number};
    }
  } catch {
    /* ignored */
  }
  return {right: 24, bottom: 24};
}

export function createPanel(shadow: ShadowRoot): void {
  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  shadow.appendChild(styleEl);

  const root = document.createElement('div');
  root.className = 'doctor';
  shadow.appendChild(root);

  let open = false;
  let tab: Tab = 'network';
  let busy = false;
  let statusKind: 'ok' | 'warn' | 'error' | '' = '';
  let statusText = '';
  let networkFilter: 'all' | 'fails' =
    (localStorage.getItem(NET_KEY) as 'all' | 'fails' | null) ?? 'all';
  let includeDom = localStorage.getItem(DOM_KEY) === 'true';
  let wasDragged = false;
  let pos = loadPos();

  root.style.right = `${pos.right}px`;
  root.style.bottom = `${pos.bottom}px`;

  function movePos(p: {right: number; bottom: number}): void {
    pos = p;
    root.style.right = `${p.right}px`;
    root.style.bottom = `${p.bottom}px`;
  }

  function render(): void {
    const network = getNetworkEvents();
    const cons = getConsoleEvents();
    const issues =
      network.filter((e) => e.status === 0 || e.status >= 400).length +
      cons.filter((e) => e.level === 'error' || e.level === 'rejection').length;

    const fab = `<button class="fab${issues > 0 ? ' warn' : ''}" data-action="toggle">🩺${issues > 0 ? `<span class="badge">${issues}</span>` : ''}</button>`;

    if (!open) {
      root.innerHTML = fab;
      return;
    }

    let content: string;
    if (tab === 'network') {
      content = renderNetwork(network);
    } else if (tab === 'console') {
      content = renderConsole(cons);
    } else {
      content = renderSettings();
    }

    root.innerHTML = `
      <section class="panel">
        <header class="header" data-drag>
          <span class="title">IDS DOCTOR</span>
          <div class="actions">
            <button data-action="sync"${busy ? ' disabled' : ''}>⬆ Sync</button>
            <button data-action="capture-dom"${busy ? ' disabled' : ''}>📷 DOM</button>
            <button data-action="clear">🗑 Clear</button>
            <button class="btn-icon" data-action="reset-pos" title="Reset position">⤡</button>
            <button class="btn-icon" data-action="close" title="Close">✕</button>
          </div>
        </header>
        ${statusText ? `<div class="status ${statusKind}">${esc(statusText)}</div>` : ''}
        <nav class="tabs">
          <button class="tab${tab === 'network' ? ' active' : ''}" data-action="tab-network">Network (${network.length})</button>
          <button class="tab${tab === 'console' ? ' active' : ''}" data-action="tab-console">Console (${cons.length})</button>
          <button class="tab${tab === 'settings' ? ' active' : ''}" data-action="tab-settings">⚙ Settings</button>
        </nav>
        <main class="content">${content}</main>
      </section>
      ${fab}`;

    root.querySelector('[data-drag]')?.addEventListener('pointerdown', onDragStart);
  }

  function renderNetwork(network: NetworkEvent[]): string {
    const evs =
      networkFilter === 'fails'
        ? network.filter((e) => e.status === 0 || e.status >= 400)
        : network;
    if (evs.length === 0) {
      return '<div class="empty">No API calls captured yet.</div>';
    }
    return evs
      .slice()
      .reverse()
      .map(
        (e) =>
          `<div class="row"><div class="meta"><span class="pill">${esc(e.method)}</span><span class="${statusCls(e.status)}">${esc(e.status)}</span><span class="url">${esc(e.url)}</span><span class="muted">${esc(e.durationMs)}ms</span></div></div>`,
      )
      .join('');
  }

  function renderConsole(cons: ConsoleEvent[]): string {
    if (cons.length === 0) {
      return '<div class="empty">No console errors captured yet.</div>';
    }
    return cons
      .slice()
      .reverse()
      .map(
        (e) =>
          `<div class="row"><div class="${e.level === 'error' ? 'bad' : 'warn'}">${esc(e.level.toUpperCase())} <span class="muted">${esc(e.tsHuman)}</span></div><pre>${esc(e.message)}</pre></div>`,
      )
      .join('');
  }

  function renderSettings(): string {
    return `<div class="settings">
      <div class="setting-group">
        <h4>Network sync</h4>
        <div class="toggle-row">
          <button class="btn-seg${networkFilter === 'all' ? ' active' : ''}" data-action="filter-all">All requests</button>
          <button class="btn-seg${networkFilter === 'fails' ? ' active' : ''}" data-action="filter-fails">Fails only</button>
        </div>
        <span class="muted">Panel always shows all captured requests.</span>
      </div>
      <div class="setting-group">
        <h4>DOM snapshot</h4>
        <label><input type="checkbox" data-action="dom-toggle"${includeDom ? ' checked' : ''}> Include on every Sync</label>
        <span class="muted">Use 📷 DOM for an explicit one-off capture.</span>
      </div>
    </div>`;
  }

  // Persistent event delegation — survives innerHTML resets since it's on root itself
  root.addEventListener('click', (e) => {
    if (wasDragged) {
      wasDragged = false;
      return;
    }
    const action = (e.target as Element).closest('[data-action]')?.getAttribute('data-action');
    if (!action) {
      return;
    }
    switch (action) {
      case 'toggle':
        open = !open;
        render();
        break;
      case 'close':
        open = false;
        render();
        break;
      case 'sync':
        void doSync();
        break;
      case 'capture-dom':
        void doCaptureDom();
        break;
      case 'clear':
        clearTelemetry();
        statusText = 'Cleared captured network and console logs.';
        statusKind = 'ok';
        render();
        break;
      case 'reset-pos':
        movePos({right: 24, bottom: 24});
        localStorage.removeItem(POS_KEY);
        break;
      case 'tab-network':
        tab = 'network';
        render();
        break;
      case 'tab-console':
        tab = 'console';
        render();
        break;
      case 'tab-settings':
        tab = 'settings';
        render();
        break;
      case 'filter-all':
        networkFilter = 'all';
        localStorage.setItem(NET_KEY, 'all');
        render();
        break;
      case 'filter-fails':
        networkFilter = 'fails';
        localStorage.setItem(NET_KEY, 'fails');
        render();
        break;
    }
  });

  root.addEventListener('change', (e) => {
    if ((e.target as Element).getAttribute('data-action') === 'dom-toggle') {
      includeDom = (e.target as HTMLInputElement).checked;
      localStorage.setItem(DOM_KEY, includeDom ? 'true' : 'false');
    }
  });

  // FAB drag via delegation on root
  root.addEventListener('pointerdown', (e) => {
    if ((e.target as Element).closest('.fab')) {
      onDragStart(e);
    }
  });

  function onDragStart(e: Event): void {
    const pe = e as PointerEvent;
    const startX = pe.clientX;
    const startY = pe.clientY;
    const startPos = {...pos};
    let moved = false;

    function onMove(mv: PointerEvent): void {
      const dx = mv.clientX - startX;
      const dy = mv.clientY - startY;
      if (!moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) {
        return;
      }
      moved = true;
      wasDragged = true;
      movePos({
        right: Math.max(12, startPos.right - dx),
        bottom: Math.max(12, startPos.bottom - dy),
      });
    }

    function onUp(): void {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (moved) {
        localStorage.setItem(POS_KEY, JSON.stringify(pos));
      }
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  async function doSync(): Promise<void> {
    busy = true;
    statusKind = 'warn';
    statusText = includeDom ? 'Syncing with DOM snapshot...' : 'Syncing telemetry...';
    render();
    try {
      await syncToSidecar(true, {includeDomSnapshot: includeDom, networkFilter});
      statusText = includeDom
        ? 'Synced. DOM snapshot and report written.'
        : 'Synced. Report written.';
      statusKind = 'ok';
    } catch (err) {
      statusText = err instanceof Error ? err.message : 'Sync failed';
      statusKind = 'error';
    } finally {
      busy = false;
      render();
    }
  }

  async function doCaptureDom(): Promise<void> {
    busy = true;
    statusKind = 'warn';
    statusText = 'Capturing DOM snapshot...';
    render();
    try {
      await writeDomSnapshotToSidecar();
      statusText = 'DOM snapshot written to .doctor/latest-dom-snapshot.*';
      statusKind = 'ok';
    } catch (err) {
      statusText = err instanceof Error ? err.message : 'DOM capture failed';
      statusKind = 'error';
    } finally {
      busy = false;
      render();
    }
  }

  window.addEventListener('ids-doctor:telemetry', render);
  window.setInterval(render, 3000);

  render();
}
