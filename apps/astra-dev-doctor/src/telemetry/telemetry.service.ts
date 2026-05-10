import {Injectable} from '@nestjs/common';
import {ReportService} from '../report/report.service';
import type {DoctorFinding} from '../rules/doctor-rule';
import {runRules} from '../rules/rule-catalog';
import {DoctorStorageService} from '../storage/doctor-storage.service';
import type {NetworkEventDto, SnapshotDto, TelemetryBatchDto} from './dto/telemetry-event.dto';

const maxRing = 50;

@Injectable()
export class TelemetryService {
  private readonly _networkRing: NetworkEventDto[] = [];
  private _latestFindings: DoctorFinding[] = [];
  private _latestSnapshot: TelemetryBatchDto['snapshot'] | null = null;

  constructor(
    private readonly _storage: DoctorStorageService,
    private readonly _report: ReportService,
  ) {}

  public ingest(batch: TelemetryBatchDto): DoctorFinding[] {
    // Update ring buffers
    for (const e of batch.networkEvents) {
      this._networkRing.push(e);
    }
    while (this._networkRing.length > maxRing) {
      this._networkRing.shift();
    }
    this._latestSnapshot = batch.snapshot;

    // Persist raw data
    this._storage.writeSessionFiles(batch.sessionId, batch.networkEvents, batch.consoleEvents);
    this._storage.writeSnapshot(batch.snapshot);
    if (batch.runtimeContext) {
      this._storage.writeRuntimeContext(batch.runtimeContext);
    }
    if (batch.domSnapshot) {
      this._storage.writeDomSnapshot(batch.domSnapshot);
    }

    // Run rules
    const evidence = {
      sessionId: batch.sessionId,
      networkEvents: this._networkRing,
      consoleEvents: batch.consoleEvents,
      snapshot: batch.snapshot,
    };
    const findings = runRules(evidence);
    this._latestFindings = findings;

    // Persist findings
    this._storage.writeFindings(findings);

    // Generate latest report for every sync, even when there are no findings.
    // This keeps .doctor/latest.md useful as the one file an AI agent reads first.
    const {report, label} = this._report.buildReport(evidence, findings);
    this._storage.writeReport(
      report,
      findings.some((f) => f.severity === 'high') ? label : undefined,
    );

    return findings;
  }

  public getFindings(): DoctorFinding[] {
    return this._latestFindings;
  }

  public writeSnapshot(snapshot: SnapshotDto): void {
    this._latestSnapshot = snapshot;
    this._storage.writeSnapshot(snapshot);
  }

  public writeDomSnapshot(snapshot: Record<string, unknown>): void {
    this._storage.writeDomSnapshot(snapshot);
  }

  public getSnapshot(): object {
    return {
      snapshot: this._latestSnapshot,
      networkEvents: this._networkRing.slice(-20),
    };
  }
}
