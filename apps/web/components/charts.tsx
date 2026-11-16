'use client';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState } from './states';
import { BarChart3 } from 'lucide-react';

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];
const tooltipStyle = { background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12, color: 'hsl(var(--popover-foreground))' };
const axis = { stroke: 'hsl(var(--muted-foreground))', fontSize: 11, tickLine: false, axisLine: false };

export interface Series {
  key: string;
  label: string;
  color?: string;
}

function fmtBucket(v: string, granularity: 'minute' | 'hour' | 'day') {
  const d = new Date(v);
  if (granularity === 'day') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export function TimeAreaChart({ data, series, height = 260, granularity = 'day', valueFormatter }: { data: readonly object[]; series: Series[]; height?: number; granularity?: 'minute' | 'hour' | 'day'; valueFormatter?: (v: number) => string }) {
  if (!data.length) return <EmptyState icon={BarChart3} title="No data in this period" description="Activity will appear here once requests are made." className="h-[260px]" />;
  const rows = (data as Record<string, unknown>[]).map((d) => ({ ...d, _label: fmtBucket(String(d.bucket), granularity), ...Object.fromEntries(series.map((s) => [s.key, Number(d[s.key] ?? 0)])) }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={rows} margin={{ left: 0, right: 8, top: 8 }}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color ?? COLORS[i]} stopOpacity={0.28} />
              <stop offset="100%" stopColor={s.color ?? COLORS[i]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="_label" {...axis} minTickGap={24} />
        <YAxis {...axis} width={56} tickFormatter={valueFormatter} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => (valueFormatter ? valueFormatter(v) : v)} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) => (
          <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color ?? COLORS[i]} fill={`url(#g-${s.key})`} strokeWidth={2} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function SimpleBarChart({ data, xKey, series, height = 260, horizontal, valueFormatter }: { data: readonly object[]; xKey: string; series: Series[]; height?: number; horizontal?: boolean; valueFormatter?: (v: number) => string }) {
  if (!data.length) return <EmptyState icon={BarChart3} title="No data yet" className="h-[260px]" />;
  const rows = (data as Record<string, unknown>[]).map((d) => ({ ...d, ...Object.fromEntries(series.map((s) => [s.key, Number(d[s.key] ?? 0)])) }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ left: horizontal ? 8 : 0, right: 8 }}>
        <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={!horizontal} horizontal={!!horizontal || true} />
        {horizontal ? (
          <>
            <XAxis type="number" {...axis} tickFormatter={valueFormatter} />
            <YAxis type="category" dataKey={xKey} {...axis} width={140} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} {...axis} />
            <YAxis {...axis} width={56} tickFormatter={valueFormatter} />
          </>
        )}
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'hsl(var(--muted))' }} formatter={(v: number) => (valueFormatter ? valueFormatter(v) : v)} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color ?? COLORS[i]} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={36} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data, height = 220 }: { data: { name: string; value: number }[]; height?: number }) {
  if (!data.length || data.every((d) => !d.value)) return <EmptyState icon={BarChart3} title="No data yet" className="h-[220px]" />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="85%" paddingAngle={2} stroke="none">
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
