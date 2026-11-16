import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';
import { EncryptionService } from '../../../common/crypto/encryption.service';
import type { ProviderSecret } from '../adapters/types';

const TTL_MS = 30_000;

/** Loads & decrypts the active credential for a provider. Short in-memory cache; never logged. */
@Injectable()
export class CredentialStore {
  private cache = new Map<string, { at: number; secret: ProviderSecret | null }>();
  constructor(
    private readonly prisma: PrismaService,
    private readonly enc: EncryptionService,
  ) {}

  invalidate(providerId: string) {
    this.cache.delete(providerId);
  }

  async get(providerId: string): Promise<ProviderSecret | null> {
    const hit = this.cache.get(providerId);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.secret;
    const now = new Date();
    const cred = await this.prisma.providerCredential.findFirst({
      where: { providerId, isActive: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      orderBy: { createdAt: 'desc' },
    });
    const secret = cred
      ? this.enc.decryptJson<ProviderSecret>(cred, `provider:${providerId}`)
      : null;
    this.cache.set(providerId, { at: Date.now(), secret });
    return secret;
  }
}
