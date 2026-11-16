'use client';
import { PageHeader } from '@/components/page-header';
import { OrgsTable } from '@/components/admin/orgs-table';

export default function OrganizationsPage() {
  return (
    <>
      <PageHeader title="Organizations" description="Every tenant: direct customers, agencies and agency subaccounts. Data is strictly isolated per organization." />
      <OrgsTable />
    </>
  );
}
