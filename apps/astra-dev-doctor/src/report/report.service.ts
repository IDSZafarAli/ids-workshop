import {Injectable} from '@nestjs/common';
import type {DoctorEvidence, DoctorFinding} from '../rules/doctor-rule';
import {nowHuman} from '../rules/doctor-rule';

export type ReportResult = {report: string; label: string};

@Injectable()
export class ReportService {
  public buildReport(evidence: DoctorEvidence, findings: DoctorFinding[]): ReportResult {
    const {snapshot, networkEvents, consoleEvents} = evidence;
    const high = findings.filter((f) => f.severity === 'high');
    const medium = findings.filter((f) => f.severity === 'medium');
    const label =
      high.length > 0 ? high[0].ruleId : medium.length > 0 ? medium[0].ruleId : 'no-findings';

    const lines: string[] = [
      `# IDS Doctor — Diagnostic Report`,
      `**Time**: ${nowHuman()} | **Session**: ${evidence.sessionId}`,
      `**Page**: ${snapshot.url}`,
    ];

    if (snapshot.user) {
      lines.push(
        `**User**: ${snapshot.user.userId} @ ${snapshot.user.locationName} (${snapshot.user.locationId})`,
      );
    }

    lines.push('');

    if (findings.length === 0) {
      lines.push('## No Issues Detected', '', 'No rule violations found in this batch.', '');
    } else {
      lines.push(`## Findings (${findings.length})`);
      for (const [i, f] of findings.entries()) {
        lines.push(
          '',
          `### ${i + 1}. ${f.title} — ${f.severity.toUpperCase()}`,
          `**Time**: ${f.ts}${f.url ? ` | **URL**: ${f.url}` : ''}`,
          '',
          f.explanation,
        );
        if (f.nextChecks.length > 0) {
          lines.push('', '**Next checks:**');
          for (const c of f.nextChecks) {
            lines.push(`- ${c}`);
          }
        }
        if (f.likelyFiles.length > 0) {
          lines.push('', '**Likely files:**');
          for (const file of f.likelyFiles) {
            lines.push(`- \`${file}\``);
          }
        }
      }
    }

    if (networkEvents.length > 0) {
      lines.push(
        '',
        '## Network Timeline (last 10)',
        '| Time | Method | URL | Status | Duration | locationId |',
        '|---|---|---|---|---|---|',
      );
      for (const e of networkEvents.slice(-10)) {
        const loc = (e.reqBody as Record<string, unknown>)?.['locationId'];
        const locDisplay = loc === '' ? '⚠ EMPTY' : ((loc as string | undefined) ?? '—');
        lines.push(
          `| ${e.tsHuman} | ${e.method} | ${e.url} | ${e.status} | ${e.durationMs}ms | ${locDisplay} |`,
        );
      }
    }

    const errors = consoleEvents.filter((e) => e.level === 'error' || e.level === 'rejection');
    if (errors.length > 0) {
      lines.push('', '## Console Errors (last 5)');
      for (const e of errors.slice(-5)) {
        lines.push(`- **${e.level.toUpperCase()}** ${e.tsHuman}: ${e.message.slice(0, 150)}`);
      }
    }

    if (snapshot.errorElements.length > 0) {
      lines.push('', '## UI Error Elements', ...snapshot.errorElements.map((e) => `- ${e}`));
    }

    lines.push(
      '',
      '## Raw Evidence Files',
      '- `.doctor/snapshot.json` — latest browser state',
      '- `.doctor/latest-runtime-context.json` — optional app-shell bridge context from TanStack Query/auth/location/theme/network',
      '- `.doctor/latest-dom-snapshot.md` / `.json` — optional measured DOM/layout snapshot when captured',
      '- `.doctor/sessions/latest-network.jsonl` — raw network events, including headers/JWTs for local replay',
      '- `.doctor/sessions/latest-console.jsonl` — raw console and unhandled rejection events',
      '- `.doctor/findings.json` — machine-readable current findings',
    );

    return {report: lines.join('\n'), label};
  }
}
