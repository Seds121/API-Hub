import { z } from 'zod';

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  q: z.string().trim().max(200).optional(),
});
export type PageQuery = z.infer<typeof pageQuery>;

export function pageArgs(p: { page: number; pageSize: number }) {
  return { skip: (p.page - 1) * p.pageSize, take: p.pageSize };
}

export function paged<T>(items: T[], total: number, p: { page: number; pageSize: number }) {
  return {
    items,
    total,
    page: p.page,
    pageSize: p.pageSize,
    pageCount: Math.max(1, Math.ceil(total / p.pageSize)),
  };
}

/** Decimal → string recursively, Date → ISO; makes Prisma rows JSON-safe & precise. */
export function serialize<T>(v: T): T {
  return JSON.parse(
    JSON.stringify(v, (_k, val) => (typeof val === 'bigint' ? val.toString() : val)),
  ) as T;
}
