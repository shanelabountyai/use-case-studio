/* Design tokens from the reference artifact (reference/ai-use-case-studio.jsx).
   Paper/ink/blueprint-blue palette + IBM Plex. Values are verbatim. */

export const C = {
  paper: "#F4F5F2", surface: "#FFFFFF", ink: "#141D27", inkSoft: "#525D68",
  line: "#D9DCD5", blue: "#1D46C8", blueSoft: "#E8EDFB", blueGrid: "#CBD5F0",
  green: "#1D7A4A", greenSoft: "#E5F2EA", amber: "#A97711", amberSoft: "#F7EED9",
  red: "#A63A2B", redSoft: "#F6E7E3",
};

export const SANS = 'var(--font-plex-sans),"IBM Plex Sans","Helvetica Neue",Helvetica,Arial,system-ui,sans-serif';
export const MONO = 'var(--font-plex-mono),"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';

export const inputStyle: React.CSSProperties = {
  fontFamily: SANS, fontSize: 14, color: C.ink, background: C.surface,
  border: `1px solid ${C.line}`, borderRadius: 2, width: "100%",
  padding: "8px 10px", outline: "none",
};

export const btn = (bg: string, fg: string, border?: string): React.CSSProperties => ({
  fontFamily: MONO, fontSize: 12, letterSpacing: "0.04em",
  background: bg, color: fg, border: border || "none",
  cursor: "pointer", padding: "8px 14px",
});
