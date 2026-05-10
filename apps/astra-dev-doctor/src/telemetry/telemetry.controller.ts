import {Body, Controller, Get, HttpCode, HttpStatus, Post} from '@nestjs/common';
import type {DoctorFinding} from '../rules/doctor-rule';
import type {SnapshotDto, TelemetryBatchDto} from './dto/telemetry-event.dto';
import {TelemetryService} from './telemetry.service';

@Controller()
export class TelemetryController {
  constructor(private readonly _telemetryService: TelemetryService) {}

  @Post('telemetry/events')
  @HttpCode(HttpStatus.OK)
  public ingest(@Body() batch: TelemetryBatchDto): {findings: DoctorFinding[]} {
    const findings = this._telemetryService.ingest(batch);
    return {findings};
  }

  @Get('findings')
  public getFindings(): {findings: DoctorFinding[]} {
    return {findings: this._telemetryService.getFindings()};
  }

  @Get('snapshot')
  public getSnapshot(): object {
    return this._telemetryService.getSnapshot();
  }

  @Post('snapshot')
  @HttpCode(HttpStatus.OK)
  public updateSnapshot(@Body() snapshot: SnapshotDto): void {
    this._telemetryService.writeSnapshot(snapshot);
  }

  @Post('dom-snapshot')
  @HttpCode(HttpStatus.OK)
  public updateDomSnapshot(@Body() snapshot: Record<string, unknown>): void {
    this._telemetryService.writeDomSnapshot(snapshot);
  }
}
