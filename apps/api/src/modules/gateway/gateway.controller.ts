import { All, Controller, Param, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AppRequest } from '../../common/auth-context';
import { Public, SkipCsrf } from '../../common/decorators';
import { GatewayService } from './gateway.service';

/** Customer API traffic: https://api.<domain>/v1/<api-slug>/<endpoint-path> with an API key. */
@ApiExcludeController()
@Public()
@SkipCsrf()
@Controller('v1')
export class GatewayController {
  constructor(private readonly gw: GatewayService) {}

  @All(':product')
  root(@Param('product') product: string, @Req() req: AppRequest, @Res() res: Response) {
    return this.gw.handle(req, res, product, '/');
  }

  @All(':product/*path')
  route(
    @Param('product') product: string,
    @Param('path') path: string | string[],
    @Req() req: AppRequest,
    @Res() res: Response,
  ) {
    const sub = '/' + (Array.isArray(path) ? path.join('/') : path);
    return this.gw.handle(req, res, product, sub);
  }
}
