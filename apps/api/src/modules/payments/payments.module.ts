import { Global, Module } from '@nestjs/common';
import { PaymentsController, WebhooksController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Global()
@Module({
  controllers: [PaymentsController, WebhooksController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
