import { ImportHistoricalClient } from './import-historical-client';

export default function ImportHistoricalPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">ייבוא קבלות היסטוריות</h1>
        <p className="text-muted-foreground">
          ייבוא קבלות משנים קודמות (נייר/אקסל) לתוכנה — שומר על המספור המקורי שלך,
          לא משפיע על המספור הרץ של 2026.
        </p>
      </div>
      <ImportHistoricalClient />
    </div>
  );
}
