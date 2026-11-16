import { OrgType, Prisma } from '@prisma/client';
import { randomBase62 } from '../../common/crypto/tokens';
import type { Tx } from '../../common/prisma.service';

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'org'
  );
}

/** Creates an organization with its wallet and an owner membership, inside the caller's transaction. */
export async function createOrganization(
  tx: Tx,
  input: {
    name: string;
    type: OrgType;
    ownerUserId: string;
    ownerRoleKey?: string;
    parentOrgId?: string;
    monthlySpendLimit?: string | null;
    billingEmail?: string;
    isDemo?: boolean;
  },
) {
  const base = slugify(input.name);
  const slug = `${base}-${randomBase62(5).toLowerCase()}`;
  const role = await tx.role.findUniqueOrThrow({
    where: { key: input.ownerRoleKey ?? 'ORG_OWNER' },
  });
  const org = await tx.organization.create({
    data: {
      name: input.name,
      slug,
      type: input.type,
      parentOrgId: input.parentOrgId,
      monthlySpendLimit: input.monthlySpendLimit
        ? new Prisma.Decimal(input.monthlySpendLimit)
        : null,
      billingEmail: input.billingEmail,
      isDemo: input.isDemo ?? false,
      wallet: { create: {} },
      members: { create: { userId: input.ownerUserId, roleId: role.id } },
    },
  });
  return org;
}
