import type {EvalCheck, EvalTaskResult} from './types.js';

type NetworkEvidence = {
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

type DoctorEvidence = {
  sessionId: string;
  networkEvents: NetworkEvidence[];
  consoleEvents: Array<{
    id: string;
    sessionId: string;
    ts: number;
    tsHuman: string;
    level: 'error' | 'warn' | 'rejection';
    message: string;
    stack?: string;
  }>;
  snapshot: {
    ts: string;
    url: string;
    title: string;
    user: {userId: string; locationId: string; locationName: string} | null;
    visibleText: string;
    errorElements: string[];
  };
  runtimeContext: Record<string, unknown>;
};

type RunRules = (evidence: DoctorEvidence) => Array<{
  ruleId: string;
  severity: string;
  title: string;
}>;

function baseEvidence(overrides: Partial<DoctorEvidence>): DoctorEvidence {
  return {
    sessionId: 'eval-session',
    networkEvents: [],
    consoleEvents: [],
    snapshot: {
      ts: '2026-05-11T00:00:00.000Z',
      url: 'http://localhost:3004/parts',
      title: 'IDS Workshop',
      user: {userId: 'user-1', locationId: 'locations/LOC_AAA', locationName: 'LOC AAA'},
      visibleText: 'Parts',
      errorElements: [],
    },
    runtimeContext: {},
    ...overrides,
  };
}

function expectRule(
  runRules: RunRules,
  taskId: string,
  title: string,
  evidence: DoctorEvidence,
  ruleId: string,
) {
  const findings = runRules(evidence);
  const matched = findings.some((finding) => finding.ruleId === ruleId);
  const check: EvalCheck = {
    name: `detects ${ruleId}`,
    passed: matched,
    score: matched ? 1 : 0,
    maxScore: 1,
    summary: matched
      ? `Doctor emitted ${ruleId}`
      : `Doctor missed ${ruleId}; emitted ${findings.map((f) => f.ruleId).join(', ') || 'none'}`,
    details: findings.map((f) => `${f.severity}: ${f.title}`),
  };
  return buildTask(taskId, title, [check]);
}

function expectNoFindings(
  runRules: RunRules,
  taskId: string,
  title: string,
  evidence: DoctorEvidence,
) {
  const findings = runRules(evidence);
  const passed = findings.length === 0;
  const check: EvalCheck = {
    name: 'clean fixture stays quiet',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    summary: passed ? 'Doctor emitted no findings' : 'Doctor emitted unexpected findings',
    details: findings.map((f) => `${f.ruleId}: ${f.title}`),
  };
  return buildTask(taskId, title, [check]);
}

function buildTask(taskId: string, title: string, checks: EvalCheck[]): EvalTaskResult {
  const score = checks.reduce((sum, check) => sum + check.score, 0);
  const maxScore = checks.reduce((sum, check) => sum + check.maxScore, 0);
  return {taskId, track: 'doctor', title, score, maxScore, checks};
}

export async function runDoctorTrack(): Promise<EvalTaskResult[]> {
  const doctorRuleModulePath = '../../../astra-dev-doctor/src/rules/rule-catalog.ts';
  const doctorRules = (await import(doctorRuleModulePath)) as {runRules: RunRules};
  const {runRules} = doctorRules;
  const tokenRetry = baseEvidence({
    networkEvents: [
      {
        id: 'n1',
        sessionId: 'eval-session',
        ts: 1000,
        tsHuman: '12:00:01 AM',
        method: 'POST',
        url: '/api/part',
        status: 401,
        requestHeaders: {},
        reqBody: {locationId: 'locations/LOC_AAA'},
        resBody: null,
        durationMs: 20,
        userId: 'user-1',
        locationId: 'locations/LOC_AAA',
        locationName: 'LOC AAA',
      },
      {
        id: 'n2',
        sessionId: 'eval-session',
        ts: 2500,
        tsHuman: '12:00:02 AM',
        method: 'POST',
        url: '/api/part',
        status: 201,
        requestHeaders: {},
        reqBody: {locationId: ''},
        resBody: null,
        durationMs: 35,
        userId: 'user-1',
        locationId: 'locations/LOC_AAA',
        locationName: 'LOC AAA',
      },
    ],
  });

  const layoutEvidence = baseEvidence({
    snapshot: {
      ts: '2026-05-11T00:00:00.000Z',
      url: 'http://localhost:3004/parts',
      title: 'IDS Workshop',
      user: {userId: 'user-1', locationId: 'locations/LOC_AAA', locationName: 'LOC AAA'},
      visibleText: 'Application error',
      errorElements: ['Application error', 'ResizeObserver loop completed'],
    },
    networkEvents: [
      {
        id: 'n3',
        sessionId: 'eval-session',
        ts: 1000,
        tsHuman: '12:00:01 AM',
        method: 'GET',
        url: '/api/part/MISSING',
        status: 404,
        requestHeaders: {},
        reqBody: null,
        resBody: null,
        durationMs: 20,
        userId: 'user-1',
        locationId: 'locations/LOC_AAA',
        locationName: 'LOC AAA',
      },
    ],
  });

  return [
    expectRule(
      runRules,
      'doctor-token-retry-race',
      'Doctor detects auth retry race from network evidence',
      tokenRetry,
      'token_retry_race',
    ),
    expectRule(
      runRules,
      'doctor-unhandled-not-found',
      'Doctor connects 404 response to visible error boundary',
      layoutEvidence,
      'unhandled_not_found',
    ),
    expectNoFindings(
      runRules,
      'doctor-clean-fixture',
      'Doctor stays quiet on clean evidence',
      baseEvidence({}),
    ),
  ];
}
