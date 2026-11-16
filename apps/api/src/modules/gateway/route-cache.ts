import { Injectable } from '@nestjs/common';
import type {
  ApiEndpoint,
  ApiIntegration,
  ApiProduct,
  ApiProvider,
  Organization,
  ProviderSubscription,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';

export type RouteIntegration = ApiIntegration & {
  provider: ApiProvider & { subscriptions: ProviderSubscription[] };
};
export type RouteEndpoint = ApiEndpoint & {
  integrations: RouteIntegration[];
  matcher: RegExp;
  paramNames: string[];
};
export type RouteProduct = ApiProduct & { endpoints: RouteEndpoint[] };

const TTL_MS = 10_000;

function compile(path: string) {
  const names: string[] = [];
  const re = path
    .split('/')
    .map((seg) => {
      const m = /^\{([A-Za-z0-9_\-.]+)\}$/.exec(seg);
      if (m) {
        names.push(m[1]!);
        return '([^/]+)';
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { matcher: new RegExp(`^${re === '' ? '/' : re}/?$`), paramNames: names };
}

/** Short-lived per-instance cache of published route tables & org records (admin changes apply within ~10s). */
@Injectable()
export class RouteCache {
  private products = new Map<string, { at: number; value: RouteProduct | null }>();
  private orgs = new Map<string, { at: number; value: Organization | null }>();

  constructor(private readonly prisma: PrismaService) {}

  clear() {
    this.products.clear();
    this.orgs.clear();
  }

  async product(slug: string): Promise<RouteProduct | null> {
    const hit = this.products.get(slug);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
    const now = new Date();
    const p = await this.prisma.apiProduct.findFirst({
      where: { slug, status: 'PUBLISHED', deletedAt: null },
      include: {
        endpoints: {
          where: { isActive: true },
          include: {
            integrations: {
              where: { isActive: true, provider: { deletedAt: null, status: { not: 'DISABLED' } } },
              orderBy: { priority: 'asc' },
              include: {
                provider: {
                  include: {
                    subscriptions: {
                      where: {
                        status: 'ACTIVE',
                        startsAt: { lte: now },
                        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                      },
                      orderBy: { startsAt: 'desc' },
                      take: 1,
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    const value = p
      ? { ...p, endpoints: p.endpoints.map((e) => ({ ...e, ...compile(e.path) })) }
      : null;
    this.products.set(slug, { at: Date.now(), value });
    return value;
  }

  async org(id: string): Promise<Organization | null> {
    const hit = this.orgs.get(id);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
    const value = await this.prisma.organization.findFirst({ where: { id, deletedAt: null } });
    this.orgs.set(id, { at: Date.now(), value });
    return value;
  }
}

export function matchEndpoint(product: RouteProduct, method: string, subPath: string) {
  const path = subPath === '' ? '/' : subPath;
  let pathMatched = false;
  for (const e of product.endpoints) {
    const m = e.matcher.exec(path);
    if (!m) continue;
    pathMatched = true;
    if (e.method !== method) continue;
    const params: Record<string, string> = {};
    e.paramNames.forEach((n, i) => {
      try {
        params[n] = decodeURIComponent(m[i + 1]!);
      } catch {
        params[n] = m[i + 1]!;
      }
    });
    return { endpoint: e, pathParams: params };
  }
  return pathMatched ? 'METHOD_NOT_ALLOWED' : null;
}
