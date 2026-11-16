import { Global, Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { SpendTracker } from './spend-tracker.service';
import { SubscriptionService } from './subscription.service';
import { InvoiceService } from './invoice.service';
import { BillingController } from './billing.controller';

@Global()
@Module({
  controllers: [BillingController],
  providers: [WalletService, SpendTracker, SubscriptionService, InvoiceService],
  exports: [WalletService, SpendTracker, SubscriptionService, InvoiceService],
})
export class BillingModule {}
