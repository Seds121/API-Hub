'use client';
import { PageHeader } from '@/components/page-header';
import { OrgsTable } from '@/components/admin/orgs-table';

export default function AgenciesPage() {
  return (
    <>
      <PageHeader title="Agencies" description="Reseller organizations. Approve an agency agreement (wholesale discount, revenue share, subaccount limit) from the organization page to activate reseller features." />
      <OrgsTable type="AGENCY" showParent={false} />
    </>
  );
}
