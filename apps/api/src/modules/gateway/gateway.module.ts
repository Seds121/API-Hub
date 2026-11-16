import { Module } from '@nestjs/common';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';
import { RouteCache } from './route-cache';

@Module({
  controllers: [GatewayController],
  providers: [GatewayService, RouteCache],
  exports: [RouteCache],
})
export class GatewayModule {}
