// Ported 1:1 from the claude.ai/design mockup's computeDerived color system:
// 6 brand "flavor" hues (still used for one-off semantic colors like
// GOOD_COLOR) and a fixed 4-level shade scale. Group colors themselves are no
// longer picked from this fixed set — see hueForGroupIndex below.

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

export function colorFor(hue: number, level = 0): string {
  const s = SHADES[level] ?? SHADES[0];
  return `oklch(${s.L}% ${s.C} ${hue})`;
}

/** Hue wheel start for group index 0, chosen away from the destructive red hue. */
const GROUP_HUE_START = 200;

/**
 * Each asset group's color is derived purely from its position among the
 * user's groups (`sortOrder`), evenly spaced around the hue wheel — not
 * user-settable, not stored. This stays maximally distinct for any number
 * of groups, unlike a fixed palette that collides once there are more
 * groups than preset colors.
 */
export function hueForGroupIndex(index: number, total: number): number {
  const n = Math.max(total, 1);
  return (GROUP_HUE_START + (360 * index) / n) % 360;
}

export function groupColor(index: number, total: number): string {
  return colorFor(hueForGroupIndex(index, total), 0);
}
