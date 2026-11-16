import { Controller, Get, Headers, HttpCode, Param, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PERMISSIONS as P } from '@zeze/shared';
import {
  Auth,
  OrgId,
  Public,
  RateLimit,
  ReqMeta,
  RequestMeta,
  RequirePermissions,
  SkipCsrf,
} from '../../common/decorators';
import type { AppRequest, AuthContext } from '../../common/auth-context';
import { ApiZodBody, ZBody, uuidParam } from '../../common/http/zod';
import { AppError } from '../../common/http/app-error';
import { demoAllowed } from '../../config/env';
import { initiatePaymentSchema, PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller('api/billing/payments')
export class PaymentsController {
  constructor(private readonly svc: PaymentsService) {}

  @RequirePermissions(P.ORG_BILLING_READ)
  @Get('providers')
  providers() {
    return this.svc.providers();
  }

  @RequirePermissions(P.ORG_BILLING_READ)
  @Get()
  list(@OrgId() orgId: string) {
    return this.svc.list(orgId);
  }

  @RequirePermissions(P.ORG_BILLING_WRITE)
  @RateLimit(20, 60)
  @Post()
  @ApiZodBody(initiatePaymentSchema)
  initiate(
    @OrgId() orgId: string,
    @Auth() a: AuthContext,
    @ZBody(initiatePaymentSchema) b: z.infer<typeof initiatePaymentSchema>,
    @Headers('idempotency-key') idem: string | undefined,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.svc.initiate(orgId, a.userId, b, idem ?? '', m);
  }

  /** Development only — simulates the payment provider via a signed webhook. */
  @RequirePermissions(P.ORG_BILLING_WRITE)
  @HttpCode(200)
  @Post(':id/mock-complete')
  mockComplete(
    @OrgId() orgId: string,
    @Param('id') id: string,
    @ZBody(z.object({ outcome: z.enum(['SUCCEEDED', 'FAILED']).default('SUCCEEDED') }))
    b: { outcome: 'SUCCEEDED' | 'FAILED' },
  ) {
    if (!demoAllowed()) throw new AppError('NOT_FOUND');
    return this.svc.mockComplete(orgId, uuidParam.parse(id), b.outcome);
  }
}

/** Provider webhooks. Authenticated by signature over the raw body — never by client claims. */
@ApiTags('webhooks')
@Public()
@SkipCsrf()
@Controller('api/webhooks')
export class WebhooksController {
  constructor(private readonly svc: PaymentsService) {}

  @HttpCode(200)
  @Post('stripe')
  stripe(@Req() req: AppRequest) {
    return this.svc.handleWebhook('STRIPE', req.rawBody, req.headers);
  }

  @HttpCode(200)
  @Post('paypal')
  paypal(@Req() req: AppRequest) {
    return this.svc.handleWebhook('PAYPAL', req.rawBody, req.headers);
  }

  @HttpCode(200)
  @Post('mock')
  mock(@Req() req: AppRequest) {
    if (!demoAllowed()) throw new AppError('NOT_FOUND');
    return this.svc.handleWebhook('MOCK', req.rawBody, req.headers);
  }
}
