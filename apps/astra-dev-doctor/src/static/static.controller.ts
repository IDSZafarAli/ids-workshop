import * as fs from 'node:fs';
import * as path from 'node:path';
import {Controller, Get, Res} from '@nestjs/common';
import type {Response} from 'express';

const widgetDistDir = path.resolve(process.cwd(), 'apps/astra-dev-doctor/widget/dist');
const placeholderJs = `/* IDS Doctor widget — not yet built. Run: nx build astra-dev-doctor-widget */\nconsole.info('[IDS Doctor] widget placeholder loaded — widget build pending');`;

@Controller()
export class StaticController {
  @Get('doctor.js')
  public serveWidget(@Res() res: Response): void {
    const widgetFile = path.join(widgetDistDir, 'doctor.js');
    res.setHeader('Cache-Control', 'no-store');
    if (fs.existsSync(widgetFile)) {
      res.setHeader('Content-Type', 'application/javascript');
      res.sendFile(widgetFile);
    } else {
      res.setHeader('Content-Type', 'application/javascript');
      res.send(placeholderJs);
    }
  }
}
