// Simplified BiDi (Unicode Bidirectional) handling for pdf-lib output.
//
// pdf-lib has no BiDi support — we feed it the visually-ordered glyph
// sequence directly. The strategy:
//   1. Classify each codepoint as Strong-RTL (R), Strong-LTR (L) or Neutral (N).
//   2. Group codepoints into runs of the same class. Neutrals attach to the
//      surrounding strong direction (or to the paragraph base direction at
//      the edges).
//   3. For an RTL paragraph: reverse only R runs internally, then reverse the
//      sequence of runs as a whole. L runs (numbers, latin, currency) keep
//      their internal order, so "₪123.45" stays readable.
//   4. Bracket pairs are mirrored when they appear inside an R-run so that
//      "(שלום)" renders as "(שלום)" visually.
//
// This is a pragmatic subset of UAX#9, not a full implementation, but it
// covers the cases we hit in business documents (mixed Hebrew/Latin/digits/
// currency/punctuation/parentheses).

type Dir = 'R' | 'L' | 'N';

const HEBREW_RE = /[֐-׿יִ-ﭏ]/;
const LATIN_DIGIT_RE = /[A-Za-z0-9]/;
// Characters whose direction depends on the surrounding strong context.
// Includes whitespace, punctuation, currency, slashes, hyphens, etc.
const NEUTRAL_RE = /[\s.,:;!?'"\-_/\\@#$%^&*+=|~`₪€$£•·–—‘’“”־׳״()[\]{}<>]/;

const BRACKET_MIRRORS: Record<string, string> = {
  '(': ')',
  ')': '(',
  '[': ']',
  ']': '[',
  '{': '}',
  '}': '{',
  '<': '>',
  '>': '<',
  '“': '”', // “ ↔ ”
  '”': '“',
  '‘': '’', // ‘ ↔ ’
  '’': '‘',
};

function classify(ch: string): Dir {
  if (HEBREW_RE.test(ch)) return 'R';
  if (LATIN_DIGIT_RE.test(ch)) return 'L';
  if (NEUTRAL_RE.test(ch)) return 'N';
  // Default unknown / symbols to neutral.
  return 'N';
}

// Resolve neutrals: attach each neutral run to the surrounding strong direction.
// At the edges, fall back to the paragraph base direction.
function resolveDirections(chars: string[], base: Dir): Dir[] {
  const dirs: Dir[] = chars.map(classify);
  const n = dirs.length;

  // Forward pass: a neutral takes the direction of the previous strong char
  // when the next strong char matches it; otherwise we'll fix it on backward.
  // Simpler heuristic: each neutral run becomes the prev strong dir if the
  // next strong dir is the same, else neighbor-favored. We approximate by
  // letting neutrals follow the previous strong; trailing neutrals follow
  // the following strong; isolated neutrals fall back to base.
  let prevStrong: Dir = base;
  for (let i = 0; i < n; i++) {
    if (dirs[i] === 'R' || dirs[i] === 'L') {
      prevStrong = dirs[i];
      continue;
    }
    // neutral — find next strong
    let nextStrong: Dir | null = null;
    for (let j = i + 1; j < n; j++) {
      if (dirs[j] === 'R' || dirs[j] === 'L') {
        nextStrong = dirs[j];
        break;
      }
    }
    const target: Dir = nextStrong ?? prevStrong ?? base;
    // Walk forward over the contiguous neutral run and assign.
    let k = i;
    while (k < n && dirs[k] === 'N') {
      dirs[k] = target;
      k++;
    }
    i = k - 1;
  }
  return dirs;
}

interface Run {
  dir: Dir; // 'R' or 'L' after resolution
  text: string;
}

function buildRuns(chars: string[], dirs: Dir[]): Run[] {
  const runs: Run[] = [];
  let i = 0;
  while (i < chars.length) {
    const d = dirs[i];
    let j = i;
    let buf = '';
    while (j < chars.length && dirs[j] === d) {
      buf += chars[j];
      j++;
    }
    runs.push({ dir: d === 'N' ? 'L' : d, text: buf });
    i = j;
  }
  return runs;
}

function reverseRtlText(s: string): string {
  // Reverse code points and mirror bracket pairs.
  const out: string[] = [];
  for (const ch of [...s].reverse()) {
    out.push(BRACKET_MIRRORS[ch] ?? ch);
  }
  return out.join('');
}

/**
 * Produce a visually-ordered string for an RTL paragraph that may contain
 * mixed Latin/digit/punctuation segments. Pass `base = 'L'` for LTR-base text.
 *
 * Empty input returns empty string. Pure-Latin input passes through unchanged.
 */
export function shapeBidi(text: string, base: Dir = 'R'): string {
  if (!text) return '';
  const chars = [...text]; // codepoint-aware
  if (chars.length === 0) return '';

  const dirs = resolveDirections(chars, base);
  const runs = buildRuns(chars, dirs);

  if (base === 'R') {
    // Reverse R runs internally (mirroring brackets), keep L runs as-is,
    // then reverse the run sequence so the output is visual order RTL.
    const visual = runs.map((r) => (r.dir === 'R' ? reverseRtlText(r.text) : r.text));
    return visual.reverse().join('');
  } else {
    // LTR base: keep run order; only reverse R runs internally.
    return runs.map((r) => (r.dir === 'R' ? reverseRtlText(r.text) : r.text)).join('');
  }
}

/** Convenience: shape an RTL paragraph. */
export function rtl(text: string): string {
  return shapeBidi(text, 'R');
}

/** Convenience: shape an LTR-base paragraph that may contain Hebrew. */
export function ltr(text: string): string {
  return shapeBidi(text, 'L');
}
