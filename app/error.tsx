'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Log to console for the developer; in production this is also visible in Vercel logs.
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30" dir="rtl">
      <div className="bg-white rounded-lg shadow-md border max-w-md w-full p-6 space-y-4 text-center">
        <div className="flex justify-center">
          <div className="bg-red-100 rounded-full p-3">
            <AlertTriangle className="h-8 w-8 text-red-600" />
          </div>
        </div>
        <h1 className="text-2xl font-bold">משהו השתבש</h1>
        <p className="text-muted-foreground">
          קרתה תקלה לא צפויה. הנתונים שלך לא נפגעו — כולם שמורים בענן ויחזרו ברגע שנפתור את הבעיה.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground font-mono bg-muted/50 rounded px-2 py-1">
            קוד תקלה: {error.digest}
          </p>
        )}
        <div className="flex gap-2 justify-center pt-2">
          <button
            onClick={() => reset()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            נסה שוב
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-muted transition-colors"
          >
            <Home className="h-4 w-4" />
            חזור למסך הבית
          </Link>
        </div>
        <p className="text-xs text-muted-foreground pt-3">
          אם זה ממשיך לקרות, סגור ופתח את האפליקציה. בעיה ממשית? פנה לתמיכה.
        </p>
      </div>
    </div>
  );
}
