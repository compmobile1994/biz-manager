'use client';

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCurrency } from '@/lib/utils';

type Point = { label: string; income: number; expenses: number };

export function DashboardChart({ data }: { data: Point[] }) {
  return (
    <div className="h-72 w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" reversed />
          <YAxis tickFormatter={(v) => new Intl.NumberFormat('he-IL').format(v)} />
          <Tooltip formatter={(v: number) => formatCurrency(v)} />
          <Legend />
          <Bar dataKey="income" name="הכנסות" fill="hsl(221.2 83.2% 53.3%)" />
          <Bar dataKey="expenses" name="הוצאות" fill="hsl(0 84.2% 60.2%)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
