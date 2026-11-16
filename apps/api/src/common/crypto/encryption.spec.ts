import { EncryptionService } from './encryption.service';

describe('EncryptionService (supplier credentials)', () => {
  const enc = new EncryptionService();
  it('round-trips with AES-256-GCM and random IVs', () => {
    const a = enc.encryptJson({ apiKey: 'secret-123' }, 'provider:x');
    const b = enc.encryptJson({ apiKey: 'secret-123' }, 'provider:x');
    expect(a.cipherText).not.toEqual(b.cipherText);
    expect(a.cipherText).not.toContain('secret-123');
    expect(enc.decryptJson(a, 'provider:x')).toEqual({ apiKey: 'secret-123' });
  });
  it('binds ciphertext to its provider (AAD) and detects tampering', () => {
    const a = enc.encryptJson({ apiKey: 'k' }, 'provider:x');
    expect(() => enc.decryptJson(a, 'provider:y')).toThrow();
    const tampered = {
      ...a,
      cipherText: Buffer.from('AAAA' + a.cipherText, 'base64').toString('base64'),
    };
    expect(() => enc.decryptJson(tampered, 'provider:x')).toThrow();
  });
});
