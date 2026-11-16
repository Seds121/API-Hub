import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(200)
  .regex(/[a-z]/, 'Password needs a lowercase letter')
  .regex(/[A-Z]/, 'Password needs an uppercase letter')
  .regex(/[0-9]/, 'Password needs a digit');

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  password: passwordSchema,
  organizationName: z.string().trim().min(2).max(120),
  accountType: z.enum(['CUSTOMER', 'AGENCY']).default('CUSTOMER'),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'You must accept the terms' }) }),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
  mfaCode: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const moneyStringSchema = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => /^-?\d{1,12}(\.\d{1,6})?$/.test(v), 'Invalid amount (max 6 decimals)');

export const positiveMoneySchema = moneyStringSchema.refine(
  (v) => Number(v) > 0,
  'Amount must be positive',
);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  q: z.string().trim().max(200).optional(),
});
export type PaginationInput = z.infer<typeof paginationSchema>;

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export const paramDefSchema = z.object({
  name: z.string().regex(/^[A-Za-z0-9_\-.]{1,64}$/),
  in: z.enum(['query', 'path', 'header', 'body']),
  type: z.enum(['string', 'integer', 'number', 'boolean']),
  required: z.boolean().default(false),
  description: z.string().max(500).optional(),
  example: z.union([z.string(), z.number(), z.boolean()]).optional(),
  enum: z.array(z.string()).optional(),
  maxLength: z.number().int().positive().max(10000).optional(),
  pattern: z.string().max(200).optional(),
});
export type ParamDef = z.infer<typeof paramDefSchema>;
