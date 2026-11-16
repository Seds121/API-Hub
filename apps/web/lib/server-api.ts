import 'server-only';

const API = process.env.API_INTERNAL_URL || 'http://localhost:4000';

/** Server-side fetch for public (unauthenticated) catalog data; enables SSR/SEO for marketplace pages. */
export async function serverGet<T>(path: string, revalidate = 30): Promise<T | null> {
  try {
    const r = await fetch(`${API}${path}`, { next: { revalidate } });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}
