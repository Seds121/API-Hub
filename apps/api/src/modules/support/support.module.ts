import { Module } from '@nestjs/common';
import { AdminSupportController, ContactController, SupportController } from './support.controller';

@Module({ controllers: [SupportController, ContactController, AdminSupportController] })
export class SupportModule {}
