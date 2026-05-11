import {Module} from '@nestjs/common';
import {ReportModule} from '../report/report.module';
import {StorageModule} from '../storage/storage.module';
import {TelemetryController} from './telemetry.controller';
import {TelemetryService} from './telemetry.service';

@Module({
  imports: [StorageModule, ReportModule],
  controllers: [TelemetryController],
  providers: [TelemetryService],
})
export class TelemetryModule {}
