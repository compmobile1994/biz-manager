'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

export function RegenerateAllButton() {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);

  async function run() {
    if (running) return;
    if (
      !confirm(
        'לחדש את כל הקבלות הקיימות עם התבנית החדשה (כולל בס"ד)?\nהפעולה עשויה לקחת דקה-שתיים אם יש הרבה מסמכים.',
      )
    )
      return;
    setRunning(true);
    try {
      const res = await fetch('/api/documents/regenerate-all', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'שגיאה');
      toast({
        title: 'PDFים חודשו',
        description: `${json.regenerated} מתוך ${json.total}${json.failed ? ` · ${json.failed} נכשלו` : ''}`,
      });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'שגיאה', description: e.message });
    } finally {
      setRunning(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={run} disabled={running}>
      <RefreshCw className={`h-4 w-4 ${running ? 'animate-spin' : ''}`} />
      {running ? 'מחדש...' : 'חדש את כל ה-PDFים'}
    </Button>
  );
}
