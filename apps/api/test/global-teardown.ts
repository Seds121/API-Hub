import type { Server } from 'http';

export default async function globalTeardown() {
  const s = (globalThis as { __MOCK__?: Server }).__MOCK__;
  if (s) await new Promise((r) => s.close(r));
}
