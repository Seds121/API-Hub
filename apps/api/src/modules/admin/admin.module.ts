import { Module } from '@nestjs/common';
import { AdminOpsController } from './admin-ops.controller';
import { AdminSystemController } from './admin-system.controller';
import { AnalyticsService } from '../analytics/analytics.service';

@Module({ controllers: [AdminOpsController, AdminSystemController], providers: [AnalyticsService] })
export class AdminModule {}
