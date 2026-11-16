'use client';
import { useState } from 'react';
import { Button } from '../ui/button';
import { Field } from '../ui/label';
import { Input, Textarea } from '../ui/input';
import { Select } from '../ui/select';
import { Switch } from '../ui/switch';
import { useApi } from '@/lib/query';
import type { Category } from '@/lib/types';

export interface ProductFormValue {
  name: string;
  slug: string;
  summary: string;
  description: string | null;
  docsMarkdown: string | null;
  categoryId: string;
  tags: string[];
  publisherName: string | null;
  usageRestrictions: string | null;
  isFeatured: boolean;
  requiresSubscription: boolean;
  defaultRateLimitPerMinute: number;
}

export function ProductForm({ initial, onSubmit, submitting, isEdit }: { initial?: Partial<ProductFormValue>; onSubmit: (v: Partial<ProductFormValue>) => void; submitting?: boolean; isEdit?: boolean }) {
  const cats = useApi<Category[]>('/api/admin/categories', ['admin-categories']);
  const [v, setV] = useState({
    name: initial?.name ?? '',
    slug: initial?.slug ?? '',
    summary: initial?.summary ?? '',
    description: initial?.description ?? '',
    docsMarkdown: initial?.docsMarkdown ?? '',
    categoryId: initial?.categoryId ?? '',
    tags: (initial?.tags ?? []).join(', '),
    publisherName: initial?.publisherName ?? '',
    usageRestrictions: initial?.usageRestrictions ?? '',
    isFeatured: initial?.isFeatured ?? false,
    requiresSubscription: initial?.requiresSubscription ?? false,
    defaultRateLimitPerMinute: String(initial?.defaultRateLimitPerMinute ?? 60),
  });
  const t = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          name: v.name,
          ...(isEdit ? {} : { slug: v.slug }),
          summary: v.summary,
          description: v.description || null,
          docsMarkdown: v.docsMarkdown || null,
          categoryId: v.categoryId,
          tags: v.tags.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
          publisherName: v.publisherName || null,
          usageRestrictions: v.usageRestrictions || null,
          isFeatured: v.isFeatured,
          requiresSubscription: v.requiresSubscription,
          defaultRateLimitPerMinute: Number(v.defaultRateLimitPerMinute),
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="n"><Input id="n" required value={v.name} onChange={t('name')} /></Field>
        <Field label="Public slug" hint={`Route: /v1/${v.slug || '<slug>'}/…`} htmlFor="s"><Input id="s" required disabled={isEdit} value={v.slug} onChange={t('slug')} /></Field>
      </div>
      <Field label="Summary" htmlFor="su"><Input id="su" required minLength={10} value={v.summary} onChange={t('summary')} /></Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Category"><Select value={v.categoryId} onValueChange={(c) => setV({ ...v, categoryId: c })} placeholder="Select" options={(cats.data ?? []).map((c) => ({ value: c.id, label: c.name }))} /></Field>
        <Field label="Display provider" hint="Shown in marketplace filter" htmlFor="pn"><Input id="pn" value={v.publisherName} onChange={t('publisherName')} /></Field>
        <Field label="Default rate limit / min" htmlFor="rl"><Input id="rl" type="number" min={1} value={v.defaultRateLimitPerMinute} onChange={t('defaultRateLimitPerMinute')} /></Field>
      </div>
      <Field label="Tags" hint="comma separated" htmlFor="tg"><Input id="tg" value={v.tags} onChange={t('tags')} /></Field>
      <Field label="Documentation (Markdown)" htmlFor="dm"><Textarea id="dm" rows={6} className="font-mono text-xs" value={v.docsMarkdown} onChange={t('docsMarkdown')} /></Field>
      <Field label="Usage restrictions" hint="From the supplier license — shown to customers" htmlFor="ur"><Textarea id="ur" rows={2} value={v.usageRestrictions} onChange={t('usageRestrictions')} /></Field>
      <div className="flex flex-wrap gap-6 text-sm">
        <label className="flex items-center gap-3"><Switch checked={v.isFeatured} onCheckedChange={(c) => setV({ ...v, isFeatured: c })} /> Featured</label>
        <label className="flex items-center gap-3"><Switch checked={v.requiresSubscription} onCheckedChange={(c) => setV({ ...v, requiresSubscription: c })} /> Requires active subscription</label>
      </div>
      <Button type="submit" disabled={!v.categoryId} loading={submitting}>{isEdit ? 'Save' : 'Create API (draft)'}</Button>
    </form>
  );
}
