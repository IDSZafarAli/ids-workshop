import {captureDomSnapshot} from './dom-snapshot';
import {RingBuffer} from './ring-buffer';
import type {ConsoleEvent, DomSnapshot, Finding, NetworkEvent, UserContext} from './types';

declare global {
  interface Window {
    __doctorContext?: UserContext;
    __doctorSync?: () => Promise<void>;
    __DOCTOR_URL__?: string;
  }
}

let _sidecarUrl = 'http://localhost:3999';
let _sessionId = '';
let _eventCounter = 0;
let _syncPending = false;
const _latestRuntimeContext: Record<string, unknown> = {};
let _initialized = false;
const maxEvents = 20;

const _network = new RingBuffer<NetworkEvent>(maxEvents);
const _console = new RingBuffer<ConsoleEvent>(maxEvents);

export function getSidecarUrl(): string {
  return _sidecarUrl;
}

export function getNetworkEvents(): NetworkEvent[] {
  return _network.getAll();
}

export function getConsoleEvents(): ConsoleEvent[] {
  return _console.getAll();
}

export function clearTelemetry(): void {
  _network.clear();
  _console.clear();
  notifyTelemetryChanged();
}

function buildSessionId(): string {
  const now = new Date();
  const date = now.toLocaleDateString('en-CA');
  const h = now.getHours();
  const m = now.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${date}_${h12.toString().padStart(2, '0')}-${m}${ampm}`;
}

function toHuman(ts: number): string {
  return new Date(ts).toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

function nextId(prefix: string): string {
  return `${prefix}_${_sessionId}_${++_eventCounter}`;
}

function getUserContext(): UserContext {
  const runtime = _latestRuntimeContext as {auth?: unknown; location?: unknown};
  const auth = runtime.auth as {userId?: string | null} | undefined;
  const location = runtime.location as
    | {
        locationId?: string | null;
        locationName?: string | null;
        currentLocation?: {
          locationId?: string | null;
          displayName?: string | null;
          name?: string | null;
        };
      }
    | undefined;
  const runtimeLocationId = location?.locationId ?? location?.currentLocation?.locationId ?? '';
  const runtimeLocationName =
    location?.locationName ??
    location?.currentLocation?.displayName ??
    location?.currentLocation?.name ??
    '';
  if (auth?.userId || runtimeLocationId || runtimeLocationName) {
    return {
      userId: auth?.userId ?? '',
      locationId: runtimeLocationId,
      locationName: runtimeLocationName,
    };
  }

  const direct = window.__doctorContext;
  if (direct?.userId || direct?.locationId || direct?.locationName) {
    return {
      userId: direct.userId ?? '',
      locationId: direct.locationId ?? '',
      locationName: direct.locationName ?? '',
    };
  }

  const lastNetworkContext = _network
    .getAll()
    .slice()
    .reverse()
    .find((event) => event.userId || event.locationId || event.locationName);

  return {
    userId: lastNetworkContext?.userId ?? '',
    locationId: lastNetworkContext?.locationId ?? '',
    locationName: lastNetworkContext?.locationName ?? '',
  };
}

export function getDomSnapshot(): DomSnapshot {
  return captureDomSnapshot();
}

function decodeJwtSub(token: string): string {
  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as Record<string, unknown>;
    return (payload['sub'] as string) ?? '';
  } catch {
    return '';
  }
}

function detectHighSeverity(event: NetworkEvent): boolean {
  const all = _network.getAll();
  const prev = all.at(-2);
  if (prev && prev.status === 401 && event.status === 201 && prev.url === event.url) {
    return true;
  }
  if (
    event.method === 'POST' &&
    event.status === 201 &&
    (event.reqBody as Record<string, unknown>)?.['locationId'] === ''
  ) {
    return true;
  }
  return false;
}

function notifyTelemetryChanged(): void {
  window.dispatchEvent(new CustomEvent('ids-doctor:telemetry'));
}

function captureSnapshot(): object {
  const ctx = getUserContext();
  const doctorHost = document.getElementById('ids-doctor-host');
  const visibleText = [...document.body.children]
    .filter((el) => el !== doctorHost)
    .map((el) => (el as HTMLElement).innerText ?? '')
    .join('\n')
    .slice(0, 2000);

  const errorElements = [...document.querySelectorAll('[role="alert"], .Mui-error, .error')]
    .filter((el) => !doctorHost?.contains(el))
    .map((el) => el.textContent?.trim())
    .filter(Boolean);

  return {
    ts: toHuman(Date.now()),
    url: window.location.href,
    title: document.title,
    user: ctx.userId ? ctx : null,
    visibleText,
    errorElements,
  };
}

type SyncOpts = {
  includeDomSnapshot?: boolean;
  networkFilter?: 'all' | 'fails';
};

function tryWindowRuntime(): Record<string, unknown> {
  const r = (window as {__idsDoctorRuntime?: Record<string, () => unknown>}).__idsDoctorRuntime;
  if (!r) {
    return {};
  }
  return {
    auth: r['getAuthSnapshot']?.(),
    location: r['getLocationSnapshot']?.(),
    theme: r['getThemeSnapshot']?.(),
  };
}

function extractLocationIdFromUrl(url: string): string {
  try {
    return new URL(url, window.location.origin).searchParams.get('locationId') ?? '';
  } catch {
    return '';
  }
}

function seedRuntimeContextFromUrl(url: string): void {
  if ((_latestRuntimeContext['location'] as {locationId?: string} | undefined)?.locationId) {
    return;
  }
  const locationId = extractLocationIdFromUrl(url);
  if (locationId) {
    _latestRuntimeContext['location'] = {locationId};
  }
}

export async function syncToSidecar(force = false, opts: SyncOpts = {}): Promise<Finding[]> {
  const {includeDomSnapshot = false, networkFilter = 'all'} = opts;
  if (_syncPending && !force) {
    return [];
  }
  _syncPending = true;
  try {
    const snapshot = captureSnapshot();
    const domSnapshot = includeDomSnapshot ? captureDomSnapshot() : undefined;
    const allEvents = _network.getLast(maxEvents);
    const networkEvents =
      networkFilter === 'fails'
        ? allEvents.filter((e) => e.status === 0 || e.status >= 400)
        : allEvents;
    const rawContext =
      Object.keys(_latestRuntimeContext).length > 0 ? _latestRuntimeContext : tryWindowRuntime();
    const runtimeContext = Object.keys(rawContext).length > 0 ? rawContext : undefined;
    const res = await fetch(`${_sidecarUrl}/telemetry/events`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        sessionId: _sessionId,
        networkEvents,
        consoleEvents: _console.getLast(maxEvents),
        snapshot,
        runtimeContext,
        domSnapshot,
      }),
    });
    if (!res.ok) {
      throw new Error(`IDS Doctor sidecar returned ${res.status}`);
    }
    const data = (await res.json()) as {findings?: Finding[]};
    return data.findings ?? [];
  } catch {
    throw new Error('IDS Doctor sidecar is offline or unreachable');
  } finally {
    _syncPending = false;
  }
}

export async function writeDomSnapshotToSidecar(): Promise<void> {
  const domSnapshot = captureDomSnapshot();
  const res = await fetch(`${_sidecarUrl}/dom-snapshot`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(domSnapshot),
  });
  if (!res.ok) {
    throw new Error(`IDS Doctor sidecar returned ${res.status}`);
  }
}

export function initialize(sidecarUrl: string): void {
  _sidecarUrl = sidecarUrl;
  if (_initialized) {
    return;
  }
  _initialized = true;
  _sessionId = buildSessionId();

  const origFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input instanceof Request ? input.url : input);
    const isSidecar = url.startsWith(_sidecarUrl);
    const isRelativeApi = url.startsWith('/api');
    const method = (init?.method ?? 'GET').toUpperCase();
    // Skip sidecar calls, non-API calls, and CORS preflight requests
    if (isSidecar || (!url.includes('/api') && !isRelativeApi) || method === 'OPTIONS') {
      return origFetch(input, init);
    }

    const start = Date.now();
    let res: Response;
    try {
      res = await origFetch(input, init);
    } catch (error) {
      const isAbort =
        (error as {name?: string})?.name === 'AbortError' || init?.signal?.aborted === true;
      const ctx = getUserContext();
      _network.push({
        id: nextId('net'),
        sessionId: _sessionId,
        ts: start,
        tsHuman: toHuman(start),
        method,
        url,
        status: 0,
        requestHeaders: {},
        reqBody: null,
        resBody: isAbort ? 'Aborted' : ((error as {message?: string})?.message ?? 'Network error'),
        durationMs: Date.now() - start,
        aborted: isAbort || undefined,
        userId: ctx.userId,
        locationId: ctx.locationId,
        locationName: ctx.locationName,
      });
      notifyTelemetryChanged();
      throw error;
    }
    const clone = res.clone();

    void clone
      .json()
      .catch(() => null)
      .then(async (resBody) => {
        const rawBody = init?.body;
        let reqBody: unknown = null;
        if (typeof rawBody === 'string') {
          try {
            reqBody = JSON.parse(rawBody);
          } catch {
            reqBody = rawBody;
          }
        }

        const headers = init?.headers ?? {};
        const headersRecord: Record<string, string> =
          headers instanceof Headers
            ? Object.fromEntries(headers.entries())
            : (headers as Record<string, string>);

        seedRuntimeContextFromUrl(url);

        const authHeader = headersRecord['Authorization'] ?? headersRecord['authorization'] ?? '';
        const userId = authHeader.startsWith('Bearer ')
          ? decodeJwtSub(authHeader.slice(7))
          : getUserContext().userId;

        const ctx = getUserContext();
        const event: NetworkEvent = {
          id: nextId('net'),
          sessionId: _sessionId,
          ts: start,
          tsHuman: toHuman(start),
          method,
          url,
          status: res.status,
          requestHeaders: headersRecord,
          reqBody,
          resBody,
          durationMs: Date.now() - start,
          userId,
          locationId: ctx.locationId,
          locationName: ctx.locationName,
        };

        _network.push(event);
        notifyTelemetryChanged();

        if (detectHighSeverity(event)) {
          void syncToSidecar(true);
        }
      });

    return res;
  };

  const origError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    origError(...args);
    _console.push({
      id: nextId('con'),
      sessionId: _sessionId,
      ts: Date.now(),
      tsHuman: toHuman(Date.now()),
      level: 'error',
      message: args.map(String).join(' ').slice(0, 500),
    });
    notifyTelemetryChanged();
  };

  const origWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    origWarn(...args);
    _console.push({
      id: nextId('con'),
      sessionId: _sessionId,
      ts: Date.now(),
      tsHuman: toHuman(Date.now()),
      level: 'warn',
      message: args.map(String).join(' ').slice(0, 500),
    });
    notifyTelemetryChanged();
  };

  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    _console.push({
      id: nextId('rej'),
      sessionId: _sessionId,
      ts: Date.now(),
      tsHuman: toHuman(Date.now()),
      level: 'rejection',
      message: String(e.reason?.message ?? e.reason ?? 'Unhandled rejection').slice(0, 500),
      stack: String(e.reason?.stack ?? '').slice(0, 500) || undefined,
    });
    notifyTelemetryChanged();
  });

  window.__doctorSync = () => syncToSidecar(true).then(() => undefined);
}
