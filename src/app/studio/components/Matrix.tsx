"use client";

import { C, MONO } from "../theme";

/* Blueprint SVG impact×effort matrix, ported verbatim from the reference. */
export function Matrix({ impact, effort, quadrant, name }: { impact: number; effort: number; quadrant: string; name: string }) {
  const S = 300, P = 34;
  const x = P + effort * (S - 2 * P);
  const y = S - P - impact * (S - 2 * P);
  const grid = [0.25, 0.5, 0.75];
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="w-full" style={{ maxWidth: 360, background: C.blueSoft, border: `1px solid ${C.blueGrid}` }} role="img" aria-label={`Impact–effort matrix: ${name || "use case"} in the ${quadrant} quadrant`}>
      {grid.map((g) => (
        <g key={g}>
          <line x1={P + g * (S - 2 * P)} y1={P} x2={P + g * (S - 2 * P)} y2={S - P} stroke={C.blueGrid} strokeWidth={g === 0.5 ? 1.2 : 0.6} strokeDasharray={g === 0.5 ? "" : "2 3"} />
          <line x1={P} y1={P + g * (S - 2 * P)} x2={S - P} y2={P + g * (S - 2 * P)} stroke={C.blueGrid} strokeWidth={g === 0.5 ? 1.2 : 0.6} strokeDasharray={g === 0.5 ? "" : "2 3"} />
        </g>
      ))}
      <rect x={P} y={P} width={S - 2 * P} height={S - 2 * P} fill="none" stroke={C.blue} strokeWidth="1" />
      {([["QUICK WIN", P + 6, P + 14], ["BIG BET", S - P - 6, P + 14, "end"], ["FILL-IN", P + 6, S - P - 8], ["MONEY PIT", S - P - 6, S - P - 8, "end"]] as [string, number, number, ("start" | "end")?][]).map(([t, tx, ty, a]) => (
        <text key={t} x={tx} y={ty} textAnchor={a || "start"} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em" }} fill={quadrant.toUpperCase() === t ? C.blue : "#8FA0C9"}>{t}</text>
      ))}
      <line x1={x} y1={P} x2={x} y2={S - P} stroke={C.blue} strokeWidth="0.5" strokeDasharray="3 3" />
      <line x1={P} y1={y} x2={S - P} y2={y} stroke={C.blue} strokeWidth="0.5" strokeDasharray="3 3" />
      <circle cx={x} cy={y} r="6" fill={C.blue} />
      <circle cx={x} cy={y} r="10" fill="none" stroke={C.blue} strokeWidth="1" />
      <text x={S / 2} y={S - 8} textAnchor="middle" style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em" }} fill={C.inkSoft}>EFFORT →</text>
      <text x={12} y={S / 2} textAnchor="middle" transform={`rotate(-90 12 ${S / 2})`} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em" }} fill={C.inkSoft}>IMPACT →</text>
      <text x={x} y={y - 16} textAnchor="middle" style={{ fontFamily: MONO, fontSize: 9 }} fill={C.blue}>[{effort.toFixed(2)}, {impact.toFixed(2)}]</text>
    </svg>
  );
}
