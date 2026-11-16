'use client';
import { useState } from 'react';
import { Lock } from 'lucide-react';
import { Button } from './ui/button';
import { Textarea } from './ui/input';
import { cn, date } from '@/lib/utils';

export interface TicketMsg { id: string; body: string; isInternal: boolean; createdAt: string; author: { name: string; email?: string } }

export function TicketThread({ messages, onReply, canInternal, closed, sending }: { messages: TicketMsg[]; onReply: (body: string, internal: boolean) => Promise<unknown>; canInternal?: boolean; closed?: boolean; sending?: boolean }) {
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  return (
    <div className="space-y-4">
      <ol className="space-y-3">
        {messages.map((m) => (
          <li key={m.id} className={cn('rounded-lg border p-4', m.isInternal ? 'border-amber-500/30 bg-amber-500/5' : 'bg-card')}>
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{m.author.name}{m.isInternal && <span className="ml-2 inline-flex items-center gap-1 text-amber-600"><Lock className="h-3 w-3" /> internal note</span>}</span>
              <span>{date(m.createdAt, true)}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm">{m.body}</p>
          </li>
        ))}
      </ol>
      {closed ? (
        <p className="text-sm text-muted-foreground">This ticket is closed.</p>
      ) : (
        <form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); if (!body.trim()) return; await onReply(body, internal); setBody(''); }}>
          <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a reply…" aria-label="Reply" />
          <div className="flex items-center justify-between">
            {canInternal ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Internal note (hidden from customer)</label> : <span />}
            <Button type="submit" loading={sending}>Send</Button>
          </div>
        </form>
      )}
    </div>
  );
}
