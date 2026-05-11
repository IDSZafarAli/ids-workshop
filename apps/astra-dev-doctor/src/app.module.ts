import {Module, ValidationPipe} from '@nestjs/common';
import {APP_PIPE} from '@nestjs/core';
import {HealthController} from './health/health.controller';
import {StaticController} from './static/static.controller';
import {TelemetryModule} from './telemetry/telemetry.module';

@Module({
  imports: [TelemetryModule],
  controllers: [HealthController, StaticController],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({whitelist: true, forbidNonWhitelisted: true, transform: true}),
    },
  ],
})
export class AppModule {}
