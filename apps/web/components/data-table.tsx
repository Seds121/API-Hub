'use client';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Table, TBody, TD, TH, THead, TR } from './ui/table';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { EmptyState } from './states';
import { cn } from '@/lib/utils';

export interface Column<T> {
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  className?: string;
  /** Text used by the client-side search box. */
  searchValue?: (row: T) => string;
}

/** Presentational table with optional client-side search & paging (server-paged data passes `pagination`). */
export function DataTable<T>({ rows, columns, rowKey, empty, searchPlaceholder, toolbar, pageSize = 25, pagination, onRowClick, dense }: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (r: T) => string;
  empty?: { title: string; description?: string; action?: React.ReactNode };
  searchPlaceholder?: string;
  toolbar?: React.ReactNode;
  pageSize?: number;
  pagination?: { page: number; pageCount: number; total: number; onPage: (p: number) => void };
  onRowClick?: (r: T) => void;
  dense?: boolean;
}) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const searchable = columns.some((c) => c.searchValue);
  const filtered = useMemo(() => {
    if (!q || !searchable) return rows;
    const needle = q.toLowerCase();
    return rows.filter((r) => columns.some((c) => c.searchValue?.(r).toLowerCase().includes(needle)));
  }, [rows, q, columns, searchable]);
  const clientPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = pagination ? filtered : filtered.slice((page - 1) * pageSize, page * pageSize);
  const pg = pagination ?? { page, pageCount: clientPages, total: filtered.length, onPage: setPage };

  return (
    <div className="space-y-3">
      {(searchable || toolbar) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {searchable ? (
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} placeholder={searchPlaceholder ?? 'Search…'} className="pl-8" aria-label="Search table" />
            </div>
          ) : (
            <span />
          )}
          {toolbar && <div className="flex flex-wrap gap-2">{toolbar}</div>}
        </div>
      )}
      {visible.length === 0 ? (
        <EmptyState title={empty?.title ?? 'Nothing here yet'} description={empty?.description} action={empty?.action} />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                {columns.map((c, i) => (
                  <TH key={i} className={c.className}>
                    {c.header}
                  </TH>
                ))}
              </TR>
            </THead>
            <TBody>
              {visible.map((r) => (
                <TR key={rowKey(r)} className={cn(onRowClick && 'cursor-pointer')} onClick={onRowClick ? () => onRowClick(r) : undefined}>
                  {columns.map((c, i) => (
                    <TD key={i} className={cn(dense && 'py-1.5', c.className)}>
                      {c.cell(r)}
                    </TD>
                  ))}
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
      {pg.pageCount > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {pg.total} total · page {pg.page} of {pg.pageCount}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={pg.page <= 1} onClick={() => pg.onPage(pg.page - 1)} aria-label="Previous page">
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="sm" disabled={pg.page >= pg.pageCount} onClick={() => pg.onPage(pg.page + 1)} aria-label="Next page">
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
