import { redact, redactString } from './redact';

describe('secret redaction', () => {
  it('redacts sensitive keys recursively', () => {
    const r = redact({
      name: 'x',
      password: 'p',
      nested: { 'X-RapidAPI-Key': 'k', apiKey: 'a', ok: 1 },
      list: [{ token: 't' }],
    });
    expect(r).toEqual({
      name: 'x',
      password: '[REDACTED]',
      nested: { 'X-RapidAPI-Key': '[REDACTED]', apiKey: '[REDACTED]', ok: 1 },
      list: [{ token: '[REDACTED]' }],
    });
  });
  it('masks API keys and bearer tokens inside free text', () => {
    const key = 'zz_live_AbCdEfGh_' + 'x'.repeat(40);
    expect(redactString(`failed for ${key}`)).not.toContain('x'.repeat(40));
    expect(redactString('Authorization: Bearer abc.def.ghi-123')).toBe(
      'Authorization: Bearer [REDACTED]',
    );
  });
});
