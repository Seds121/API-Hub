import { CONNECTOR_KINDS, CONNECTORS, connectorDef, paramDefSchema } from '@zeze/shared';
import { $Enums } from '@prisma/client';
import { integrationSchema } from '../../providers/providers.schemas';

describe('connector registry', () => {
  it('has exactly one registry entry per ProviderKind enum value', () => {
    expect([...CONNECTOR_KINDS].sort()).toEqual(Object.values($Enums.ProviderKind).sort());
    for (const k of CONNECTOR_KINDS) expect(CONNECTORS[k].kind).toBe(k);
  });

  it('templates validate against the endpoint and integration schemas', () => {
    for (const def of Object.values(CONNECTORS)) {
      for (const t of def.templates) {
        for (const p of t.endpoint.params) expect(() => paramDefSchema.parse(p)).not.toThrow();
        const r = integrationSchema.safeParse({
          endpointId: '00000000-0000-4000-8000-000000000000',
          providerId: '00000000-0000-4000-8000-000000000000',
          upstreamMethod: t.integration.upstreamMethod,
          upstreamPath: t.integration.upstreamPath,
        });
        expect(r.success).toBe(true);
        expect(t.product.slug).toMatch(/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/);
      }
    }
  });

  it('contains no secrets or https-less defaults', () => {
    const json = JSON.stringify(CONNECTORS);
    expect(json).not.toMatch(/sk_|BSA[A-Za-z0-9]{10,}|apiKey":"/);
    for (const def of Object.values(CONNECTORS))
      if (def.defaultBaseUrl) expect(def.defaultBaseUrl.startsWith('https://')).toBe(true);
  });

  it('Brave is first-class: fixed API_KEY auth, Brave credential label, default host', () => {
    const b = connectorDef('BRAVE');
    expect(b.fixedAuthType).toBe('API_KEY');
    expect(b.defaultBaseUrl).toBe('https://api.search.brave.com');
    expect(b.credential.kinds).toEqual(['API_KEY']);
    expect(b.credential.fields.API_KEY?.[0]?.label).toBe('Brave API key');
    expect(b.templates[0]?.integration.upstreamPath).toBe('/res/v1/web/search');
    expect(connectorDef('SOMETHING_NEW').shortLabel).toBe('Unknown');
  });
});
