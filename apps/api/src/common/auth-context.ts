import type { Request } from 'express';
import type { OrgType } from '@prisma/client';

export interface AuthContext {
  userId: string;
  email: string;
  name: string;
  sessionId: string;
  via: 'cookie' | 'jwt';
  /** Permissions from membership in the PLATFORM organization (admin staff). */
  platformPermissions: Set<string>;
  platformRole: string | null;
  /** Active organization context (customer/agency). */
  org: { id: string; type: OrgType; parentOrgId: string | null; name: string } | null;
  orgRole: string | null;
  orgPermissions: Set<string>;
  memberships: { orgId: string; orgName: string; orgType: OrgType; role: string }[];
}

export type AppRequest = Request & { requestId: string; auth?: AuthContext; rawBody?: Buffer };
