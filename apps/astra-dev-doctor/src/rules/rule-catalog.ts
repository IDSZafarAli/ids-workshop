import type {DoctorEvidence, DoctorFinding, DoctorRule} from './doctor-rule';
import {makeFinding} from './doctor-rule';

const tokenRetryRace: DoctorRule = {
  id: 'token_retry_race',
  severity: 'high',
  detect(ev: DoctorEvidence): DoctorFinding[] {
    const findings: DoctorFinding[] = [];
    const net = ev.networkEvents;
    for (let i = 0; i < net.length - 1; i++) {
      const a = net[i];
      const b = net[i + 1];
      if (a.status === 401 && b.status === 201 && a.url === b.url && b.ts - a.ts < 5000) {
        findings.push(
          makeFinding(
            'token_retry_race',
            'high',
            'Token retry race — 401 → 201 on same endpoint',
            `A request to ${b.url} failed with 401, then immediately succeeded with 201. The retry likely reused a stale auth context — locationId may be empty in the created record.`,
            ev,
            {
              url: b.url,
              nextChecks: [
                'Check the created record: does it have a non-empty locationId?',
                'Check the auth middleware refreshes locationId before the retry.',
              ],
            },
          ),
        );
      }
    }
    return findings;
  },
};

const silentLocationScopeLoss: DoctorRule = {
  id: 'silent_location_scope_loss',
  severity: 'high',
  detect(ev: DoctorEvidence): DoctorFinding[] {
    const findings: DoctorFinding[] = [];
    for (const e of ev.networkEvents) {
      if (
        (e.method === 'POST' || e.method === 'PUT' || e.method === 'PATCH') &&
        e.status >= 200 &&
        e.status < 300 &&
        (e.reqBody as Record<string, unknown>)?.['locationId'] === ''
      ) {
        findings.push(
          makeFinding(
            'silent_location_scope_loss',
            'high',
            'Silent location scope loss — empty locationId on successful write',
            `${e.method} ${e.url} returned ${e.status} but the request body contained an empty locationId. The record was persisted without tenant context — it will be invisible to all tenant-scoped queries.`,
            ev,
            {
              url: e.url,
              nextChecks: [
                'Verify the created/updated record in RavenDB — does it have locationId set?',
                'Check that the auth guard injects locationId before the handler runs.',
              ],
            },
          ),
        );
      }
    }
    return findings;
  },
};

const authLoop: DoctorRule = {
  id: 'auth_loop',
  severity: 'high',
  detect(ev: DoctorEvidence): DoctorFinding[] {
    const unauthorised = ev.networkEvents.filter((e) => e.status === 401);
    if (unauthorised.length >= 3) {
      return [
        makeFinding(
          'auth_loop',
          'high',
          'Auth loop — repeated 401 responses',
          `${unauthorised.length} requests returned 401 in this session. This may indicate a token refresh failure or an auth redirect loop.`,
          ev,
          {
            nextChecks: [
              'Check the browser Network tab for repeated /auth or /callback redirects.',
              'Verify the location token refresh path in LocationProvider.',
            ],
            likelyFiles: [
              'apps/client-web/app/core/contexts/auth/AuthProvider.tsx',
              'apps/client-web/app/core/contexts/location/LocationProvider.tsx',
              'apps/client-web/app/core/kernel/authKernel.ts',
            ],
          },
        ),
      ];
    }
    return [];
  },
};

const apiUnreachable: DoctorRule = {
  id: 'api_unreachable',
  severity: 'high',
  detect(ev: DoctorEvidence): DoctorFinding[] {
    const networkErrors = ev.networkEvents.filter((e) => e.status === 0);
    if (networkErrors.length >= 2) {
      return [
        makeFinding(
          'api_unreachable',
          'high',
          'API unreachable — network errors on multiple requests',
          `${networkErrors.length} requests returned status 0 (network failure). The API server may be down or unreachable.`,
          ev,
          {
            nextChecks: [
              'Run: npm run dev:apis to check if astra-apis is running.',
              'Check Docker containers: docker-compose ps',
            ],
            likelyFiles: ['apps/astra-apis/src/main.ts'],
          },
        ),
      ];
    }
    return [];
  },
};

const unhandledNotFound: DoctorRule = {
  id: 'unhandled_not_found',
  severity: 'medium',
  detect(ev: DoctorEvidence): DoctorFinding[] {
    const notFound = ev.networkEvents.filter((e) => e.status === 404);
    const hasErrorBoundary = ev.snapshot.errorElements.length > 0;
    if (notFound.length > 0 && hasErrorBoundary) {
      const e = notFound[0];
      return [
        makeFinding(
          'unhandled_not_found',
          'medium',
          'Unhandled 404 — error boundary rendered instead of domain not-found state',
          `${e.url} returned 404 and the page shows error elements: "${ev.snapshot.errorElements.slice(0, 2).join(', ')}". The frontend may be treating this 404 as an unhandled error rather than rendering a domain not-found state.`,
          ev,
          {
            url: e.url,
            nextChecks: [
              'Check if the query/loader handles 404 from the API and renders a domain not-found UI.',
              'Check ErrorFallback.tsx — is it catching 404 responses that should be handled gracefully?',
            ],
            likelyFiles: ['apps/client-web/app/components/ErrorFallback.tsx'],
          },
        ),
      ];
    }
    return [];
  },
};

const unhandledValidationError: DoctorRule = {
  id: 'unhandled_validation_error',
  severity: 'medium',
  detect(ev: DoctorEvidence): DoctorFinding[] {
    const badRequest = ev.networkEvents.filter((e) => e.status === 400);
    const hasErrorBoundary = ev.snapshot.errorElements.length > 0;
    if (badRequest.length > 0 && hasErrorBoundary) {
      const e = badRequest[0];
      return [
        makeFinding(
          'unhandled_validation_error',
          'medium',
          'Unhandled 400 — generic error instead of field-level validation',
          `${e.url} returned 400 and the page shows generic error elements. The frontend may not be surfacing field-level validation messages from the API response.`,
          ev,
          {
            url: e.url,
            nextChecks: [
              'Check if the form handles the 400 Problem Details response and maps errors to fields.',
              'Check the API response body — does it include field-level validation details?',
            ],
          },
        ),
      ];
    }
    return [];
  },
};

const repeatedConsoleErrors: DoctorRule = {
  id: 'repeated_console_errors',
  severity: 'medium',
  detect(ev: DoctorEvidence): DoctorFinding[] {
    const errors = ev.consoleEvents.filter((e) => e.level === 'error');
    if (errors.length >= 3) {
      return [
        makeFinding(
          'repeated_console_errors',
          'medium',
          `Repeated console errors — ${errors.length} errors captured`,
          `Console errors:\n${errors
            .slice(0, 3)
            .map((e) => `• ${e.message.slice(0, 120)}`)
            .join('\n')}`,
          ev,
          {
            nextChecks: [
              'Open the Doctor Console tab to see full error messages and stack traces.',
            ],
          },
        ),
      ];
    }
    return [];
  },
};

const unhandledRejectionSpike: DoctorRule = {
  id: 'unhandled_rejection_spike',
  severity: 'medium',
  detect(ev: DoctorEvidence): DoctorFinding[] {
    const rejections = ev.consoleEvents.filter((e) => e.level === 'rejection');
    if (
      rejections.length >= 2 &&
      rejections[rejections.length - 1].ts - rejections[0].ts < 10_000
    ) {
      return [
        makeFinding(
          'unhandled_rejection_spike',
          'medium',
          `Unhandled rejection spike — ${rejections.length} rejections within 10s`,
          `Multiple unhandled promise rejections: ${rejections
            .slice(0, 2)
            .map((e) => e.message.slice(0, 80))
            .join(' | ')}`,
          ev,
          {
            nextChecks: [
              'Check for missing .catch() handlers on recently changed async functions.',
              'Check the Doctor Console tab for full rejection details.',
            ],
          },
        ),
      ];
    }
    return [];
  },
};

const slowEndpoint: DoctorRule = {
  id: 'slow_endpoint',
  severity: 'info',
  detect(ev: DoctorEvidence): DoctorFinding[] {
    const threshold = 3000;
    const slow = ev.networkEvents.filter((e) => e.durationMs > threshold);
    if (slow.length >= 2) {
      const slowest = slow.sort((a, b) => b.durationMs - a.durationMs)[0];
      return [
        makeFinding(
          'slow_endpoint',
          'info',
          `Slow endpoint — ${slowest.url} took ${slowest.durationMs}ms`,
          `${slow.length} requests exceeded ${threshold}ms. Slowest: ${slowest.method} ${slowest.url} at ${slowest.durationMs}ms.`,
          ev,
          {
            url: slowest.url,
            nextChecks: [
              'Check for missing RavenDB indexes on the query.',
              'Check for N+1 query patterns in the service.',
            ],
          },
        ),
      ];
    }
    return [];
  },
};

export const ruleCatalog: DoctorRule[] = [
  tokenRetryRace,
  silentLocationScopeLoss,
  authLoop,
  apiUnreachable,
  unhandledNotFound,
  unhandledValidationError,
  repeatedConsoleErrors,
  unhandledRejectionSpike,
  slowEndpoint,
];

export function runRules(evidence: DoctorEvidence): DoctorFinding[] {
  return ruleCatalog.flatMap((rule) => {
    try {
      return rule.detect(evidence);
    } catch {
      return [];
    }
  });
}
