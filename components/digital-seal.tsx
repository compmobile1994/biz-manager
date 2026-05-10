// SVG digital signature seal — used in document preview + print view.
// PDF version is rendered manually in lib/pdf/document-pdf.ts.

interface DigitalSealProps {
  size?: number;
  color?: string;
  appName?: string;
  className?: string;
}

export function DigitalSeal({
  size = 80,
  color = '#111111',
  appName = 'ניהול עסק',
  className,
}: DigitalSealProps) {
  // Both arcs go LEFT→RIGHT. SVG textPath places glyphs perpendicular to
  // the path's direction with their tops on the OUTER side of the curve.
  //   • Top arc  L→R UPPER (sweep=1) → tangent at top points RIGHT, glyph-tops UP.
  //   • Bottom arc L→R LOWER (sweep=0) → tangent at bottom points RIGHT, glyph-tops also UP.
  // Hebrew BiDi places visual-leftmost char first along the path; with text-anchor=middle
  // the text is centered, and the first logical Hebrew char (e.g. מ in מסמך) ends up on the right.
  const topArc = 'M 15,50 A 35,35 0 0 1 85,50';
  const bottomArc = 'M 15,50 A 35,35 0 0 0 85,50';

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Invisible reference paths used by textPath (kept off-render via fill/stroke none). */}
        <path id="seal-top-arc" d={topArc} fill="none" stroke="none" />
        <path id="seal-bottom-arc" d={bottomArc} fill="none" stroke="none" />
      </defs>

      {/* Outer circle */}
      <circle cx="50" cy="50" r="46" fill="white" stroke={color} strokeWidth="2.5" />
      {/* Inner ring (subtle separation) */}
      <circle cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth="0.5" />

      {/* Top curved text */}
      <text fill={color} fontSize="7" fontWeight="700" letterSpacing="0.3">
        <textPath href="#seal-top-arc" startOffset="50%" textAnchor="middle">
          מסמך זה חתום דיגיטלית
        </textPath>
      </text>

      {/* Bottom curved text */}
      <text fill={color} fontSize="7" fontWeight="700" letterSpacing="0.3">
        <textPath href="#seal-bottom-arc" startOffset="50%" textAnchor="middle">
          {appName}
        </textPath>
      </text>

      {/* Lock icon in center — solid silhouette, no internal keyhole line */}
      <g transform="translate(50, 50)" fill={color} stroke="none">
        {/* Shackle (rounded U) */}
        <path
          d="M -6 -2 V -6 a 6 6 0 0 1 12 0 V -2"
          fill="none"
          stroke={color}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        {/* Body (rounded rectangle) */}
        <rect x="-8" y="-2" width="16" height="12" rx="1.8" />
      </g>
    </svg>
  );
}
