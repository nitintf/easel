/** Pool of creative AI agent names with distinctive accent colors */
export const AGENT_NAMES: Array<{ name: string; color: string }> = [
  { name: "Palette", color: "#e879f9" },
  { name: "Pixel", color: "#38bdf8" },
  { name: "Doodle", color: "#fb923c" },
  { name: "Sketch", color: "#a78bfa" },
  { name: "Prism", color: "#2dd4bf" },
  { name: "Mosaic", color: "#f472b6" },
  { name: "Easley", color: "#34d399" },
  { name: "Hue", color: "#fbbf24" },
  { name: "Swatch", color: "#60a5fa" },
  { name: "Figgy", color: "#f97316" },
  { name: "Inkwell", color: "#818cf8" },
  { name: "Cobalt", color: "#3b82f6" },
  { name: "Gesso", color: "#f0abfc" },
  { name: "Tint", color: "#4ade80" },
  { name: "Vector", color: "#22d3ee" },
  { name: "Raster", color: "#fb7185" },
  { name: "Gradient", color: "#c084fc" },
  { name: "Blueprint", color: "#38bdf8" },
  { name: "Pigment", color: "#f43f5e" },
  { name: "Charcoal", color: "#94a3b8" },
];

/** Simple string hash for deterministic selection */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/** Deterministically pick an agent name based on a seed string (e.g. tabId) */
export function pickAgentName(seed: string): { name: string; color: string } {
  const index = hashString(seed) % AGENT_NAMES.length;
  return AGENT_NAMES[index];
}
