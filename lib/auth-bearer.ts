// Constant-time comparison helper for service-role bearer tokens.
//
// Plain `===` short-circuits on the first different byte, leaking timing info
// that lets an attacker iteratively guess the token character by character.
// crypto.timingSafeEqual always touches the full buffer length, so the
// comparison takes the same time regardless of where the difference is.
//
// Also rejects fast when the lengths differ (which is itself observable but
// not exploitable — knowing the token length doesn't help recover the bytes).
import { timingSafeEqual } from 'node:crypto';

export function isServiceRoleBearer(authHeader: string | null | undefined): boolean {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const expected = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!expected) return false;
  const provided = authHeader.slice(7);
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}
