import { Global, Module } from '@nestjs/common';
import { CredentialStore } from './engine/credential-store';
import { IntegrationEngine } from './engine/integration-engine.service';

@Global()
@Module({
  providers: [CredentialStore, IntegrationEngine],
  exports: [CredentialStore, IntegrationEngine],
})
export class IntegrationsModule {}
