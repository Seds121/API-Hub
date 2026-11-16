import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { formatMoney, money } from '@zeze/shared';
import { PrismaService, Tx } from '../../common/prisma.service';
import { notFound } from '../../common/http/app-error';
import { env } from '../../config/env';

export interface InvoiceLineInput {
  description: string;
  quantity: string | number;
  unitPrice: string;
}

@Injectable()
export class InvoiceService {
  constructor(private readonly prisma: PrismaService) {}

  private async nextNumber(tx: Tx) {
    const prefix = `INV-${new Date().toISOString().slice(0, 7).replace('-', '')}-`;
    const count = await tx.invoice.count({ where: { number: { startsWith: prefix } } });
    return `${prefix}${String(count + 1).padStart(5, '0')}`;
  }

  async create(
    tx: Tx,
    args: {
      orgId: string;
      lines: InvoiceLineInput[];
      status: 'OPEN' | 'PAID';
      paymentId?: string;
      currency?: string;
      notes?: string;
      periodStart?: Date;
      periodEnd?: Date;
    },
  ) {
    const lines = args.lines.map((l) => {
      const amount = money(l.unitPrice).mul(money(l.quantity));
      return {
        description: l.description,
        quantity: new Prisma.Decimal(money(l.quantity).toFixed(6)),
        unitPrice: new Prisma.Decimal(money(l.unitPrice).toFixed(6)),
        amount: new Prisma.Decimal(amount.toFixed(6)),
      };
    });
    const subtotal = lines.reduce((s, l) => s.plus(l.amount.toString()), money(0));
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await tx.invoice.create({
          data: {
            number: await this.nextNumber(tx),
            orgId: args.orgId,
            status: args.status,
            currency: args.currency ?? 'USD',
            subtotal: new Prisma.Decimal(subtotal.toFixed(6)),
            tax: new Prisma.Decimal(0),
            total: new Prisma.Decimal(subtotal.toFixed(6)),
            paidAt: args.status === 'PAID' ? new Date() : null,
            dueAt: args.status === 'OPEN' ? new Date(Date.now() + 14 * 86400_000) : null,
            paymentId: args.paymentId,
            notes: args.notes,
            periodStart: args.periodStart,
            periodEnd: args.periodEnd,
            lines: { create: lines },
          },
        });
      } catch (e) {
        if (
          !(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') ||
          attempt === 2
        )
          throw e;
      }
    }
    throw new Error('unreachable');
  }

  list(orgId: string) {
    return this.prisma.invoice.findMany({
      where: { orgId },
      orderBy: { issuedAt: 'desc' },
      include: { lines: true },
    });
  }

  async pdf(
    orgId: string | null,
    invoiceId: string,
  ): Promise<{ filename: string; buffer: Buffer }> {
    const inv = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, ...(orgId ? { orgId } : {}) },
      include: { lines: true, org: true },
    });
    if (!inv) throw notFound('Invoice');
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<void>((r) => doc.on('end', () => r()));
    const company = env().COMPANY_NAME;
    doc.fillColor('#0b1b3f').fontSize(20).text(company, { continued: false });
    doc.fontSize(10).fillColor('#55607a').text('API Marketplace & Reseller Platform');
    doc.moveDown();
    doc.fillColor('#0b1b3f').fontSize(16).text(`Invoice ${inv.number}`);
    doc.fontSize(10).fillColor('#333');
    doc.text(`Status: ${inv.status}`);
    doc.text(`Issued: ${inv.issuedAt.toISOString().slice(0, 10)}`);
    if (inv.paidAt) doc.text(`Paid: ${inv.paidAt.toISOString().slice(0, 10)}`);
    doc.moveDown();
    doc.text(`Bill to: ${inv.org.name}`);
    if (inv.org.billingEmail) doc.text(inv.org.billingEmail);
    if (inv.org.taxId) doc.text(`Tax ID: ${inv.org.taxId}`);
    doc.moveDown();
    const top = doc.y;
    doc
      .font('Helvetica-Bold')
      .text('Description', 50, top)
      .text('Qty', 330, top, { width: 50, align: 'right' })
      .text('Unit', 390, top, { width: 70, align: 'right' })
      .text('Amount', 470, top, { width: 80, align: 'right' });
    doc.font('Helvetica');
    let y = top + 18;
    for (const l of inv.lines) {
      doc
        .text(l.description, 50, y, { width: 270 })
        .text(money(l.quantity).toString(), 330, y, { width: 50, align: 'right' })
        .text(formatMoney(l.unitPrice, inv.currency, 6), 390, y, { width: 70, align: 'right' })
        .text(formatMoney(l.amount, inv.currency), 470, y, { width: 80, align: 'right' });
      y += 18;
    }
    doc
      .moveTo(50, y + 4)
      .lineTo(550, y + 4)
      .strokeColor('#ccd3e0')
      .stroke();
    doc.font('Helvetica-Bold').text(`Total: ${formatMoney(inv.total, inv.currency)}`, 350, y + 12, {
      width: 200,
      align: 'right',
    });
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#777')
      .text(`${company} — generated ${new Date().toISOString()}`, 50, 780, {
        align: 'center',
        width: 500,
      });
    doc.end();
    await done;
    return { filename: `${inv.number}.pdf`, buffer: Buffer.concat(chunks) };
  }
}
