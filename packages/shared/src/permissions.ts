/** Permission keys. Platform permissions start with "platform:"; org permissions with "org:". */
export const PERMISSIONS = {
  // platform (admin) scope
  PLATFORM_DASHBOARD: 'platform:dashboard:read',
  PLATFORM_CATALOG_WRITE: 'platform:catalog:write',
  PLATFORM_PROVIDERS_WRITE: 'platform:providers:write',
  PLATFORM_CREDENTIALS_WRITE: 'platform:credentials:write',
  PLATFORM_LICENSES_WRITE: 'platform:licenses:write',
  PLATFORM_CUSTOMERS_READ: 'platform:customers:read',
  PLATFORM_CUSTOMERS_WRITE: 'platform:customers:write',
  PLATFORM_BILLING_READ: 'platform:billing:read',
  PLATFORM_BILLING_WRITE: 'platform:billing:write',
  PLATFORM_WALLET_ADJUST: 'platform:wallet:adjust',
  PLATFORM_SUPPORT: 'platform:support:write',
  PLATFORM_AUDIT_READ: 'platform:audit:read',
  PLATFORM_SETTINGS_WRITE: 'platform:settings:write',
  // organization scope
  ORG_READ: 'org:read',
  ORG_MANAGE: 'org:manage',
  ORG_MEMBERS_MANAGE: 'org:members:manage',
  ORG_KEYS_READ: 'org:keys:read',
  ORG_KEYS_WRITE: 'org:keys:write',
  ORG_USAGE_READ: 'org:usage:read',
  ORG_BILLING_READ: 'org:billing:read',
  ORG_BILLING_WRITE: 'org:billing:write',
  ORG_SUPPORT: 'org:support:write',
  AGENCY_SUBACCOUNTS_MANAGE: 'agency:subaccounts:manage',
} as const;
export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const P = PERMISSIONS;
const ORG_ALL = [
  P.ORG_READ,
  P.ORG_MANAGE,
  P.ORG_MEMBERS_MANAGE,
  P.ORG_KEYS_READ,
  P.ORG_KEYS_WRITE,
  P.ORG_USAGE_READ,
  P.ORG_BILLING_READ,
  P.ORG_BILLING_WRITE,
  P.ORG_SUPPORT,
];

export const SYSTEM_ROLES: Record<
  string,
  { name: string; scope: 'PLATFORM' | 'ORGANIZATION'; permissions: PermissionKey[] }
> = {
  PLATFORM_ADMIN: {
    name: 'Platform Administrator',
    scope: 'PLATFORM',
    permissions: Object.values(P).filter((k) => k.startsWith('platform:')) as PermissionKey[],
  },
  PLATFORM_SUPPORT: {
    name: 'Platform Support',
    scope: 'PLATFORM',
    permissions: [
      P.PLATFORM_DASHBOARD,
      P.PLATFORM_CUSTOMERS_READ,
      P.PLATFORM_BILLING_READ,
      P.PLATFORM_SUPPORT,
    ],
  },
  PLATFORM_FINANCE: {
    name: 'Platform Finance',
    scope: 'PLATFORM',
    permissions: [
      P.PLATFORM_DASHBOARD,
      P.PLATFORM_CUSTOMERS_READ,
      P.PLATFORM_BILLING_READ,
      P.PLATFORM_BILLING_WRITE,
      P.PLATFORM_WALLET_ADJUST,
    ],
  },
  ORG_OWNER: {
    name: 'Owner',
    scope: 'ORGANIZATION',
    permissions: [...ORG_ALL, P.AGENCY_SUBACCOUNTS_MANAGE],
  },
  ORG_ADMIN: {
    name: 'Admin',
    scope: 'ORGANIZATION',
    permissions: [...ORG_ALL, P.AGENCY_SUBACCOUNTS_MANAGE],
  },
  ORG_DEVELOPER: {
    name: 'Developer',
    scope: 'ORGANIZATION',
    permissions: [P.ORG_READ, P.ORG_KEYS_READ, P.ORG_KEYS_WRITE, P.ORG_USAGE_READ, P.ORG_SUPPORT],
  },
  ORG_BILLING: {
    name: 'Billing Manager',
    scope: 'ORGANIZATION',
    permissions: [P.ORG_READ, P.ORG_USAGE_READ, P.ORG_BILLING_READ, P.ORG_BILLING_WRITE],
  },
  ORG_VIEWER: {
    name: 'Viewer',
    scope: 'ORGANIZATION',
    permissions: [P.ORG_READ, P.ORG_KEYS_READ, P.ORG_USAGE_READ, P.ORG_BILLING_READ],
  },
};
