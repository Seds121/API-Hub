import { Injectable } from '@nestjs/common';
import { PrismaService, Tx } from '../../common/prisma.service';
import { isProd } from '../../config/env';

export interface LicenseVerdict {
  redistributionAllowed: boolean;
  subResaleAllowed: boolean;
  cachingAllowed: boolean;
  cacheTtlSeconds: number | null;
  licenseId: string | null;
}

const DENY: LicenseVerdict = {
  redistributionAllowed: false,
  subResaleAllowed: false,
  cachingAllowed: false,
  cacheTtlSeconds: null,
  licenseId: null,
};

/**
 * Supplier licensing gate. Buying an API subscription does NOT imply resale rights: an API may only
 * be published / routed when a VERIFIED, unexpired license with redistributionAllowed exists for the
 * provider (product-scoped or provider-wide). Demo licenses are ignored in production.
 */
@Injectable()
export class LicenseService {
  constructor(private readonly prisma: PrismaService) {}

  async verdict(
    providerId: string,
    productId: string,
    db: Tx | PrismaService = this.prisma,
  ): Promise<LicenseVerdict> {
    const now = new Date();
    const lic = await db.providerLicense.findFirst({
      where: {
        providerId,
        status: 'VERIFIED',
        redistributionAllowed: true,
        effectiveFrom: { lte: now },
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          { OR: [{ apiProductId: null }, { apiProductId: productId }] },
        ],
        ...(isProd() ? { isDemo: false } : {}),
      },
      orderBy: [{ apiProductId: { sort: 'desc', nulls: 'last' } }, { verifiedAt: 'desc' }],
    });
    if (!lic) return DENY;
    return {
      redistributionAllowed: true,
      subResaleAllowed: lic.subResaleAllowed,
      cachingAllowed: lic.cachingAllowed,
      cacheTtlSeconds: lic.cacheTtlSeconds,
      licenseId: lic.id,
    };
  }

  /** Product is licensable if every active integration's provider has a redistribution license. */
  async productLicensed(
    productId: string,
  ): Promise<{ ok: boolean; missing: { providerId: string; providerName: string }[] }> {
    const integrations = await this.prisma.apiIntegration.findMany({
      where: { isActive: true, endpoint: { productId, isActive: true } },
      select: { provider: { select: { id: true, name: true } } },
    });
    if (!integrations.length) return { ok: false, missing: [] };
    const providers = new Map(integrations.map((i) => [i.provider.id, i.provider.name]));
    const missing: { providerId: string; providerName: string }[] = [];
    for (const [id, name] of providers) {
      if (!(await this.verdict(id, productId)).redistributionAllowed)
        missing.push({ providerId: id, providerName: name });
    }
    return { ok: missing.length === 0, missing };
  }
}
