import { Module } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { ProvidersModule } from '../providers/providers.module';

@Module({ imports: [ProvidersModule], providers: [JobsService], exports: [JobsService] })
export class JobsModule {}
