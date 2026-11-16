import { Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { emailSchema, PERMISSIONS as P } from '@zeze/shared';
import {
  Auth,
  OrgId,
  Public,
  RateLimit,
  ReqMeta,
  RequestMeta,
  RequirePermissions,
} from '../../common/decorators';
import type { AuthContext } from '../../common/auth-context';
import { ApiZodBody, ZBody, uuidParam } from '../../common/http/zod';
import { notFound, badRequest } from '../../common/http/app-error';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';

const ticketCreate = z.object({
  subject: z.string().trim().min(4).max(200),
  category: z
    .enum(['general', 'billing', 'technical', 'api-request', 'account'])
    .default('general'),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  message: z.string().trim().min(10).max(10000),
});
const messageSchema = z.object({ body: z.string().trim().min(1).max(10000) });
const adminMessage = messageSchema.extend({ isInternal: z.boolean().default(false) });
const adminUpdate = z.object({
  status: z.enum(['OPEN', 'PENDING', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
});
const contactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  company: z.string().trim().max(120).optional(),
  topic: z.enum(['general', 'sales', 'enterprise', 'partnership', 'support']).default('general'),
  message: z.string().trim().min(10).max(5000),
});

@ApiTags('support')
@Controller('api/support')
export class SupportController {
  constructor(private readonly prisma: PrismaService) {}

  @RequirePermissions(P.ORG_READ)
  @Get('tickets')
  list(@OrgId() orgId: string) {
    return this.prisma.supportTicket.findMany({
      where: { orgId },
      orderBy: { updatedAt: 'desc' },
      include: {
        createdBy: { select: { name: true } },
        _count: { select: { messages: { where: { isInternal: false } } } },
      },
    });
  }

  @RequirePermissions(P.ORG_SUPPORT)
  @Post('tickets')
  @ApiZodBody(ticketCreate)
  create(
    @OrgId() orgId: string,
    @Auth() a: AuthContext,
    @ZBody(ticketCreate) b: z.infer<typeof ticketCreate>,
  ) {
    return this.prisma.supportTicket.create({
      data: {
        orgId,
        createdById: a.userId,
        subject: b.subject,
        category: b.category,
        priority: b.priority,
        messages: { create: { authorId: a.userId, body: b.message } },
      },
    });
  }

  @RequirePermissions(P.ORG_READ)
  @Get('tickets/:id')
  async get(@OrgId() orgId: string, @Param('id') id: string) {
    const t = await this.prisma.supportTicket.findFirst({
      where: { id: uuidParam.parse(id), orgId },
      include: {
        messages: {
          where: { isInternal: false },
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { name: true } } },
        },
      },
    });
    if (!t) throw notFound('Ticket');
    return t;
  }

  @RequirePermissions(P.ORG_SUPPORT)
  @Post('tickets/:id/messages')
  @ApiZodBody(messageSchema)
  async reply(
    @OrgId() orgId: string,
    @Auth() a: AuthContext,
    @Param('id') id: string,
    @ZBody(messageSchema) b: z.infer<typeof messageSchema>,
  ) {
    const t = await this.prisma.supportTicket.findFirst({
      where: { id: uuidParam.parse(id), orgId },
    });
    if (!t) throw notFound('Ticket');
    if (t.status === 'CLOSED') throw badRequest('This ticket is closed. Open a new ticket.');
    const [msg] = await this.prisma.$transaction([
      this.prisma.ticketMessage.create({
        data: { ticketId: t.id, authorId: a.userId, body: b.body },
      }),
      this.prisma.supportTicket.update({ where: { id: t.id }, data: { status: 'OPEN' } }),
    ]);
    return msg;
  }

  @RequirePermissions(P.ORG_SUPPORT)
  @HttpCode(204)
  @Post('tickets/:id/close')
  async close(@OrgId() orgId: string, @Param('id') id: string) {
    const r = await this.prisma.supportTicket.updateMany({
      where: { id: uuidParam.parse(id), orgId },
      data: { status: 'CLOSED' },
    });
    if (!r.count) throw notFound('Ticket');
  }
}

@ApiTags('public')
@Controller('api/contact')
export class ContactController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @RateLimit(5, 600)
  @Post()
  @ApiZodBody(contactSchema)
  async contact(@ZBody(contactSchema) b: z.infer<typeof contactSchema>) {
    await this.prisma.contactMessage.create({ data: b });
    return { received: true };
  }
}

@ApiTags('admin: support')
@Controller('api/admin/support')
export class AdminSupportController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @RequirePermissions(P.PLATFORM_SUPPORT)
  @Get('tickets')
  list(@Query('status') status?: string) {
    const valid = ['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'];
    return this.prisma.supportTicket.findMany({
      where: status && valid.includes(status) ? { status: status as never } : {},
      orderBy: [{ updatedAt: 'desc' }],
      take: 200,
      include: {
        org: { select: { id: true, name: true } },
        createdBy: { select: { name: true, email: true } },
        _count: { select: { messages: true } },
      },
    });
  }

  @RequirePermissions(P.PLATFORM_SUPPORT)
  @Get('tickets/:id')
  async get(@Param('id') id: string) {
    const t = await this.prisma.supportTicket.findUnique({
      where: { id: uuidParam.parse(id) },
      include: {
        org: { select: { id: true, name: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { name: true, email: true } } },
        },
      },
    });
    if (!t) throw notFound('Ticket');
    return t;
  }

  @RequirePermissions(P.PLATFORM_SUPPORT)
  @Post('tickets/:id/messages')
  @ApiZodBody(adminMessage)
  async reply(
    @Auth() a: AuthContext,
    @Param('id') id: string,
    @ZBody(adminMessage) b: z.infer<typeof adminMessage>,
  ) {
    const tid = uuidParam.parse(id);
    const [msg] = await this.prisma.$transaction([
      this.prisma.ticketMessage.create({
        data: { ticketId: tid, authorId: a.userId, body: b.body, isInternal: b.isInternal },
      }),
      this.prisma.supportTicket.update({
        where: { id: tid },
        data: b.isInternal ? {} : { status: 'PENDING' },
      }),
    ]);
    return msg;
  }

  @RequirePermissions(P.PLATFORM_SUPPORT)
  @Patch('tickets/:id')
  @ApiZodBody(adminUpdate)
  async update(
    @Auth() a: AuthContext,
    @Param('id') id: string,
    @ZBody(adminUpdate) b: z.infer<typeof adminUpdate>,
    @ReqMeta() m: RequestMeta,
  ) {
    const t = await this.prisma.supportTicket.update({
      where: { id: uuidParam.parse(id) },
      data: b,
    });
    await this.audit.record({
      action: 'support.ticket.update',
      actor: a,
      orgId: t.orgId,
      targetType: 'SupportTicket',
      targetId: t.id,
      metadata: b,
      meta: m,
    });
    return t;
  }

  @RequirePermissions(P.PLATFORM_SUPPORT)
  @Get('contact-messages')
  contacts() {
    return this.prisma.contactMessage.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  }

  @RequirePermissions(P.PLATFORM_SUPPORT)
  @HttpCode(204)
  @Post('contact-messages/:id/handled')
  async handled(@Param('id') id: string) {
    await this.prisma.contactMessage.update({
      where: { id: uuidParam.parse(id) },
      data: { handled: true },
    });
  }
}
