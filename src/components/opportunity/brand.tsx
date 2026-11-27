/**
 * Per-organization tile colours. Each company gets one stable light colour (yellow, green, red, pink, blue, lavender,
 * peach, aqua), the same everywhere it appears. `deep` is a slightly stronger shade for accents on the tile; `ink`
 * is a text colour with at least 4.5:1 contrast on the tile.
 */
const TONES = [
  { tile: "#FFF3C4", deep: "#FFE58A", ink: "#7A5A00" }, // light yellow
  { tile: "#DFF5D8", deep: "#B9E8AC", ink: "#256B2E" }, // light green
  { tile: "#FFE1DC", deep: "#FFC2B8", ink: "#A12F1F" }, // light red
  { tile: "#FFE0EC", deep: "#FFBFD7", ink: "#A2275A" }, // light pink
  { tile: "#DDEBFF", deep: "#B7D3FF", ink: "#1E54A8" }, // light blue
  { tile: "#E9E4FF", deep: "#CFC4FF", ink: "#4B3BB0" }, // lavender
  { tile: "#FFE8D2", deep: "#FFCFA3", ink: "#9A4A0B" }, // peach
  { tile: "#D9F4F1", deep: "#AEE6DF", ink: "#13696A" }, // aqua
] as const;

export type OrgTone = (typeof TONES)[number];

/**
 * Tile colours for grids, in the reference order (lavender, peach, green, yellow, blue, pink). Chosen by position so
 * neighbouring tiles never share a colour. Soft, flat fills: no gradients.
 */
const GRID_TONES = [
  { tile: "#EEEAFC", ink: "#4B3BB0" }, // lavender
  { tile: "#FCEEE0", ink: "#9A4A0B" }, // peach
  { tile: "#E9F5E3", ink: "#256B2E" }, // green
  { tile: "#FDF5D6", ink: "#7A5A00" }, // yellow
  { tile: "#E6EEFC", ink: "#1E54A8" }, // blue
  { tile: "#FBE8EE", ink: "#A2275A" }, // pink
  { tile: "#E3F5F3", ink: "#13696A" }, // aqua
  { tile: "#FDEBE7", ink: "#A12F1F" }, // coral
  { tile: "#F3E9FA", ink: "#7A3BA6" }, // lilac
  { tile: "#EEF4DF", ink: "#4A6516" }, // sage
  { tile: "#FEF0D9", ink: "#8F5A00" }, // apricot
  { tile: "#E5F1FB", ink: "#195E8F" }, // sky
] as const;

export function gridTone(index: number) {
  return GRID_TONES[((index % GRID_TONES.length) + GRID_TONES.length) % GRID_TONES.length];
}

export function orgTone(name: string): OrgTone {
  let h = 0;
  for (const ch of name.trim().toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

export function orgInitials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase();
}

export { OrgLogo } from "./org-logo";
