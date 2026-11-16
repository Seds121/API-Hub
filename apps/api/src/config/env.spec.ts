import { demoAllowed, env, isProd, resetEnvCache } from './env';

describe('demo mode guards', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    resetEnvCache();
  });
  const set = (vars: Record<string, string>) => {
    Object.assign(process.env, vars);
    resetEnvCache();
  };

  it('production without DEMO_MODE refuses mock features and private upstreams', () => {
    set({ NODE_ENV: 'production', DEMO_MODE: 'false', GATEWAY_ALLOW_PRIVATE_UPSTREAMS: 'false' });
    expect(isProd()).toBe(true);
    expect(demoAllowed()).toBe(false);
    set({ NODE_ENV: 'production', DEMO_MODE: 'false', GATEWAY_ALLOW_PRIVATE_UPSTREAMS: 'true' });
    expect(() => env()).toThrow(/unless DEMO_MODE/);
  });

  it('production with DEMO_MODE keeps production hardening but allows demo features', () => {
    set({ NODE_ENV: 'production', DEMO_MODE: 'true', GATEWAY_ALLOW_PRIVATE_UPSTREAMS: 'true' });
    expect(isProd()).toBe(true);
    expect(demoAllowed()).toBe(true);
  });

  it('development/test always allows demo features', () => {
    set({ NODE_ENV: 'test', DEMO_MODE: 'false' });
    expect(demoAllowed()).toBe(true);
  });
});
