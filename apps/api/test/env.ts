// Test environment — isolated database (zeze_test) and Redis DB 1. Never points at dev/prod data.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/zeze_test?schema=public&connection_limit=10';
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1';
process.env.SESSION_SECRET = 'test-session-secret-0123456789-abcdefghijklmnop';
process.env.JWT_SECRET = 'test-jwt-secret-0123456789-abcdefghijklmnopqrstu';
process.env.API_KEY_HMAC_SECRET = 'test-hmac-secret-0123456789-abcdefghijklmnopqr';
process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.GATEWAY_ALLOW_PRIVATE_UPSTREAMS = 'true';
process.env.PAYMENT_PROVIDERS = 'mock,manual_bank,stripe';
// Dummy Stripe values: signature verification is fully offline; no network calls are made in tests.
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_for_offline_signature_tests';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_offline_signature_secret';
process.env.MOCK_UPSTREAM_URL = 'http://127.0.0.1:4011';
process.env.COMPANY_NAME = 'Ze-Ze Technologies';
process.env.LOG_LEVEL = 'silent';
