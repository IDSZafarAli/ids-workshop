export type NetworkEvent = {
  id: string;
  sessionId: string;
  ts: number;
  tsHuman: string;
  method: string;
  url: string;
  status: number;
  requestHeaders: Record<string, string>;
  reqBody: unknown;
  resBody: unknown;
  durationMs: number;
  userId: string;
  locationId: string;
  locationName: string;
};

export type ConsoleEvent = {
  id: string;
  sessionId: string;
  ts: number;
  tsHuman: string;
  level: 'error' | 'warn' | 'rejection';
  message: string;
  stack?: string;
};

export type Finding = {
  id: string;
  ruleId: string;
  severity: 'high' | 'medium' | 'info';
  ts: string;
  title: string;
  explanation: string;
  url?: string;
  nextChecks: string[];
  likelyFiles: string[];
};

export type UserContext = {userId: string; locationId: string; locationName: string};

export type RuntimeQuerySummary = {
  queryHash: string;
  queryKey: unknown;
  status: string;
  fetchStatus: string;
  failureCount: number;
  isInvalidated: boolean;
  observers: number;
  dataUpdatedAt: number;
  errorUpdatedAt: number;
  error?: string;
};

export type RuntimeMutationSummary = {
  mutationKey?: unknown;
  status: string;
  failureCount: number;
  submittedAt: number;
  error?: string;
};

export type RuntimeContextSnapshot = {
  auth?: unknown;
  location?: unknown;
  theme?: unknown;
  network?: unknown;
  queries?: RuntimeQuerySummary[];
  mutations?: RuntimeMutationSummary[];
};

export type DoctorRuntime = {
  getAuthSnapshot?: () => unknown;
  getLocationSnapshot?: () => unknown;
  getThemeSnapshot?: () => unknown;
  getNetworkSnapshot?: () => unknown;
  getQuerySnapshot?: () => RuntimeQuerySummary[];
  getMutationSnapshot?: () => RuntimeMutationSummary[];
  subscribe?: (listener: () => void) => () => void;
};

export type DomSnapshotNode = {
  tag: string;
  role: string;
  name: string;
  text: string;
  selector: string;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  attrs: Record<string, string>;
  styles: Record<string, string>;
  children: DomSnapshotNode[];
};

export type DomSnapshot = {
  capturedAt: string;
  url: string;
  title: string;
  viewport: {width: number; height: number};
  document: {scrollWidth: number; scrollHeight: number};
  focusedElement: DomSnapshotNode | null;
  highlighted: DomSnapshotNode[];
  tree: DomSnapshotNode[];
};
