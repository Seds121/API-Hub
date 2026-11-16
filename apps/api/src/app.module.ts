import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { CommonModule } from './common/common.module';
import { AllExceptionsFilter } from './common/http/exception.filter';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { AuthGuard } from './common/guards/auth.guard';
import { HealthController } from './modules/health/health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { OrgsModule } from './modules/orgs/orgs.module';
import { LicenseModule } from './modules/licenses/license.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { ProvidersModule } from './modules/providers/providers.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { BillingModule } from './modules/billing/billing.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { UsageModule } from './modules/usage/usage.module';
import { GatewayModule } from './modules/gateway/gateway.module';
import { AgencyModule } from './modules/agency/agency.module';
import { SupportModule } from './modules/support/support.module';
import { AdminModule } from './modules/admin/admin.module';
import { JobsModule } from './modules/jobs/jobs.module';

@Module({
  imports: [
    CommonModule,
    LicenseModule,
    IntegrationsModule,
    PricingModule,
    BillingModule,
    UsageModule,
    ApiKeysModule,
    PaymentsModule,
    AuthModule,
    OrgsModule,
    ProvidersModule,
    CatalogModule,
    GatewayModule,
    AgencyModule,
    SupportModule,
    AdminModule,
    JobsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
