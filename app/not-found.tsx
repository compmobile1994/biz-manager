import Link from 'next/link';
import { FileQuestion, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30" dir="rtl">
      <div className="bg-white rounded-lg shadow-md border max-w-md w-full p-6 space-y-4 text-center">
        <div className="flex justify-center">
          <div className="bg-blue-100 rounded-full p-3">
            <FileQuestion className="h-8 w-8 text-blue-600" />
          </div>
        </div>
        <h1 className="text-3xl font-bold">404</h1>
        <h2 className="text-xl font-semibold">הדף לא קיים</h2>
        <p className="text-muted-foreground">
          הקישור שניסית לפתוח אינו קיים — אולי נמחק או הקלדת אותו לא נכון.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors mt-2"
        >
          <Home className="h-4 w-4" />
          חזור למסך הבית
        </Link>
      </div>
    </div>
  );
}
