import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';
import { EncryptionService } from './crypto/encryption.service';
import { AuditService } from './audit.service';
import { SessionResolver } from '../modules/auth/session.resolver';

@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [PrismaService, RedisService, EncryptionService, AuditService, SessionResolver],
  exports: [
    PrismaService,
    RedisService,
    EncryptionService,
    AuditService,
    SessionResolver,
    JwtModule,
  ],
})
export class CommonModule {}
