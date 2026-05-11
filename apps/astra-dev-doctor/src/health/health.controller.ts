import {Controller, Get} from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  public check(): {status: string; service: string} {
    return {status: 'ok', service: 'astra-dev-doctor'};
  }
}
