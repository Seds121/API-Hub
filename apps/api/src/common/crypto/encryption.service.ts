import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { env } from '../../config/env';

export interface EncryptedPayload {
  cipherText: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

/**
 * AES-256-GCM envelope for supplier credentials and MFA secrets.
 * Keys come only from the environment (or a KMS-backed env injection in production).
 */
@Injectable()
export class EncryptionService {
  private readonly keys = new Map<number, Buffer>();
  private readonly currentVersion: number;

  constructor() {
    const e = env();
    this.currentVersion = e.CREDENTIAL_ENCRYPTION_KEY_VERSION;
    this.keys.set(this.currentVersion, Buffer.from(e.CREDENTIAL_ENCRYPTION_KEY, 'base64'));
    for (const part of (e.CREDENTIAL_ENCRYPTION_OLD_KEYS ?? '').split(',').filter(Boolean)) {
      const [v, k] = part.split(':');
      if (v && k) this.keys.set(Number(v), Buffer.from(k, 'base64'));
    }
  }

  encrypt(plain: string, aad = 'zeze'): EncryptedPayload {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.keys.get(this.currentVersion)!, iv);
    cipher.setAAD(Buffer.from(aad));
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return {
      cipherText: ct.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      keyVersion: this.currentVersion,
    };
  }

  decrypt(p: EncryptedPayload, aad = 'zeze'): string {
    const key = this.keys.get(p.keyVersion);
    if (!key) throw new Error(`No encryption key for version ${p.keyVersion}`);
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(p.iv, 'base64'));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(Buffer.from(p.authTag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(p.cipherText, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  encryptJson(obj: unknown, aad?: string) {
    return this.encrypt(JSON.stringify(obj), aad);
  }
  decryptJson<T>(p: EncryptedPayload, aad?: string): T {
    return JSON.parse(this.decrypt(p, aad)) as T;
  }
}
