import { z } from 'zod';

/** Whitelisted platform settings (stored in SystemSetting). */
export const SETTINGS_SCHEMA = z.object({
  maintenanceBanner: z.string().max(300).nullable().default(null),
  signupsEnabled: z.boolean().default(true),
  dataRetentionDays: z.number().int().min(7).max(3650).default(90),
  auditRetentionDays: z.number().int().min(90).max(3650).default(365),
  healthCheckIntervalMinutes: z.number().int().min(1).max(1440).default(5),
  defaultLowBalanceThreshold: z
    .string()
    .regex(/^\d{1,9}(\.\d{1,6})?$/)
    .default('5'),
  supportEmail: z.string().email().nullable().default(null),
});
export type PlatformSettings = z.infer<typeof SETTINGS_SCHEMA>;
