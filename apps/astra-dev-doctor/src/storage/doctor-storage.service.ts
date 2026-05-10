import * as fs from 'node:fs';
import * as path from 'node:path';
import {Injectable, Logger} from '@nestjs/common';
import type {DoctorFinding} from '../rules/doctor-rule';
import type {
  ConsoleEventDto,
  NetworkEventDto,
  SnapshotDto,
} from '../telemetry/dto/telemetry-event.dto';

const doctorDir = path.resolve(process.cwd(), '.doctor');

const dirs = {
  sessions: path.join(doctorDir, 'sessions'),
};

function ensureDirs(): void {
  if (!fs.existsSync(doctorDir)) {
    fs.mkdirSync(doctorDir, {recursive: true});
  }
  for (const d of Object.values(dirs)) {
    if (!fs.existsSync(d)) {
      fs.mkdirSync(d, {recursive: true});
    }
  }
}

@Injectable()
export class DoctorStorageService {
  private readonly _logger = new Logger(DoctorStorageService.name);

  constructor() {
    ensureDirs();
  }

  public writeSessionFiles(
    sessionId: string,
    networkEvents: NetworkEventDto[],
    consoleEvents: ConsoleEventDto[],
  ): void {
    ensureDirs();

    const networkLines = networkEvents.map((e) => JSON.stringify(e)).join('\n');
    const consoleLines = consoleEvents.map((e) => JSON.stringify(e)).join('\n');

    fs.writeFileSync(
      path.join(dirs.sessions, 'latest-network.jsonl'),
      networkLines ? `${networkLines}\n` : '',
      'utf8',
    );
    fs.writeFileSync(
      path.join(dirs.sessions, 'latest-console.jsonl'),
      consoleLines ? `${consoleLines}\n` : '',
      'utf8',
    );
    fs.writeFileSync(path.join(dirs.sessions, 'latest-session.txt'), sessionId, 'utf8');
  }

  public writeSnapshot(snapshot: SnapshotDto): void {
    ensureDirs();
    fs.writeFileSync(
      path.join(doctorDir, 'snapshot.json'),
      JSON.stringify(snapshot, null, 2),
      'utf8',
    );
  }

  public writeRuntimeContext(context: Record<string, unknown>): void {
    ensureDirs();
    fs.writeFileSync(
      path.join(doctorDir, 'latest-runtime-context.json'),
      JSON.stringify(context, null, 2),
      'utf8',
    );
  }

  public writeFindings(findings: DoctorFinding[]): void {
    ensureDirs();
    fs.writeFileSync(
      path.join(doctorDir, 'findings.json'),
      JSON.stringify(findings, null, 2),
      'utf8',
    );

    const high = findings.filter((f) => f.severity === 'high');
    if (high.length > 0) {
      this._logger.warn(`HIGH: ${high.map((f) => f.ruleId).join(', ')}`);
    }
  }

  public writeReport(content: string, _label?: string): void {
    ensureDirs();
    fs.writeFileSync(path.join(doctorDir, 'latest.md'), content, 'utf8');
  }

  public writeDomSnapshot(snapshot: Record<string, unknown>): void {
    ensureDirs();
    fs.writeFileSync(
      path.join(doctorDir, 'latest-dom-snapshot.json'),
      JSON.stringify(snapshot, null, 2),
      'utf8',
    );
    fs.writeFileSync(
      path.join(doctorDir, 'latest-dom-snapshot.md'),
      renderDomSnapshot(snapshot),
      'utf8',
    );
  }
}

function renderDomSnapshot(snapshot: Record<string, unknown>): string {
  const viewport = snapshot['viewport'] as {width?: number; height?: number} | undefined;
  const documentSize = snapshot['document'] as
    | {scrollWidth?: number; scrollHeight?: number}
    | undefined;
  const highlighted = Array.isArray(snapshot['highlighted']) ? snapshot['highlighted'] : [];
  const tree = Array.isArray(snapshot['tree']) ? snapshot['tree'] : [];
  return [
    '# IDS Doctor DOM Snapshot',
    '',
    `Captured: ${String(snapshot['capturedAt'] ?? '')}`,
    `Route: ${String(snapshot['url'] ?? '')}`,
    `Title: ${String(snapshot['title'] ?? '')}`,
    `Viewport: ${viewport?.width ?? '?'} x ${viewport?.height ?? '?'}`,
    `Document: ${documentSize?.scrollWidth ?? '?'} x ${documentSize?.scrollHeight ?? '?'}`,
    '',
    '## Highlighted Elements',
    ...highlighted.slice(0, 20).map((node) => renderNodeSummary(node)),
    '',
    '## Measured Tree',
    ...tree.slice(0, 20).map((node) => renderNodeSummary(node)),
  ].join('\n');
}

function renderNodeSummary(node: unknown): string {
  const n = node as {
    selector?: string;
    tag?: string;
    role?: string;
    text?: string;
    rect?: {x?: number; y?: number; width?: number; height?: number};
    styles?: Record<string, string>;
  };
  const rect = n.rect;
  const styles = n.styles ?? {};
  return [
    `- ${n.selector ?? n.tag ?? 'element'}${n.role ? ` role=${n.role}` : ''}`,
    `  rect: x=${rect?.x ?? '?'} y=${rect?.y ?? '?'} w=${rect?.width ?? '?'} h=${rect?.height ?? '?'}`,
    n.text ? `  text: ${n.text}` : '',
    `  styles: display=${styles['display'] ?? '?'} position=${styles['position'] ?? '?'} overflow=${styles['overflow'] ?? '?'} zIndex=${styles['zIndex'] ?? '?'}`,
  ]
    .filter(Boolean)
    .join('\n');
}
