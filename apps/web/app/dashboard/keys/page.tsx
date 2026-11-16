'use client';
import { useState } from 'react';
import { KeyRound, MoreHorizontal, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import { QueryView } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { KeyForm, KeyFormValues, SecretReveal } from '@/components/key-form';
import { StatusBadge } from '@/components/status-badge';
import { call, useAction, useApi } from '@/lib/query';
import { can, useMe } from '@/lib/session';
import type { ApiKeyRow } from '@/lib/dash-types';
import { date, relative } from '@/lib/utils';

export default function KeysPage() {
  const me = useMe();
  const keys = useApi<ApiKeyRow[]>('/api/keys', ['keys']);
  const [createOpen, setCreateOpen] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [editing, setEditing] = useState<ApiKeyRow | null>(null);
  const [pending, setPending] = useState<{ action: 'revoke' | 'regen'; key: ApiKeyRow } | null>(null);
  const writable = can(me.data, 'org:keys:write');

  const create = useAction((v: KeyFormValues) => call<ApiKeyRow>('/api/keys', { method: 'POST', body: v }), { success: 'API key created', invalidate: [['keys']], onSuccess: (r) => (setCreateOpen(false), setSecret(r.secret ?? null)) });
  const update = useAction((v: KeyFormValues & { id: string }) => call(`/api/keys/${v.id}`, { method: 'PATCH', body: { name: v.name, scopes: v.scopes, allowedIps: v.allowedIps, rateLimitPerMinute: v.rateLimitPerMinute, expiresAt: v.expiresAt } }), { success: 'Key updated', invalidate: [['keys']], onSuccess: () => setEditing(null) });
  const revoke = useAction((id: string) => call(`/api/keys/${id}`, { method: 'DELETE' }), { success: 'Key revoked', invalidate: [['keys']] });
  const regen = useAction((id: string) => call<ApiKeyRow>(`/api/keys/${id}/regenerate`, { method: 'POST' }), { success: 'Key regenerated — the old key no longer works', invalidate: [['keys']], onSuccess: (r) => setSecret(r.secret ?? null) });

  return (
    <>
      <PageHeader
        title="API keys"
        description="Keys authenticate your requests to the gateway. Scope them to specific APIs, limit their rate, restrict IPs and set expiry."
        actions={writable && <Button onClick={() => setCreateOpen(true)}><Plus /> Create key</Button>}
      />
      <QueryView q={keys}>
        {(rows) => (
          <DataTable
            rows={rows}
            rowKey={(k) => k.id}
            searchPlaceholder="Search keys"
            empty={{ title: 'No API keys yet', description: 'Create a key to start calling APIs.', action: writable ? <Button size="sm" onClick={() => setCreateOpen(true)}><KeyRound /> Create your first key</Button> : undefined }}
            columns={[
              { header: 'Name', searchValue: (k) => `${k.name} ${k.prefix}`, cell: (k) => (<div><p className="font-medium">{k.name}</p><code className="text-xs text-muted-foreground">{k.prefix}_••••{k.last4}</code></div>) },
              { header: 'Env', cell: (k) => <StatusBadge status={k.environment} /> },
              { header: 'Scopes', cell: (k) => (k.scopes.includes('*') ? <Badge variant="secondary">All APIs</Badge> : <div className="flex max-w-[220px] flex-wrap gap-1">{k.scopes.map((s) => <Badge key={s} variant="outline">{s}</Badge>)}</div>) },
              { header: 'Limits', cell: (k) => <span className="text-xs text-muted-foreground">{k.rateLimitPerMinute ? `${k.rateLimitPerMinute}/min` : 'plan default'}{k.allowedIps.length ? ` · ${k.allowedIps.length} IP rule(s)` : ''}</span> },
              { header: 'Last used', cell: (k) => <span className="text-muted-foreground">{relative(k.lastUsedAt)}</span> },
              { header: 'Status', cell: (k) => (k.revokedAt ? <StatusBadge status="REVOKED" /> : k.expiresAt && new Date(k.expiresAt) < new Date() ? <StatusBadge status="EXPIRED" /> : <span className="text-xs text-muted-foreground">{k.expiresAt ? `expires ${date(k.expiresAt)}` : <StatusBadge status="ACTIVE" />}</span>) },
              {
                header: '',
                className: 'w-10',
                cell: (k) =>
                  writable && !k.revokedAt ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Actions for ${k.name}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing(k)}><Pencil /> Edit</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setPending({ action: 'regen', key: k })}><RefreshCw /> Regenerate</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onSelect={() => setPending({ action: 'revoke', key: k })}><Trash2 /> Revoke</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null,
              },
            ]}
          />
        )}
      </QueryView>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create API key</DialogTitle><DialogDescription>The secret is shown once after creation.</DialogDescription></DialogHeader>
          <KeyForm onSubmit={(v) => create.mutate(v)} submitting={create.isPending} />
        </DialogContent>
      </Dialog>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit key</DialogTitle></DialogHeader>
          {editing && <KeyForm isEdit initial={editing} onSubmit={(v) => update.mutate({ ...v, id: editing.id })} submitting={update.isPending} />}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title={pending?.action === 'revoke' ? `Revoke "${pending.key.name}"?` : 'Regenerate this key?'}
        description={pending?.action === 'revoke' ? 'Applications using this key will immediately receive 401 errors. This cannot be undone.' : 'The current secret stops working immediately and a new secret with the same settings is issued.'}
        confirmLabel={pending?.action === 'revoke' ? 'Revoke key' : 'Regenerate'}
        destructive={pending?.action === 'revoke'}
        onConfirm={async () => {
          if (!pending) return;
          if (pending.action === 'revoke') await revoke.mutateAsync(pending.key.id);
          else await regen.mutateAsync(pending.key.id);
          setPending(null);
        }}
      />
      <Dialog open={!!secret} onOpenChange={(o) => !o && setSecret(null)}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader><DialogTitle>Your new API key</DialogTitle></DialogHeader>
          {secret && <SecretReveal secret={secret} onDone={() => setSecret(null)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
