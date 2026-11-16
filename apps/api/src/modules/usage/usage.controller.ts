import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PERMISSIONS as P } from '@zeze/shared';
import { OrgId, RequirePermissions } from '../../common/decorators';
import { ZQuery } from '../../common/http/zod';
import { paged, serialize } from '../../common/http/pagination';
import { UsageService } from './usage.service';

export const usageQuery = z.object({
  days: z.coerce.number().int().min(1).max(366).default(30),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  productId: z.string().uuid().optional(),
  apiKeyId: z.string().uuid().optional(),
  status: z.enum(['success', 'error']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export const range = (q: z.infer<typeof usageQuery>) => ({
  from: q.from ?? new Date(Date.now() - q.days * 86400_000),
  to: q.to ?? new Date(),
});

@ApiTags('usage')
@Controller('api/usage')
export class UsageController {
  constructor(private readonly svc: UsageService) {}

  @RequirePermissions(P.ORG_USAGE_READ)
  @Get('summary')
  async summary(@OrgId() orgId: string, @ZQuery(usageQuery) q: z.infer<typeof usageQuery>) {
    return serialize(
      await this.svc.summary({
        orgIds: [orgId],
        ...range(q),
        productId: q.productId,
        apiKeyId: q.apiKeyId,
      }),
    );
  }

  @RequirePermissions(P.ORG_USAGE_READ)
  @Get('records')
  async records(@OrgId() orgId: string, @ZQuery(usageQuery) q: z.infer<typeof usageQuery>) {
    const { items, total } = await this.svc.records({
      orgIds: [orgId],
      ...range(q),
      productId: q.productId,
      apiKeyId: q.apiKeyId,
      status: q.status,
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    });
    return serialize(paged(items, total, q));
  }
}
