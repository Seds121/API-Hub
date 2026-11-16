import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis.service';

@ApiTags('health')
@Controller('api/health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  async ready() {
    const [db, cache] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      this.redis.client
        .ping()
        .then((r) => r === 'PONG')
        .catch(() => false),
    ]);
    return { status: db && cache ? 'ok' : 'degraded', database: db, redis: cache };
  }
}
