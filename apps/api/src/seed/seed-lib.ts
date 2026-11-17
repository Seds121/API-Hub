/* Seed helpers shared by `prisma db seed` and the test-suite. Idempotent (upserts). */
import { Prisma, PrismaClient } from '@prisma/client';
import { connectorDef, PERMISSIONS, SYSTEM_ROLES } from '@zeze/shared';
import { AuthService } from '../modules/auth/auth.service';
import { EncryptionService } from '../common/crypto/encryption.service';
import { MOCK_DIRECT_KEY, MOCK_RAPIDAPI_KEY } from '../dev/mock-upstream';

export async function seedRbac(prisma: PrismaClient) {
  for (const key of Object.values(PERMISSIONS)) {
    await prisma.permission.upsert({
      where: { key },
      create: { key, description: key },
      update: {},
    });
  }
  const perms = await prisma.permission.findMany();
  for (const [key, def] of Object.entries(SYSTEM_ROLES)) {
    const role = await prisma.role.upsert({
      where: { key },
      create: { key, name: def.name, scope: def.scope },
      update: { name: def.name, scope: def.scope },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: def.permissions.map((p) => ({
        roleId: role.id,
        permissionId: perms.find((x) => x.key === p)!.id,
      })),
    });
  }
}

export async function seedPlatform(
  prisma: PrismaClient,
  opts: { adminEmail: string; adminPassword: string; companyName: string },
) {
  const role = await prisma.role.findUniqueOrThrow({ where: { key: 'PLATFORM_ADMIN' } });
  const org = await prisma.organization.upsert({
    where: { slug: 'platform' },
    create: { name: opts.companyName, slug: 'platform', type: 'PLATFORM', wallet: { create: {} } },
    update: { name: opts.companyName },
  });
  const email = opts.adminEmail.toLowerCase();
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: 'Platform Administrator',
      passwordHash: await AuthService.hashPassword(opts.adminPassword),
    },
    update: {},
  });
  await prisma.organizationMember.upsert({
    where: { orgId_userId: { orgId: org.id, userId: user.id } },
    create: { orgId: org.id, userId: user.id, roleId: role.id },
    update: { roleId: role.id },
  });
  return { org, user };
}

const CATEGORIES = [
  {
    slug: 'social-media',
    name: 'Social Media',
    icon: 'share-2',
    description: 'Profiles, posts and audience data from social platforms.',
  },
  {
    slug: 'ai',
    name: 'AI & Machine Learning',
    icon: 'sparkles',
    description: 'Language, vision and prediction models.',
  },
  {
    slug: 'communication',
    name: 'Communication',
    icon: 'message-square',
    description: 'SMS, email delivery and messaging.',
  },
  {
    slug: 'identity',
    name: 'Identity Verification',
    icon: 'shield-check',
    description: 'Email, phone and identity checks.',
  },
  {
    slug: 'business-data',
    name: 'Business Data',
    icon: 'building-2',
    description: 'Company registries and firmographics.',
  },
  {
    slug: 'geolocation',
    name: 'Geolocation',
    icon: 'map-pin',
    description: 'IP geolocation, geocoding and maps.',
  },
  {
    slug: 'security',
    name: 'Security',
    icon: 'lock',
    description: 'Threat intelligence and fraud signals.',
  },
];

/**
 * DEMO catalog wired to the local mock upstream (development only). Every demo record is flagged
 * (isDemo / isMock) and demo licenses are ignored by the licensing gate in production.
 */
export async function seedDemo(
  prisma: PrismaClient,
  opts: { mockUrl: string; demoPassword: string; adminUserId: string },
) {
  const enc = new EncryptionService();
  const cats: Record<string, string> = {};
  for (const [i, c] of CATEGORIES.entries()) {
    const r = await prisma.apiCategory.upsert({
      where: { slug: c.slug },
      create: { ...c, sortOrder: i },
      update: { name: c.name, description: c.description, icon: c.icon },
    });
    cats[c.slug] = r.id;
  }
  const mock = new URL(opts.mockUrl);
  const host = mock.hostname;

  async function provider(
    slug: string,
    data: Omit<Prisma.ApiProviderCreateInput, 'slug'>,
    secret: Record<string, unknown>,
    credKind: 'API_KEY' | 'BEARER_TOKEN',
  ) {
    const p = await prisma.apiProvider.upsert({
      where: { slug },
      create: { slug, ...data },
      update: { baseUrl: data.baseUrl, allowedHosts: data.allowedHosts },
    });
    if (!(await prisma.providerCredential.count({ where: { providerId: p.id, isActive: true } }))) {
      await prisma.providerCredential.create({
        data: {
          providerId: p.id,
          label: 'Demo credential (mock upstream)',
          kind: credKind,
          ...enc.encryptJson(secret, `provider:${p.id}`),
          hint: '••••only',
          createdById: opts.adminUserId,
        },
      });
    }
    return p;
  }

  const rapid = await provider(
    'demo-rapidapi-social',
    {
      name: 'Demo RapidAPI — Social Graph',
      kind: 'RAPIDAPI',
      description: 'DEMO: emulates a RapidAPI listing via the local mock upstream.',
      baseUrl: `${opts.mockUrl}/social`,
      allowedHosts: [host],
      authType: 'API_KEY',
      authConfig: { rapidApiHost: 'demo-social-graph.p.rapidapi.com' },
      timeoutMs: 2000,
      retryMaxAttempts: 1,
      retryBackoffMs: 100,
      maxConcurrency: 50,
      rateLimitPerMinute: 6000,
      isMock: true,
    },
    { apiKey: MOCK_RAPIDAPI_KEY },
    'API_KEY',
  );
  const direct = await provider(
    'demo-direct-verify',
    {
      name: 'Demo Direct — VerifyCo',
      kind: 'DIRECT_REST',
      description: 'DEMO: direct REST provider (API key header) via mock upstream.',
      baseUrl: opts.mockUrl,
      allowedHosts: [host],
      authType: 'API_KEY',
      authConfig: { in: 'header', name: 'X-API-Key' },
      timeoutMs: 2000,
      retryMaxAttempts: 1,
      retryBackoffMs: 100,
      maxConcurrency: 50,
      healthCheckPath: '/health',
      isMock: true,
    },
    { apiKey: MOCK_DIRECT_KEY },
    'API_KEY',
  );
  const biz = await provider(
    'demo-business-data',
    {
      name: 'Demo Direct — Business Registry',
      kind: 'DIRECT_REST',
      description: 'DEMO: bearer-token provider via mock upstream.',
      baseUrl: opts.mockUrl,
      allowedHosts: [host],
      authType: 'BEARER',
      timeoutMs: 2000,
      healthCheckPath: '/health',
      isMock: true,
    },
    { token: MOCK_DIRECT_KEY },
    'BEARER_TOKEN',
  );
  const ai = await provider(
    'demo-ai-unlicensed',
    {
      name: 'Demo AI Vendor (license pending)',
      kind: 'DIRECT_REST',
      description: 'DEMO: shows the licensing gate — redistribution not yet verified.',
      baseUrl: opts.mockUrl,
      allowedHosts: [host],
      authType: 'BEARER',
      isMock: true,
    },
    { token: 'demo' },
    'BEARER_TOKEN',
  );

  for (const [p, plan, fee] of [
    [rapid, 'Demo PRO plan', '25'],
    [direct, 'Demo Business plan', '49'],
    [biz, 'Demo Starter', '0'],
  ] as const) {
    if (!(await prisma.providerSubscription.count({ where: { providerId: p.id } }))) {
      await prisma.providerSubscription.create({
        data: {
          providerId: p.id,
          planName: plan,
          startsAt: new Date(Date.now() - 30 * 86400_000),
          expiresAt: new Date(Date.now() + 335 * 86400_000),
          monthlyFee: new Prisma.Decimal(fee),
          usageLimitPerMonth: 1_000_000,
          notes: 'DEMO record',
        },
      });
    }
  }
  async function license(
    providerId: string,
    data: Partial<Prisma.ProviderLicenseUncheckedCreateInput>,
  ) {
    if (await prisma.providerLicense.count({ where: { providerId } })) return;
    await prisma.providerLicense.create({
      data: {
        providerId,
        isDemo: true,
        documentRef: 'DEMO — not a real agreement',
        evidenceNotes: 'Seeded demo license for local development. Ignored in production.',
        redistributionAllowed: false,
        ...data,
      },
    });
  }
  await license(rapid.id, {
    status: 'VERIFIED',
    redistributionAllowed: true,
    subResaleAllowed: true,
    verifiedById: opts.adminUserId,
    verifiedAt: new Date(),
  });
  await license(direct.id, {
    status: 'VERIFIED',
    redistributionAllowed: true,
    subResaleAllowed: false,
    verifiedById: opts.adminUserId,
    verifiedAt: new Date(),
  });
  await license(biz.id, {
    status: 'VERIFIED',
    redistributionAllowed: true,
    subResaleAllowed: true,
    cachingAllowed: true,
    cacheTtlSeconds: 300,
    verifiedById: opts.adminUserId,
    verifiedAt: new Date(),
  });
  await license(ai.id, { status: 'PENDING', redistributionAllowed: true });

  type Ep = {
    name: string;
    method: 'GET' | 'POST';
    path: string;
    description: string;
    params: unknown[];
    responseExample: unknown;
    requestBodyExample?: unknown;
    integ: {
      providerId: string;
      upstreamMethod: 'GET' | 'POST';
      upstreamPath: string;
      bodyMode?: 'NONE' | 'PASSTHROUGH_VALIDATED';
      queryMapping?: object;
      responseTransform?: object;
      costPerCall?: string | null;
      costIsEstimated?: boolean;
    };
    price?: string;
  };
  async function product(
    slug: string,
    code: string,
    data: {
      name: string;
      summary: string;
      description: string;
      category: string;
      publisherName: string;
      tags: string[];
      price: string;
      status: 'PUBLISHED' | 'DRAFT';
      isFeatured?: boolean;
      requiresSubscription?: boolean;
      usageRestrictions?: string;
      popularity?: number;
    },
    endpoints: Ep[],
  ) {
    const p = await prisma.apiProduct.upsert({
      where: { slug },
      create: {
        slug,
        internalCode: code,
        name: data.name,
        summary: data.summary,
        description: data.description,
        docsMarkdown: data.description,
        categoryId: cats[data.category]!,
        publisherName: data.publisherName,
        tags: data.tags,
        status: data.status,
        publishedAt: data.status === 'PUBLISHED' ? new Date() : null,
        isFeatured: data.isFeatured ?? false,
        requiresSubscription: data.requiresSubscription ?? false,
        usageRestrictions: data.usageRestrictions,
        popularity: data.popularity ?? 0,
        isDemo: true,
        defaultRateLimitPerMinute: 120,
      },
      update: {},
    });
    if (
      !(await prisma.pricingRule.count({ where: { productId: p.id, scope: 'PRODUCT_DEFAULT' } }))
    ) {
      await prisma.pricingRule.create({
        data: {
          scope: 'PRODUCT_DEFAULT',
          productId: p.id,
          pricePerRequest: new Prisma.Decimal(data.price),
        },
      });
    }
    for (const e of endpoints) {
      const ep = await prisma.apiEndpoint.upsert({
        where: { productId_method_path: { productId: p.id, method: e.method, path: e.path } },
        create: {
          productId: p.id,
          name: e.name,
          method: e.method,
          path: e.path,
          description: e.description,
          params: e.params as Prisma.InputJsonValue,
          responseExample: e.responseExample as Prisma.InputJsonValue,
          requestBodyExample: (e.requestBodyExample ?? undefined) as Prisma.InputJsonValue,
          errorCodes: [
            { status: 400, code: 'VALIDATION_FAILED', description: 'Missing or invalid parameter' },
            { status: 402, code: 'INSUFFICIENT_BALANCE', description: 'Top up your wallet' },
          ],
        },
        update: {},
      });
      if (!(await prisma.apiIntegration.count({ where: { endpointId: ep.id } }))) {
        await prisma.apiIntegration.create({
          data: {
            endpointId: ep.id,
            ...e.integ,
            queryMapping: (e.integ.queryMapping ?? {}) as Prisma.InputJsonValue,
            responseTransform: (e.integ.responseTransform ?? undefined) as Prisma.InputJsonValue,
            costPerCall: e.integ.costPerCall ? new Prisma.Decimal(e.integ.costPerCall) : null,
            costIsEstimated: e.integ.costIsEstimated ?? true,
          },
        });
      }
      if (
        e.price &&
        !(await prisma.pricingRule.count({ where: { endpointId: ep.id, scope: 'ENDPOINT' } }))
      ) {
        await prisma.pricingRule.create({
          data: {
            scope: 'ENDPOINT',
            productId: p.id,
            endpointId: ep.id,
            pricePerRequest: new Prisma.Decimal(e.price),
          },
        });
      }
    }
    return p;
  }

  const social = await product(
    'social-profiles',
    'ZZ-API-0001',
    {
      name: 'Social Profiles',
      summary: 'Look up public social media profiles and recent posts by username.',
      description:
        '## Social Profiles API\n\nRetrieve public profile metadata and recent posts. **Demo listing** backed by the local mock upstream.',
      category: 'social-media',
      publisherName: 'SocialGraph (Demo)',
      tags: ['social', 'profiles', 'marketing'],
      price: '0.015',
      status: 'PUBLISHED',
      isFeatured: true,
      popularity: 950,
      usageRestrictions: 'Public data only. Do not use for harassment or unlawful profiling.',
    },
    [
      {
        name: 'Get profile',
        method: 'GET',
        path: '/profile',
        description: 'Public profile by username.',
        params: [
          {
            name: 'username',
            in: 'query',
            type: 'string',
            required: true,
            description: 'Account handle',
            example: 'acme',
            maxLength: 64,
            pattern: '^[A-Za-z0-9_.]+$',
          },
        ],
        responseExample: {
          data: {
            username: 'acme',
            displayName: 'Acme',
            followers: 1200,
            following: 180,
            verified: false,
          },
        },
        integ: {
          providerId: rapid.id,
          upstreamMethod: 'GET',
          upstreamPath: '/profile',
          responseTransform: { pick: ['data'] },
          costPerCall: '0.005',
          costIsEstimated: false,
        },
      },
      {
        name: 'List recent posts',
        method: 'GET',
        path: '/posts',
        description: 'Most recent public posts.',
        params: [
          {
            name: 'username',
            in: 'query',
            type: 'string',
            required: true,
            example: 'acme',
            maxLength: 64,
          },
          {
            name: 'limit',
            in: 'query',
            type: 'integer',
            required: false,
            example: 5,
            description: 'Max 20',
          },
        ],
        responseExample: { posts: [{ id: 'p1', text: 'Hello', likes: 10 }] },
        integ: {
          providerId: rapid.id,
          upstreamMethod: 'GET',
          upstreamPath: '/posts',
          queryMapping: { map: { limit: 'count' } },
          costPerCall: '0.008',
          costIsEstimated: false,
        },
        price: '0.025',
      },
    ],
  );
  await product(
    'email-verification',
    'ZZ-API-0002',
    {
      name: 'Email Verification',
      summary: 'Validate email syntax, MX records and disposable domains in real time.',
      description:
        '## Email Verification API\n\nReduce bounces and fake sign-ups. **Demo listing**.',
      category: 'identity',
      publisherName: 'VerifyCo (Demo)',
      tags: ['email', 'validation', 'fraud'],
      price: '0.004',
      status: 'PUBLISHED',
      isFeatured: true,
      popularity: 720,
    },
    [
      {
        name: 'Verify email',
        method: 'POST',
        path: '/verify',
        description: 'Verify a single address.',
        params: [
          {
            name: 'email',
            in: 'body',
            type: 'string',
            required: true,
            maxLength: 254,
            example: 'jane@example.com',
          },
        ],
        requestBodyExample: { email: 'jane@example.com' },
        responseExample: {
          email: 'jane@example.com',
          valid: true,
          disposable: false,
          mxFound: true,
        },
        integ: {
          providerId: direct.id,
          upstreamMethod: 'POST',
          upstreamPath: '/v2/email/verify',
          bodyMode: 'PASSTHROUGH_VALIDATED',
          costPerCall: '0.001',
          costIsEstimated: true,
        },
      },
    ],
  );
  await product(
    'ip-geolocation',
    'ZZ-API-0003',
    {
      name: 'IP Geolocation',
      summary: 'Resolve an IP address to country, city and coordinates.',
      description:
        '## IP Geolocation API\n\n**Demo listing**. Supplier cost data is intentionally not configured for this API to demonstrate "unknown cost" reporting.',
      category: 'geolocation',
      publisherName: 'VerifyCo (Demo)',
      tags: ['ip', 'geo', 'location'],
      price: '0.002',
      status: 'PUBLISHED',
      popularity: 610,
    },
    [
      {
        name: 'Lookup IP',
        method: 'GET',
        path: '/ip/{ip}',
        description: 'Geolocate an IPv4/IPv6 address.',
        params: [
          {
            name: 'ip',
            in: 'path',
            type: 'string',
            required: true,
            example: '8.8.8.8',
            maxLength: 45,
            pattern: '^[0-9A-Fa-f:.]+$',
          },
        ],
        responseExample: {
          ip: '8.8.8.8',
          country: 'US',
          city: 'Mountain View',
          lat: 37.4,
          lon: -122.1,
        },
        integ: {
          providerId: direct.id,
          upstreamMethod: 'GET',
          upstreamPath: '/geo/ip/{ip}',
          costPerCall: null,
        },
      },
    ],
  );
  await product(
    'company-lookup',
    'ZZ-API-0004',
    {
      name: 'Company Lookup',
      summary: 'Search company registries by name. Requires an active subscription.',
      description:
        '## Company Lookup API\n\n**Demo listing**. Responses may be cached for 5 minutes as permitted by the (demo) supplier license.',
      category: 'business-data',
      publisherName: 'Business Registry (Demo)',
      tags: ['company', 'kyb', 'registry'],
      price: '0.02',
      status: 'PUBLISHED',
      requiresSubscription: true,
      popularity: 300,
    },
    [
      {
        name: 'Search companies',
        method: 'GET',
        path: '/search',
        description: 'Search by company name.',
        params: [
          {
            name: 'name',
            in: 'query',
            type: 'string',
            required: true,
            example: 'Acme',
            maxLength: 120,
          },
        ],
        responseExample: {
          results: [
            { name: 'Acme Holdings', registrationNumber: '0001', country: 'GB', status: 'active' },
          ],
        },
        integ: {
          providerId: biz.id,
          upstreamMethod: 'GET',
          upstreamPath: '/companies/search',
          costPerCall: '0.006',
          costIsEstimated: false,
        },
      },
    ],
  );
  await product(
    'ai-text-summarize',
    'ZZ-API-0005',
    {
      name: 'AI Text Summarization',
      summary: 'Summarize long text with an LLM. Awaiting supplier redistribution license.',
      description: 'DRAFT — cannot be published until the supplier license is verified.',
      category: 'ai',
      publisherName: 'Demo AI Vendor',
      tags: ['ai', 'nlp'],
      price: '0.03',
      status: 'DRAFT',
    },
    [
      {
        name: 'Summarize',
        method: 'POST',
        path: '/summarize',
        description: 'Summarize text.',
        params: [{ name: 'text', in: 'body', type: 'string', required: true, maxLength: 20000 }],
        responseExample: { summary: '...' },
        integ: {
          providerId: ai.id,
          upstreamMethod: 'POST',
          upstreamPath: '/ai/summarize',
          bodyMode: 'PASSTHROUGH_VALIDATED',
        },
      },
    ],
  );

  // Plans
  const plans = [
    {
      code: 'PAYG',
      name: 'Pay as you go',
      type: 'PAYG',
      price: '0',
      includedRequests: 0,
      discountPercent: '0',
      rateLimitPerMinute: 60,
      features: [
        'No monthly fee',
        'Prepaid wallet credits',
        'All published APIs',
        'Community support',
      ],
      sortOrder: 0,
    },
    {
      code: 'STARTER',
      name: 'Starter',
      type: 'SUBSCRIPTION',
      interval: 'MONTHLY',
      price: '29',
      includedRequests: 5000,
      discountPercent: '0',
      rateLimitPerMinute: 120,
      features: ['5,000 requests included', 'Standard per-API prices after quota', 'Email support'],
      sortOrder: 1,
    },
    {
      code: 'GROWTH',
      name: 'Growth',
      type: 'SUBSCRIPTION',
      interval: 'MONTHLY',
      price: '99',
      includedRequests: 25000,
      discountPercent: '10',
      rateLimitPerMinute: 600,
      features: [
        '25,000 requests included',
        '10% off per-request prices',
        'Priority support',
        'Subscription-only APIs',
      ],
      sortOrder: 2,
    },
    {
      code: 'GROWTH_ANNUAL',
      name: 'Growth (annual)',
      type: 'SUBSCRIPTION',
      interval: 'ANNUAL',
      price: '990',
      includedRequests: 300000,
      discountPercent: '10',
      rateLimitPerMinute: 600,
      features: ['300,000 requests / year', '2 months free', '10% off per-request prices'],
      sortOrder: 3,
    },
    {
      code: 'CREDITS_100',
      name: '$100 credit pack',
      type: 'PREPAID',
      price: '100',
      creditGrant: '110',
      includedRequests: 0,
      discountPercent: '0',
      rateLimitPerMinute: 120,
      features: ['$110 of wallet credit', 'Never expires'],
      sortOrder: 4,
    },
    {
      code: 'ENTERPRISE',
      name: 'Enterprise',
      type: 'ENTERPRISE',
      price: '0',
      includedRequests: 0,
      discountPercent: '0',
      rateLimitPerMinute: 5000,
      features: ['Custom pricing & invoicing', 'Credit arrangements', 'Dedicated support & SLA'],
      sortOrder: 5,
    },
  ] as const;
  for (const pl of plans) {
    const d = {
      ...pl,
      price: new Prisma.Decimal(pl.price),
      discountPercent: new Prisma.Decimal(pl.discountPercent),
      creditGrant: new Prisma.Decimal('creditGrant' in pl ? pl.creditGrant : '0'),
      features: [...pl.features],
    };
    await prisma.subscriptionPlan.upsert({ where: { code: pl.code }, create: d, update: {} });
  }

  // Demo customers
  const pw = await AuthService.hashPassword(opts.demoPassword);
  async function demoOrg(
    email: string,
    name: string,
    orgName: string,
    type: 'CUSTOMER' | 'AGENCY',
    credit: string,
    parentOrgId?: string,
  ) {
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, name, passwordHash: pw, isDemo: true },
      update: {},
    });
    let org = await prisma.organization.findFirst({ where: { name: orgName, isDemo: true } });
    if (!org) {
      const owner = await prisma.role.findUniqueOrThrow({ where: { key: 'ORG_OWNER' } });
      org = await prisma.organization.create({
        data: {
          name: orgName,
          slug: orgName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/-+$/, ''),
          type,
          isDemo: true,
          parentOrgId,
          billingEmail: email,
          wallet: { create: {} },
          members: { create: { userId: user.id, roleId: owner.id } },
        },
      });
      const w = await prisma.wallet.findUniqueOrThrow({ where: { orgId: org.id } });
      if (Number(credit) > 0) {
        await prisma.$transaction([
          prisma.wallet.update({
            where: { id: w.id },
            data: { balance: new Prisma.Decimal(credit) },
          }),
          prisma.walletTransaction.create({
            data: {
              walletId: w.id,
              type: 'ADMIN_CREDIT',
              amount: new Prisma.Decimal(credit),
              balanceAfter: new Prisma.Decimal(credit),
              description: 'DEMO starting credit',
              idempotencyKey: `seed:${org.id}`,
              actorUserId: opts.adminUserId,
            },
          }),
        ]);
      }
    }
    return { user, org };
  }
  const acme = await demoOrg(
    'demo@acme.test',
    'Dana Developer',
    'Acme Digital (Demo)',
    'CUSTOMER',
    '50',
  );
  const agency = await demoOrg(
    'agency@northwind.test',
    'Alex Agency',
    'Northwind Agency (Demo)',
    'AGENCY',
    '200',
  );
  await prisma.agencyAgreement.upsert({
    where: { agencyOrgId: agency.org.id },
    create: {
      agencyOrgId: agency.org.id,
      wholesaleDiscountPercent: new Prisma.Decimal(15),
      revenueSharePercent: new Prisma.Decimal(10),
      maxSubaccounts: 25,
      notes: 'DEMO agreement',
    },
    update: {},
  });
  if (!(await prisma.organization.count({ where: { parentOrgId: agency.org.id } }))) {
    const admin = await prisma.role.findUniqueOrThrow({ where: { key: 'ORG_ADMIN' } });
    await prisma.organization.create({
      data: {
        name: 'Contoso Retail (Demo subaccount)',
        slug: 'contoso-retail-demo',
        type: 'CUSTOMER',
        isDemo: true,
        parentOrgId: agency.org.id,
        monthlySpendLimit: new Prisma.Decimal(50),
        wallet: { create: {} },
        members: { create: { userId: agency.user.id, roleId: admin.id } },
      },
    });
  }
  // Default alert rules
  if (!(await prisma.alertRule.count())) {
    await prisma.alertRule.createMany({
      data: [
        {
          name: 'Provider down',
          metric: 'PROVIDER_DOWN',
          threshold: new Prisma.Decimal(1),
          windowMinutes: 30,
        },
        {
          name: 'High 5xx error rate',
          metric: 'ERROR_RATE',
          threshold: new Prisma.Decimal(10),
          windowMinutes: 15,
        },
        {
          name: 'Slow upstreams',
          metric: 'LATENCY_MS',
          threshold: new Prisma.Decimal(3000),
          windowMinutes: 15,
        },
        {
          name: 'Supplier subscription expiring',
          metric: 'PROVIDER_SUBSCRIPTION_EXPIRY',
          threshold: new Prisma.Decimal(14),
          windowMinutes: 1440,
        },
        {
          name: 'License expiring',
          metric: 'LICENSE_EXPIRY',
          threshold: new Prisma.Decimal(30),
          windowMinutes: 1440,
        },
      ],
    });
  }
  return { social, acme, agency, providers: { rapid, direct, biz, ai } };
}

/**
 * Optional REAL Brave Search provider for local development / DEMO_MODE — only when a Brave API key is
 * supplied (BRAVE_API_KEY). No fake Brave responses are ever seeded. The key is stored encrypted in the
 * credential store exactly as an admin would via Admin → Credentials; the env var is just a convenience.
 * The license is a demo license (ignored in real production).
 */
export async function seedBrave(
  prisma: PrismaClient,
  opts: { apiKey: string; adminUserId: string; pricePerRequest?: string },
) {
  const { createProductFromTemplate } = await import('../modules/catalog/template-factory');
  const enc = new EncryptionService();
  const def = connectorDef('BRAVE');
  let provider = await prisma.apiProvider.findUnique({ where: { slug: 'brave-search' } });
  if (!provider) {
    const baseUrl = def.defaultBaseUrl!;
    provider = await prisma.apiProvider.create({
      data: {
        slug: 'brave-search',
        name: 'Brave Search',
        kind: 'BRAVE',
        description: def.description,
        website: 'https://brave.com/search/api/',
        baseUrl,
        allowedHosts: [new URL(baseUrl).hostname],
        authType: def.fixedAuthType ?? 'API_KEY',
        authConfig: {},
        timeoutMs: def.defaults?.timeoutMs ?? 10000,
        rateLimitPerMinute: def.defaults?.rateLimitPerMinute ?? 60,
        isMock: false,
      },
    });
  }
  if (
    !(await prisma.providerCredential.count({ where: { providerId: provider.id, isActive: true } }))
  ) {
    await prisma.providerCredential.create({
      data: {
        providerId: provider.id,
        label: 'Brave API key (seeded from BRAVE_API_KEY)',
        kind: 'API_KEY',
        ...enc.encryptJson({ apiKey: opts.apiKey }, `provider:${provider.id}`),
        hint: opts.apiKey.length >= 8 ? `••••${opts.apiKey.slice(-4)}` : '••••',
        createdById: opts.adminUserId,
      },
    });
  }
  if (!(await prisma.providerLicense.count({ where: { providerId: provider.id } }))) {
    await prisma.providerLicense.create({
      data: {
        providerId: provider.id,
        status: 'VERIFIED',
        redistributionAllowed: true,
        subResaleAllowed: false,
        isDemo: true,
        documentRef: 'DEMO — confirm Brave Search API resale terms before production',
        evidenceNotes:
          'Seeded demo license for local development / DEMO_MODE. Ignored in production.',
        verifiedById: opts.adminUserId,
        verifiedAt: new Date(),
      },
    });
  }
  let product = await prisma.apiProduct.findUnique({ where: { slug: 'brave-web-search' } });
  if (!product) {
    const r = await prisma.$transaction((tx) =>
      createProductFromTemplate(tx, {
        providerId: provider!.id,
        templateId: 'brave-web-search',
        isDemo: true,
      }),
    );
    product = r.product;
    await prisma.pricingRule.create({
      data: {
        scope: 'PRODUCT_DEFAULT',
        productId: product.id,
        pricePerRequest: new Prisma.Decimal(
          opts.pricePerRequest ?? r.template.suggestedPricePerRequest,
        ),
      },
    });
    product = await prisma.apiProduct.update({
      where: { id: product.id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
  }
  return { provider, product };
}
