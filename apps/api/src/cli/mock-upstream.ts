/* DEMO_MODE / development only: serves the fake supplier APIs inside the private compose network. */
import { createMockUpstream } from '../dev/mock-upstream';

if (
  process.env.NODE_ENV === 'production' &&
  !['true', '1'].includes(String(process.env.DEMO_MODE))
) {
  console.error('mock-upstream refuses to start in production without DEMO_MODE=true');
  process.exit(1);
}
const port = Number(process.env.MOCK_UPSTREAM_PORT ?? 4010);
const host = process.env.MOCK_UPSTREAM_HOST ?? '0.0.0.0';
createMockUpstream().server.listen(port, host, () =>
  console.warn(`[mock-upstream] DEMO ONLY — listening on http://${host}:${port}`),
);
