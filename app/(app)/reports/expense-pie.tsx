'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { formatCurrency } from '@/lib/utils';

const COLORS = [
  '#2563eb',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#64748b',
];

export type PieDatum = { name: string; value: number; color?: string | null };

export function ExpensePie({ data }: { data: PieDatum[] }) {
  if (!data || data.length === 0) {
    return <p className="text-center text-muted-foreground py-8">אין הוצאות בשנה זו</p>;
  }

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="h-72" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={90}
            label={(e: any) => e.name}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.color || COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v: number, name: string) => {
              const pct = total > 0 ? ((v / total) * 100).toFixed(1) : '0';
              return [`${formatCurrency(v)} (${pct}%)`, name];
            }}
          />
          <Legend
            formatter={(value: string, _entry: any, i: number) => {
              const item = data[i];
              if (!item) return value;
              const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : '0';
              return `${value} - ${formatCurrency(item.value)} (${pct}%)`;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
