// Ported 1:1 from the claude.ai/design mockup's computeDerived color system:
// 6 brand "flavor" hues, a fixed 4-level shade scale for group swatches,
// and a continuous tint-by-index scale for holdings within a group.

export const FLAVOR_HEXES = [
  "#F2547D", // 딸기 Strawberry
  "#3FB88B", // 민트 Mint
  "#F2A93C", // 망고 Mango
  "#4A7FD1", // 블루베리 Blueberry
  "#9B6FD1", // 포도 Grape
  "#3FB8C9", // 소다 Soda
] as const;

const SHADES = [
  { L: 48, C: 0.12 },
  { L: 62, C: 0.09 },
  { L: 74, C: 0.06 },
  { L: 86, C: 0.035 },
];

export function hexToHue(hex: string): number {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return 0;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  if (max === min) h = 0;
  else if (max === r) h = 60 * (((g - b) / (max - min)) % 6);
  else if (max === g) h = 60 * ((b - r) / (max - min) + 2);
  else h = 60 * ((r - g) / (max - min) + 4);
  if (h < 0) h += 360;
  return Math.round(h);
}

export const FLAVOR_HUES = FLAVOR_HEXES.map(hexToHue);

/** Wraps modulo FLAVOR_HUES.length so a 7th+ group cycles back through the palette. */
export function hueForFlavorIndex(flavorIndex: number): number {
  const n = FLAVOR_HUES.length;
  return FLAVOR_HUES[((flavorIndex % n) + n) % n];
}

export function colorFor(hue: number, level = 0): string {
  const s = SHADES[level] ?? SHADES[0];
  return `oklch(${s.L}% ${s.C} ${hue})`;
}

export function groupColor(flavorIndex: number): string {
  return colorFor(hueForFlavorIndex(flavorIndex), 0);
}

export function flavorSwatchOptions(selectedFlavorIndex: number) {
  return FLAVOR_HUES.map((hue, idx) => ({
    flavorIndex: idx,
    color: colorFor(hue, 0),
    selected: idx === selectedFlavorIndex,
  }));
}

/**
 * Lighter/softer as a holding's stable index within its group grows, so any
 * number of holdings stays visually distinct without a fixed swatch set.
 * `index` must come from a stable order (created_at, id) — never from
 * render/sort order, since e.g. the rebalance table re-sorts by |diff|.
 */
export function tintForIndex(hue: number, index: number, total: number): string {
  const t = total > 1 ? index / (total - 1) : 0.35;
  const L = 60 + t * 28;
  const C = 0.1 - t * 0.07;
  return `oklch(${L.toFixed(1)}% ${C.toFixed(3)} ${hue})`;
}
