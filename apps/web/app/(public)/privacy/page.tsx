import type { Metadata } from 'next';
import { LegalPage } from '@/components/site/legal';
import { COMPANY } from '@/lib/utils';

export const metadata: Metadata = { title: 'Privacy Policy' };

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="November 2026"
      sections={[
        ['Who we are', `${COMPANY} operates this API marketplace and acts as a controller for account data and as a processor for request data you send through the gateway.`],
        ['Data we collect', 'Account data (name, email, organization, billing details), security data (hashed passwords, session metadata, audit logs) and usage metadata (endpoint, status, latency, cost, truncated IP prefix). We do not store request or response bodies of gateway traffic.'],
        ['How we use data', 'To provide and secure the Service, meter usage, bill accurately, prevent fraud, provide support and meet legal obligations.'],
        ['Suppliers', 'Gateway requests are forwarded to the upstream supplier of the API you call, using our credentials. Suppliers receive the parameters you send but not your account identity unless the API requires it.'],
        ['Retention', 'Request metadata is retained for a configurable period (90 days by default) and then deleted. Financial records are retained as required by law. Audit logs are retained for security purposes.'],
        ['Security', 'Encryption in transit, encrypted supplier credentials, hashed API keys and passwords, role-based access control, immutable financial ledger and audit logging.'],
        ['Your rights', 'Depending on your jurisdiction you may access, correct, export or delete your personal data. Contact us via the Contact page.'],
      ]}
    />
  );
}
