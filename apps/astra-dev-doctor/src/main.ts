import {Logger} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import {AppModule} from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const corsOrigin = process.env.DOCTOR_CORS_ORIGIN ?? 'http://localhost:3004';
  app.enableCors({origin: corsOrigin, credentials: true});

  const port = Number(process.env.IDS_DOCTOR_PORT ?? 3999);
  await app.listen(port);

  Logger.log(`🩺 IDS Doctor sidecar running on http://localhost:${port}`);
  Logger.log(`   doctor.js → http://localhost:${port}/doctor.js`);
  Logger.log(`   health    → http://localhost:${port}/health`);
}

bootstrap().catch((err) => {
  Logger.error('Failed to start IDS Doctor sidecar:', err);
  process.exit(1);
});
