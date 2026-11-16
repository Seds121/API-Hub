import {
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  emailSchema,
  moneyStringSchema,
  PERMISSIONS as P,
  positiveMoneySchema,
} from '@zeze/shared';
import { Auth, OrgId, ReqMeta, RequestMeta, RequirePermissions } from '../../common/decorators';
import type { AuthContext } from '../../common/auth-context';
import { ApiZodBody, ZBody, uuidParam } from '../../common/http/zod';
import { badRequest } from '../../common/http/app-error';
import { serialize } from '../../common/http/pagination';
import { apiKeyCreateSchema } from '../api-keys/api-keys.service';
import { AgencyService } from './agency.service';

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  monthlySpendLimit: moneyStringSchema.optional().nullable(),
  ownerEmail: emailSchema.optional().nullable(),
});
const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  monthlySpendLimit: moneyStringSchema.optional().nullable(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
});
const transferSchema = z.object({
  amount: positiveMoneySchema,
  direction: z.enum(['to_child', 'from_child']).default('to_child'),
});
const priceSchema = z.object({
  productId: z.string().uuid(),
  pricePerRequest: positiveMoneySchema,
});
const id = (v: string) => uuidParam.parse(v);

@ApiTags('agency')
@RequirePermissions(P.AGENCY_SUBACCOUNTS_MANAGE)
@Controller('api/agency')
export class AgencyController {
  constructor(private readonly svc: AgencyService) {}

  @Get('agreement')
  async agreement(@OrgId() orgId: string) {
    return serialize(await this.svc.agreement(orgId));
  }

  @Get('subaccounts')
  list(@OrgId() orgId: string) {
    return this.svc.list(orgId);
  }

  @Post('subaccounts')
  @ApiZodBody(createSchema)
  async create(
    @OrgId() orgId: string,
    @Auth() a: AuthContext,
    @ZBody(createSchema) b: z.infer<typeof createSchema>,
    @ReqMeta() m: RequestMeta,
  ) {
    return serialize(await this.svc.create(a, orgId, b, m));
  }

  @Patch('subaccounts/:id')
  @ApiZodBody(updateSchema)
  async update(
    @OrgId() orgId: string,
    @Auth() a: AuthContext,
    @Param('id') cid: string,
    @ZBody(updateSchema) b: z.infer<typeof updateSchema>,
    @ReqMeta() m: RequestMeta,
  ) {
    return serialize(await this.svc.update(a, orgId, id(cid), b, m));
  }

  @HttpCode(200)
  @Post('subaccounts/:id/transfer')
  @ApiZodBody(transferSchema)
  transfer(
    @OrgId() orgId: string,
    @Auth() a: AuthContext,
    @Param('id') cid: string,
    @ZBody(transferSchema) b: z.infer<typeof transferSchema>,
    @Headers('idempotency-key') idem: string | undefined,
    @ReqMeta() m: RequestMeta,
  ) {
    if (!idem || !/^[A-Za-z0-9_-]{8,100}$/.test(idem))
      throw badRequest('A valid Idempotency-Key header is required.');
    return this.svc.transfer(a, orgId, id(cid), b.amount, idem, b.direction, m);
  }

  @Get('subaccounts/:id/keys')
  keys(@OrgId() orgId: string, @Param('id') cid: string) {
    return this.svc.listKeys(orgId, id(cid));
  }

  @Post('subaccounts/:id/keys')
  @ApiZodBody(apiKeyCreateSchema)
  createKey(
    @OrgId() orgId: string,
    @Auth() a: AuthContext,
    @Param('id') cid: string,
    @ZBody(apiKeyCreateSchema) b: z.infer<typeof apiKeyCreateSchema>,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.svc.createKey(a, orgId, id(cid), b, m);
  }

  @HttpCode(204)
  @Delete('subaccounts/:id/keys/:keyId')
  async revokeKey(
    @OrgId() orgId: string,
    @Auth() a: AuthContext,
    @Param('id') cid: string,
    @Param('keyId') kid: string,
    @ReqMeta() m: RequestMeta,
  ) {
    await this.svc.revokeKey(a, orgId, id(cid), id(kid), m);
  }

  @Post('subaccounts/:id/pricing')
  @ApiZodBody(priceSchema)
  async price(
    @OrgId() orgId: string,
    @Auth() a: AuthContext,
    @Param('id') cid: string,
    @ZBody(priceSchema) b: z.infer<typeof priceSchema>,
    @ReqMeta() m: RequestMeta,
  ) {
    return serialize(await this.svc.setPrice(a, orgId, id(cid), b, m));
  }

  @Get('reports')
  async report(@OrgId() orgId: string, @Query('days') days?: string) {
    return serialize(await this.svc.report(orgId, Math.min(366, Math.max(1, Number(days) || 30))));
  }
}
