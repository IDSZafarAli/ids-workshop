import type {
  ConsoleEventDto,
  NetworkEventDto,
  SnapshotDto,
} from '../telemetry/dto/telemetry-event.dto';

export type DoctorEvidence = {
  sessionId: string;
  networkEvents: NetworkEventDto[];
  consoleEvents: ConsoleEventDto[];
  snapshot: SnapshotDto;
  runtimeContext: Record<string, unknown>;
};

export type DoctorFinding = {
  id: string;
  ruleId: string;
  severity: 'high' | 'medium' | 'info';
  ts: string;
  title: string;
  explanation: string;
  url?: string;
  nextChecks: string[];
  likelyFiles: string[];
  sessionId: string;
  userId: string;
  locationId: string;
  locationName: string;
};

export type DoctorRule = {
  id: string;
  severity: 'high' | 'medium' | 'info';
  detect(evidence: DoctorEvidence): DoctorFinding[];
};

export function nowHuman(): string {
  return new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

export function makeFinding(
  ruleId: string,
  severity: DoctorFinding['severity'],
  title: string,
  explanation: string,
  evidence: DoctorEvidence,
  extra: Partial<Pick<DoctorFinding, 'url' | 'nextChecks' | 'likelyFiles'>> = {},
): DoctorFinding {
  const ctx = evidence.networkEvents[0] ?? {userId: '', locationId: '', locationName: ''};
  return {
    id: `${ruleId}_${Date.now()}`,
    ruleId,
    severity,
    ts: nowHuman(),
    title,
    explanation,
    url: extra.url,
    nextChecks: extra.nextChecks ?? [],
    likelyFiles: extra.likelyFiles ?? [],
    sessionId: evidence.sessionId,
    userId: ctx.userId,
    locationId: ctx.locationId,
    locationName: ctx.locationName,
  };
}
