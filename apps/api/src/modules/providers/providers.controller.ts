import { Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PERMISSIONS as P } from '@zeze/shared';
import { Auth, ReqMeta, RequestMeta, RequirePermissions } from '../../common/decorators';
import type { AuthContext } from '../../common/auth-context';
import { ApiZodBody, ZBody, uuidParam } from '../../common/http/zod';
import { serialize } from '../../common/http/pagination';
import { badRequest } from '../../common/http/app-error';
import { ProvidersService } from './providers.service';
import { CatalogService } from '../catalog/catalog.service';
import * as S from './providers.schemas';

const id = (v: string) => uuidParam.parse(v);

@ApiTags('admin: providers')
@Controller('api/admin')
export class ProvidersController {
  constructor(
    private readonly svc: ProvidersService,
    private readonly catalog: CatalogService,
  ) {}

  @RequirePermissions(P.PLATFORM_DASHBOARD)
  @Get('providers')
  async list(@Query('q') q?: string) {
    return serialize(await this.svc.list(q));
  }

  /** Connector registry (labels, defaults, credential fields, templates) for the admin UI. */
  @RequirePermissions(P.PLATFORM_DASHBOARD)
  @Get('connectors')
  connectors() {
    return this.svc.connectors();
  }

  @RequirePermissions(P.PLATFORM_CATALOG_WRITE)
  @Post('providers/:id/templates/:templateId')
  createFromTemplate(
    @Param('id') pid: string,
    @Param('templateId') tid: string,
    @Auth() a: AuthContext,
    @ReqMeta() m: RequestMeta,
  ) {
    if (!/^[a-z0-9-]{1,60}$/.test(tid)) throw badRequest('Invalid template id');
    return this.catalog.createFromTemplate(id(pid), tid, a, m);
  }

  @RequirePermissions(P.PLATFORM_DASHBOARD)
  @Get('credentials')
  async credentials() {
    return serialize(await this.svc.listCredentials());
  }

  @RequirePermissions(P.PLATFORM_DASHBOARD)
  @Get('licenses')
  async licenses() {
    return serialize(await this.svc.listLicenses());
  }

  @RequirePermissions(P.PLATFORM_DASHBOARD)
  @Get('integrations')
  async integrations() {
    return serialize(await this.svc.listIntegrations());
  }

  @RequirePermissions(P.PLATFORM_DASHBOARD)
  @Get('endpoints')
  async endpoints() {
    return serialize(await this.svc.listEndpoints());
  }

  @RequirePermissions(P.PLATFORM_DASHBOARD)
  @Get('providers/:id')
  async get(@Param('id') pid: string) {
    return serialize(await this.svc.get(id(pid)));
  }

  @RequirePermissions(P.PLATFORM_PROVIDERS_WRITE)
  @Post('providers')
  @ApiZodBody(S.providerSchema)
  create(
    @ZBody(S.providerSchema) b: z.infer<typeof S.providerSchema>,
    @Auth() a: AuthContext,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.svc.create(b, a, m);
  }

  @RequirePermissions(P.PLATFORM_PROVIDERS_WRITE)
  @Patch('providers/:id')
  @ApiZodBody(S.providerUpdateSchema)
  update(
    @Param('id') pid: string,
    @ZBody(S.providerUpdateSchema) b: z.infer<typeof S.providerUpdateSchema>,
    @Auth() a: AuthContext,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.svc.update(id(pid), b, a, m);
  }

  @RequirePermissions(P.PLATFORM_PROVIDERS_WRITE)
  @HttpCode(204)
  @Delete('providers/:id')
  async remove(@Param('id') pid: string, @Auth() a: AuthContext, @ReqMeta() m: RequestMeta) {
    await this.svc.remove(id(pid), a, m);
  }

  @RequirePermissions(P.PLATFORM_CREDENTIALS_WRITE)
  @Post('providers/:id/credentials')
  @ApiZodBody(S.credentialSchema)
  addCredential(
    @Param('id') pid: string,
    @ZBody(S.credentialSchema) b: z.infer<typeof S.credentialSchema>,
    @Auth() a: AuthContext,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.svc.addCredential(id(pid), b, a, m);
  }

  @RequirePermissions(P.PLATFORM_CREDENTIALS_WRITE)
  @HttpCode(204)
  @Post('providers/:id/credentials/:cid/activate')
  async activateCredential(
    @Param('id') pid: string,
    @Param('cid') cid: string,
    @Auth() a: AuthContext,
    @ReqMeta() m: RequestMeta,
  ) {
    await this.svc.setCredentialActive(id(pid), id(cid), true, a, m);
  }

  @RequirePermissions(P.PLATFORM_CREDENTIALS_WRITE)
  @HttpCode(204)
  @Post('providers/:id/credentials/:cid/deactivate')
  async deactivateCredential(
    @Param('id') pid: string,
    @Param('cid') cid: string,
    @Auth() a: AuthContext,
    @ReqMeta() m: RequestMeta,
  ) {
    await this.svc.setCredentialActive(id(pid), id(cid), false, a, m);
  }

  @RequirePermissions(P.PLATFORM_PROVIDERS_WRITE)
  @Post('providers/:id/subscriptions')
  @ApiZodBody(S.providerSubscriptionSchema)
  addSubscription(
    @Param('id') pid: string,
    @ZBody(S.providerSubscriptionSchema) b: z.infer<typeof S.providerSubscriptionSchema>,
    @Auth() a: AuthContext,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.svc.addSubscription(id(pid), b, a, m);
  }

  @RequirePermissions(P.PLATFORM_PROVIDERS_WRITE)
  @Patch('providers/:id/subscriptions/:sid')
  updateSubscription(
    @Param('id') pid: string,
    @Param('sid') sid: string,
    @ZBody(S.providerSubscriptionSchema.partial())
    b: Partial<z.infer<typeof S.providerSubscriptionSchema>>,
    @Auth() a: AuthContext,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.svc.updateSubscription(id(pid), id(sid), b, a, m);
  }

  @RequirePermissions(P.PLATFORM_LICENSES_WRITE)
  @Post('providers/:id/licenses')
  @ApiZodBody(S.licenseSchema)
  addLicense(
    @Param('id') pid: string,
    @ZBody(S.licenseSchema) b: z.infer<typeof S.licenseSchema>,
    @Auth() a: AuthContext,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.svc.addLicense(id(pid), b, a, m);
  }

  @RequirePermissions(P.PLATFORM_LICENSES_WRITE)
  @Post('providers/:id/licenses/:lid/decision')
  @HttpCode(200)
  @ApiZodBody(S.licenseDecisionSchema)
  decideLicense(
    @Param('id') pid: string,
    @Param('lid') lid: string,
    @ZBody(S.licenseDecisionSchema) b: z.infer<typeof S.licenseDecisionSchema>,
    @Auth() a: AuthContext,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.svc.decideLicense(id(pid), id(lid), b, a, m);
  }

  @RequirePermissions(P.PLATFORM_PROVIDERS_WRITE)
  @Post('providers/:id/health-check')
  @HttpCode(200)
  healthCheck(@Param('id') pid: string) {
    return this.svc.runHealthCheck(id(pid));
  }

  @RequirePermissions(P.PLATFORM_CATALOG_WRITE)
  @Post('integrations')
  @ApiZodBody(S.integrationSchema)
  async createIntegration(
    @ZBody(S.integrationSchema) b: z.infer<typeof S.integrationSchema>,
    @Auth() a: AuthContext,
    @ReqMeta() m: RequestMeta,
  ) {
    return serialize(await this.svc.createIntegration(b, a, m));
  }

  @RequirePermissions(P.PLATFORM_CATALOG_WRITE)
  @Patch('integrations/:id')
  @ApiZodBody(S.integrationUpdateSchema)
  async updateIntegration(
    @Param('id') iid: string,
    @ZBody(S.integrationUpdateSchema) b: z.infer<typeof S.integrationUpdateSchema>,
    @Auth() a: AuthContext,
    @ReqMeta() m: RequestMeta,
  ) {
    return serialize(await this.svc.updateIntegration(id(iid), b, a, m));
  }

  @RequirePermissions(P.PLATFORM_CATALOG_WRITE)
  @HttpCode(204)
  @Delete('integrations/:id')
  async deleteIntegration(
    @Param('id') iid: string,
    @Auth() a: AuthContext,
    @ReqMeta() m: RequestMeta,
  ) {
    await this.svc.deleteIntegration(id(iid), a, m);
  }

  @RequirePermissions(P.PLATFORM_CATALOG_WRITE)
  @Post('integrations/:id/test')
  @HttpCode(200)
  @ApiZodBody(S.integrationTestSchema)
  testIntegration(
    @Param('id') iid: string,
    @ZBody(S.integrationTestSchema) b: z.infer<typeof S.integrationTestSchema>,
    @Auth() a: AuthContext,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.svc.testIntegration(id(iid), b, a, m);
  }
}
