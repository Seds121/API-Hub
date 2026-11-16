import { Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PERMISSIONS as P } from '@zeze/shared';
import { Auth, OrgId, ReqMeta, RequestMeta, RequirePermissions } from '../../common/decorators';
import type { AuthContext } from '../../common/auth-context';
import { ApiZodBody, ZBody, uuidParam } from '../../common/http/zod';
import { ApiKeysService, apiKeyCreateSchema, apiKeyUpdateSchema } from './api-keys.service';

@ApiTags('api keys')
@Controller('api/keys')
export class ApiKeysController {
  constructor(private readonly svc: ApiKeysService) {}

  @RequirePermissions(P.ORG_KEYS_READ)
  @Get()
  list(@OrgId() orgId: string) {
    return this.svc.list(orgId);
  }

  @RequirePermissions(P.ORG_KEYS_WRITE)
  @Post()
  @ApiZodBody(apiKeyCreateSchema)
  create(
    @OrgId() orgId: string,
    @Auth() a: AuthContext,
    @ZBody(apiKeyCreateSchema) b: z.infer<typeof apiKeyCreateSchema>,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.svc.create(orgId, a.userId, b, m);
  }

  @RequirePermissions(P.ORG_KEYS_WRITE)
  @Patch(':id')
  @ApiZodBody(apiKeyUpdateSchema)
  update(
    @OrgId() orgId: string,
    @Param('id') id: string,
    @Auth() a: AuthContext,
    @ZBody(apiKeyUpdateSchema) b: z.infer<typeof apiKeyUpdateSchema>,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.svc.update(orgId, uuidParam.parse(id), b, a.userId, m);
  }

  @RequirePermissions(P.ORG_KEYS_WRITE)
  @HttpCode(204)
  @Delete(':id')
  async revoke(
    @OrgId() orgId: string,
    @Param('id') id: string,
    @Auth() a: AuthContext,
    @ReqMeta() m: RequestMeta,
  ) {
    await this.svc.revoke(orgId, uuidParam.parse(id), a.userId, m);
  }

  @RequirePermissions(P.ORG_KEYS_WRITE)
  @Post(':id/regenerate')
  regenerate(
    @OrgId() orgId: string,
    @Param('id') id: string,
    @Auth() a: AuthContext,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.svc.regenerate(orgId, uuidParam.parse(id), a.userId, m);
  }
}
