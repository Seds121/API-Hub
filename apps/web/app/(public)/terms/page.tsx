import type { Metadata } from 'next';
import { LegalPage } from '@/components/site/legal';
import { COMPANY } from '@/lib/utils';

export const metadata: Metadata = { title: 'Terms of Service' };

export default function Terms() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="November 2026"
      sections={[
        ['Agreement', `These Terms govern your use of the ${COMPANY} API marketplace, gateway, dashboards and documentation (the "Service"). By creating an account you agree to them on behalf of yourself and your organization.`],
        ['Accounts & API keys', 'You are responsible for activity under your account and keys. Keep keys confidential; revoke compromised keys immediately. We may suspend accounts that endanger the Service or violate these Terms.'],
        ['Third-party APIs', 'APIs are supplied by third parties under redistribution agreements. Each API may carry additional usage restrictions shown on its listing, which you must follow. Suppliers may change or discontinue APIs; we will give notice where reasonably possible.'],
        ['Acceptable use', 'You may not use the Service for unlawful purposes, to infringe privacy or intellectual property, to circumvent rate limits or quotas, to resell access except under an approved agency agreement, or to attempt to access supplier systems directly.'],
        ['Fees, wallet & billing', 'Usage is charged per successful request at listed prices or agreed custom rates. Prepaid balances are deducted in real time. Subscription fees are charged in advance for each period. Taxes may apply. Refunds are issued at our discretion or as required by law.'],
        ['Agencies & resellers', 'Agency features require an approved agreement. Agencies are responsible for their subaccounts and may only resell APIs whose supplier licenses permit sub-resale.'],
        ['Availability & liability', 'The Service is provided "as is". To the extent permitted by law, our aggregate liability is limited to the fees you paid in the 12 months preceding the claim.'],
        ['Changes', 'We may update these Terms; material changes will be notified in advance via the dashboard or email.'],
      ]}
    />
  );
}
