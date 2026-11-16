'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { QueryView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { ProductForm, ProductFormValue } from '@/components/admin/product-form';
import { call, useAction, useApi } from '@/lib/query';
import type { Category } from '@/lib/types';
import { num, relative } from '@/lib/utils';

interface AdminProduct { id: string; internalCode: string; slug: string; name: string; status: string; isDemo: boolean; updatedAt: string; category: { name: string }; _count: { endpoints: number; usageRecords: number } }

function Categories() {
  const q = useApi<Category[]>('/api/admin/categories', ['admin-categories']);
  const [v, setV] = useState({ name: '', slug: '', description: '' });
  const add = useAction(() => call('/api/admin/categories', { method: 'POST', body: { ...v, description: v.description || null } }), { success: 'Category created', invalidate: [['admin-categories']], onSuccess: () => setV({ name: '', slug: '', description: '' }) });
  const del = useAction((id: string) => call(`/api/admin/categories/${id}`, { method: 'DELETE' }), { success: 'Category deleted', invalidate: [['admin-categories']] });
  return (
    <div className="space-y-4">
      <form className="grid gap-2 rounded-lg border bg-card p-4 sm:grid-cols-4" onSubmit={(e) => (e.preventDefault(), add.mutate())}>
        <Field label="Name" htmlFor="cn"><Input id="cn" required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value, slug: v.slug || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-') })} /></Field>
        <Field label="Slug" htmlFor="cs"><Input id="cs" required value={v.slug} onChange={(e) => setV({ ...v, slug: e.target.value })} /></Field>
        <Field label="Description" htmlFor="cd"><Input id="cd" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
        <div className="flex items-end"><Button type="submit" loading={add.isPending} className="w-full"><Plus /> Add category</Button></div>
      </form>
      <QueryView q={q}>
        {(rows) => (
          <DataTable rows={rows} rowKey={(c) => c.id} columns={[
            { header: 'Name', cell: (c) => <span className="font-medium">{c.name}</span> },
            { header: 'Slug', cell: (c) => <code className="text-xs">{c.slug}</code> },
            { header: 'Published APIs', cell: (c) => c.productCount },
            { header: '', cell: (c) => <ConfirmDialog trigger={<Button variant="ghost" size="icon" aria-label="Delete category"><Trash2 /></Button>} title={`Delete ${c.name}?`} description="Only empty categories can be deleted." destructive confirmLabel="Delete" onConfirm={() => del.mutateAsync(c.id).then(() => undefined)} /> },
          ]} />
        )}
      </QueryView>
    </div>
  );
}

export default function AdminProducts() {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const q = useApi<AdminProduct[]>(`/api/admin/products${status ? `?status=${status}` : ''}`, ['admin-products', status]);
  const [open, setOpen] = useState(false);
  const create = useAction((b: Partial<ProductFormValue>) => call<AdminProduct>('/api/admin/products', { method: 'POST', body: b }), { success: 'API created as draft', invalidate: [['admin-products']], onSuccess: (p) => router.push(`/admin/products/${p.id}`) });
  return (
    <>
      <PageHeader title="API marketplace catalog" description="APIs published to customers. Each has an internal ID, endpoints, upstream integrations, pricing and license coverage." actions={<Button onClick={() => setOpen(true)}><Plus /> New API</Button>} />
      <Tabs defaultValue="apis">
        <TabsList><TabsTrigger value="apis">APIs</TabsTrigger><TabsTrigger value="categories">Categories</TabsTrigger></TabsList>
        <TabsContent value="apis">
          <QueryView q={q}>
            {(rows) => (
              <DataTable
                rows={rows}
                rowKey={(p) => p.id}
                onRowClick={(p) => router.push(`/admin/products/${p.id}`)}
                searchPlaceholder="Search name, slug or ID"
                toolbar={<Select className="w-40" value={status} onValueChange={setStatus} options={[{ value: '', label: 'All statuses' }, { value: 'PUBLISHED', label: 'Published' }, { value: 'DRAFT', label: 'Draft' }, { value: 'DISABLED', label: 'Disabled' }]} />}
                columns={[
                  { header: 'API', searchValue: (p) => `${p.name} ${p.slug} ${p.internalCode}`, cell: (p) => (<div><Link href={`/admin/products/${p.id}`} className="font-medium hover:underline">{p.name}</Link>{p.isDemo && <Badge variant="warning" className="ml-2">demo</Badge>}<p className="text-xs text-muted-foreground"><code>{p.internalCode}</code> · /v1/{p.slug}</p></div>) },
                  { header: 'Category', cell: (p) => p.category.name },
                  { header: 'Endpoints', cell: (p) => p._count.endpoints },
                  { header: 'Requests', cell: (p) => num(p._count.usageRecords) },
                  { header: 'Status', cell: (p) => <StatusBadge status={p.status} /> },
                  { header: 'Updated', cell: (p) => <span className="text-muted-foreground">{relative(p.updatedAt)}</span> },
                ]}
              />
            )}
          </QueryView>
        </TabsContent>
        <TabsContent value="categories"><Categories /></TabsContent>
      </Tabs>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent wide><DialogHeader><DialogTitle>New API</DialogTitle></DialogHeader><ProductForm onSubmit={(b) => create.mutate(b)} submitting={create.isPending} /></DialogContent>
      </Dialog>
    </>
  );
}
