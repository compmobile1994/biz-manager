import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/expenses/ai-extract
// Body: { fileBase64: string, mimeType: string, categories: [{id, name}] }
// Returns: { date: 'YYYY-MM-DD' | null, vendor: string | null,
//            amount: number | null, categoryId: string | null,
//            description: string | null }
//
// Uses Claude's vision API to read a Hebrew receipt image / PDF and
// extract structured expense data. Categories are passed in so the model
// can pick one of the user's actual categories (not invent new ones).
//
// Cost per call: ~$0.005 (Sonnet 4.5, ~1500 input tokens + ~200 output).
// Free tier or initial $5 credit → roughly 1000 receipts.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI not configured (missing API key)' }, { status: 500 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const { fileBase64, mimeType, categories } = body as {
    fileBase64?: string;
    mimeType?: string;
    categories?: { id: string; name: string }[];
  };
  if (!fileBase64 || !mimeType) {
    return NextResponse.json({ error: 'fileBase64 and mimeType required' }, { status: 400 });
  }

  const categoryList = (categories ?? [])
    .map((c) => `  - "${c.name}" (id: ${c.id})`)
    .join('\n');

  const systemPrompt = `אתה עוזר זריז וחכם לקריאת קבלות הוצאות עסקיות בעברית.

המשתמש הוא עוסק פטור ישראלי. תפקידך: לקרוא את הקבלה (תמונה או PDF) ולחלץ את הנתונים המבניים.

הקטגוריות הזמינות של המשתמש:
${categoryList || '  (אין קטגוריות מוגדרות)'}

החזר JSON עם השדות הבאים:
- "date": תאריך הקבלה בפורמט YYYY-MM-DD. אם לא ברור, החזר null.
- "vendor": שם הספק או החברה (לדוגמה "סלקום", "פז", "אופיס דיפו"). אם לא ברור, החזר null.
- "amount": הסכום הכולל כמספר שלם (בש"ח). אם יש מע"מ, החזר את הסכום הסופי הכולל. אם לא ברור, החזר null.
- "categoryId": ה-id (UUID) של הקטגוריה המתאימה ביותר מהרשימה. אם אין התאמה ברורה — null.
- "description": תיאור קצר של מה נקנה (לדוגמה "טעינת סלולר", "דלק", "ציוד משרדי"). מקסימום 50 תווים.

חשוב:
- אל תמציא נתונים. אם משהו לא ברור — null.
- החזר רק JSON תקין, בלי הסבר.
- אם אינך רואה קבלה בכלל (תמונה ריקה / משהו לא רלוונטי), החזר את כל השדות null.`;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    // PDF support — Claude 3.5+ accepts PDFs via the "document" content
    // type. Image formats (jpeg/png/gif/webp) go through "image". Anything
    // else is rejected up front so the user gets a friendly error.
    const isPdf = mimeType === 'application/pdf';
    const isImage = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mimeType);
    if (!isPdf && !isImage) {
      return NextResponse.json({ error: `פורמט לא נתמך: ${mimeType}` }, { status: 400 });
    }
    const fileContent: any = isPdf
      ? {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 },
        }
      : {
          type: 'image',
          source: { type: 'base64', media_type: mimeType, data: fileBase64 },
        };
    const message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 500,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            fileContent,
            { type: 'text', text: 'חלץ את הנתונים מהקבלה. החזר רק JSON.' },
          ],
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'no text response from AI' }, { status: 500 });
    }

    // Strip any markdown code fences the model might add despite instructions
    const raw = textBlock.text.trim().replace(/^```json\n?/i, '').replace(/\n?```$/, '');
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'AI returned invalid JSON', raw }, { status: 500 });
    }

    // Validate / sanitize
    const result = {
      date: typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null,
      vendor: typeof parsed.vendor === 'string' && parsed.vendor.trim() ? parsed.vendor.trim() : null,
      amount: typeof parsed.amount === 'number' && parsed.amount > 0 ? Math.round(parsed.amount) : null,
      categoryId: typeof parsed.categoryId === 'string' && parsed.categoryId.match(/^[0-9a-f-]{36}$/i)
        ? parsed.categoryId : null,
      description: typeof parsed.description === 'string' && parsed.description.trim()
        ? parsed.description.trim().slice(0, 60) : null,
    };

    return NextResponse.json(result);
  } catch (e: any) {
    // Surface the underlying Anthropic error message so the user can tell if
    // it's a quota issue, an invalid API key, an unsupported format, etc.
    const msg = e?.message ?? 'unknown error';
    return NextResponse.json({ error: `AI failed: ${msg}` }, { status: 500 });
  }
}
