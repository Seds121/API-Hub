import { Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PERMISSIONS as P } from '@zeze/shared';
import { Auth, Public, ReqMeta, RequestMeta, RequirePermissions } from '../../common/decorators';
import type { AuthContext } from '../../common/auth-context';
import { ApiZodBody, ApiZodQuery, ZBody, ZQuery, uuidParam } from '../../common/http/zod';
import { serialize } from '../../common/http/pagination';
import { CatalogService } from './catalog.service';
import * as S from './catalog.schemas';

const id = (v: string) => uuidParam.parse(v);
const slugParam = z.string().regex(/^[a-z0-9-]{1,80}$/);

@ApiTags('catalog')
@Controller('api/catalog')
export class PublicCatalogController {
  constructor(private readonly svc: CatalogService) {}

  @Public()
  @Get('categories')
  categories() {
    return this.svc.categories();
  }

  @Public()
  @Get('publishers')
  publishers() {
    return this.svc.publishers();
  }

  @Public()
  @Get('products')
  @ApiZodQuery(S.catalogQuery)
  async products(@ZQuery(S.catalogQuery) q: z.infer<typeof S.catalogQuery>) {
    return serialize(await this.svc.search(q));
  }

  @Public()
  @Get('products/:slug')
  async product(@Param('slug') slug: string) {
    return serialize(await this.svc.productBySlug(slugParam.parse(slug)));
  }

  @Public()
  @Get('products/:slug/openapi.json')
  openapi(@Param('slug') slug: string) {
    return this.svc.openapi(slugParam.parse(slug));
  }

  @Public()
  @Get('plans')
  async plans() {
    return serialize(await this.svc.publicPlans());
  }
}

@ApiTags('admin: catalog')
@Controller('api/admin')
export class AdminCatalogController {
  constructor(private readonly svc: CatalogService) {}

  @RequirePermissions(P.PLATFORM_DASHBOARD)
  @Get('categories')
  categories() {
    return this.svc.categories();
  }
  @RequirePermissions(P.PLATFORM_CATALOG_WRITE)
  @Post('categories')
  @ApiZodBody(S.categorySchema)
  createCategory(
    @ZBody(S.categorySchema) b: z.infer<typeof S.categorySchema>,
    @Auth() a: AuthContext,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.svc.createCategory(b, a, m);
  }
  @RequirePermissions(P.PLATFORM_CATALOG_WRITE)
  @Patch('categories/:id')
  updateCategory(
    @Param('id') cid: string,
    @ZBody(S.categorySchema.partial()) b: Partial<z.infer<typeof S.categorySchema>>,
    @Auth() a: AuthContext,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.svc.updateCategory(id(cid), b, a, m);
  }
  @RequirePermissions(P.PLATFORM_CATALOG_WRITE)
  @HttpCode(204)
  @Delete('categories/:id')
  async deleteCategory(
    @Param('id') cid: string,
    @Auth() a: AuthContext,
    @ReqMeta() m: RequestMeta,
  ) {
    await this.svc.deleteCategory(id(cid), a, m);
  }

  @RequirePermissions(P.PLATFORM_DASHBOARD)
  @Get('products')
  async products(@Query('q') q?: string, @Query('status') status?: string) {
    return serialize(
      await this.svc.adminProducts(
        q,
        status && ['DRAFT', 'PUBLISHED', 'DISABLED'].includes(status) ? status : undefined,
      ),
    );
  }
  @RequirePermissions(P.PLATFORM_DASHBOARD)
  @Get('products/:id')
  async product(@Param('id') pid: string) {
    return serialize(await this.svc.adminProduct(id(pid)));
  }
  @RequirePermissions(P.PLATFORM_CATALOG_WRITE)
  @Post('products')
  @ApiZodBody(S.productSchema)
  createProduct(
    @ZBody(S.productSchema) b: z.infer<typeof S.productSchema>,
    @Auth() a: AuthContext,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.svc.createProduct(b, a, m);
  }
  @RequirePermissions(P.PLATFORM_CATALOG_WRITE)
  @Patch('products/:id')
  @ApiZodBody(S.productUpdateSchema)
  updateProduct(
    @Param('id') pid: string,
    @ZBody(S.productUpdateSchema) b: z.infer<typeof S.productUpdateSchema>,
    @Auth() a: AuthContext,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.svc.updateProduct(id(pid), b, a, m);
  }
  @RequirePermissions(P.PLATFORM_CATALOG_WRITE)
  @HttpCode(200)
  @Post('products/:id/publish')
  publish(@Param('id') pid: string, @Auth() a: AuthContext, @ReqMeta() m: RequestMeta) {
    return this.svc.publish(id(pid), a, m);
  }
  @RequirePermissions(P.PLATFORM_CATALOG_WRITE)
  @HttpCode(200)
  @Post('products/:id/disable')
  disable(@Param('id') pid: string, @Auth() a: AuthContext, @ReqMeta() m: RequestMeta) {
    return this.svc.setStatus(id(pid), 'DISABLED', a, m);
  }
  @RequirePermissions(P.PLATFORM_CATALOG_WRITE)
  @HttpCode(200)
  @Post('products/:id/unpublish')
  unpublish(@Param('id') pid: string, @Auth() a: AuthContext, @ReqMeta() m: RequestMeta) {
    return this.svc.setStatus(id(pid), 'DRAFT', a, m);
  }
  @RequirePermissions(P.PLATFORM_CATALOG_WRITE)
  @HttpCode(204)
  @Delete('products/:id')
  async deleteProduct(@Param('id') pid: string, @Auth() a: AuthContext, @ReqMeta() m: RequestMeta) {
    await this.svc.deleteProduct(id(pid), a, m);
  }

  @RequirePermissions(P.PLATFORM_CATALOG_WRITE)
  @Post('products/:id/endpoints')
  @ApiZodBody(S.endpointSchema)
  createEndpoint(
    @Param('id') pid: string,
    @ZBody(S.endpointSchema) b: z.infer<typeof S.endpointSchema>,
    @Auth() a: AuthContext,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.svc.createEndpoint(id(pid), b, a, m);
  }
  @RequirePermissions(P.PLATFORM_CATALOG_WRITE)
  @Patch('endpoints/:id')
  @ApiZodBody(S.endpointUpdateSchema)
  updateEndpoint(
    @Param('id') eid: string,
    @ZBody(S.endpointUpdateSchema) b: z.infer<typeof S.endpointUpdateSchema>,
    @Auth() a: AuthContext,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.svc.updateEndpoint(id(eid), b, a, m);
  }
  @RequirePermissions(P.PLATFORM_CATALOG_WRITE)
  @HttpCode(204)
  @Delete('endpoints/:id')
  async deleteEndpoint(
    @Param('id') eid: string,
    @Auth() a: AuthContext,
    @ReqMeta() m: RequestMeta,
  ) {
    await this.svc.deleteEndpoint(id(eid), a, m);
  }

  @RequirePermissions(P.PLATFORM_BILLING_READ)
  @Get('pricing')
  async pricing(@Query('productId') productId?: string, @Query('orgId') orgId?: string) {
    return serialize(
      await this.svc.listPricing({
        productId: productId ? id(productId) : undefined,
        orgId: orgId ? id(orgId) : undefined,
      }),
    );
  }
  @RequirePermissions(P.PLATFORM_BILLING_WRITE)
  @Post('pricing')
  @ApiZodBody(S.pricingRuleSchema)
  async createPricing(
    @ZBody(S.pricingRuleSchema) b: z.infer<typeof S.pricingRuleSchema>,
    @Auth() a: AuthContext,
    @ReqMeta() m: RequestMeta,
  ) {
    return serialize(await this.svc.createPricing(b, a, m));
  }
  @RequirePermissions(P.PLATFORM_BILLING_WRITE)
  @HttpCode(204)
  @Delete('pricing/:id')
  async deactivatePricing(
    @Param('id') rid: string,
    @Auth() a: AuthContext,
    @ReqMeta() m: RequestMeta,
  ) {
    await this.svc.deactivatePricing(id(rid), a, m);
  }

  @RequirePermissions(P.PLATFORM_DASHBOARD)
  @Get('plans')
  async plans() {
    return serialize(await this.svc.adminPlans());
  }
  @RequirePermissions(P.PLATFORM_BILLING_WRITE)
  @Post('plans')
  @ApiZodBody(S.planSchema)
  async createPlan(
    @ZBody(S.planSchema) b: z.infer<typeof S.planSchema>,
    @Auth() a: AuthContext,
    @ReqMeta() m: RequestMeta,
  ) {
    return serialize(await this.svc.createPlan(b, a, m));
  }
  @RequirePermissions(P.PLATFORM_BILLING_WRITE)
  @Patch('plans/:id')
  async updatePlan(
    @Param('id') pid: string,
    @ZBody(S.planSchema.partial()) b: Partial<z.infer<typeof S.planSchema>>,
    @Auth() a: AuthContext,
    @ReqMeta() m: RequestMeta,
  ) {
    return serialize(await this.svc.updatePlan(id(pid), b, a, m));
  }
}
