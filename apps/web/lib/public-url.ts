import 'server-only';
import { connection } from 'next/server';

/**
 * Public gateway base URL, read at request time so one prebuilt image works on any host.
 * Awaiting connection() opts the calling page into dynamic rendering.
 */
export async function publicApiUrl(): Promise<string> {
  await connection();
  return (process.env.API_PUBLIC_URL || process.env.NEXT_PUBLIC_API_PUBLIC_URL || 'http://localhost:4000').replace(/\/+$/, '');
}
