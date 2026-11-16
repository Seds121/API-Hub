import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, Tx } from './prisma.service';
import { redact } from './logging/redact';
import { logger } from './logging/logger';
import type { AuthContext } from './auth-context';
import type { RequestMeta } from './decorators';

export interface AuditInput {
  action: string;
  actor?: Pick<AuthContext, 'userId'> | null;
  actorType?: 'USER' | 'SYSTEM' | 'API_KEY';
  orgId?: string | null;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  meta?: RequestMeta;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditInput, tx?: Tx) {
    const db = tx ?? this.prisma;
    try {
      await db.auditLog.create({
        data: {
          action: input.action,
          actorType: input.actorType ?? (input.actor ? 'USER' : 'SYSTEM'),
          actorUserId: input.actor?.userId ?? null,
          orgId: input.orgId ?? null,
          targetType: input.targetType,
          targetId: input.targetId,
          ip: input.meta?.ip ?? null,
          userAgent: input.meta?.userAgent ?? null,
          metadata: redact(input.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
    } catch (e) {
      if (tx) throw e; // inside a financial tx the audit row is mandatory
      logger.error({ err: (e as Error).message, action: input.action }, 'audit write failed');
    }
  }
}
