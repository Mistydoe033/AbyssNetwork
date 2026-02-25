const COLOR_PALETTE = [
  "#79d7ff",
  "#ffd57a",
  "#9dff8a",
  "#ff9dcc",
  "#b9a3ff",
  "#73f0d0",
  "#ffb580",
  "#f2ff93",
  "#8ab7ff",
  "#ff9a9a",
  "#a3ffe0",
  "#ffd3a0",
  "#8dffef",
  "#ffc3f2",
  "#d8ff91",
  "#9dc9ff",
  "#ffce8d",
  "#b7ffcd",
  "#ffb3b3",
  "#c2b5ff",
  "#7fe5ff",
  "#ffe185",
  "#b1ffa1",
  "#ffadd9",
  "#8de7c8",
  "#f7ffa3",
  "#9eb8ff",
  "#ffb794",
  "#8fffe9",
  "#ffcda6",
  "#b9ffa7",
  "#ffb6c8"
] as const;

const PALETTE_STEP = 11;

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function fallbackColor(hash: number, offset: number): string {
  const hue = (hash + offset * 47) % 360;
  const saturation = 82 + ((offset % 3) * 5);
  const lightness = 63 + ((offset % 2) * 7);
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

export function pickDistinctColor(
  seed: string,
  usedColors: Set<string>,
  forbiddenColors: Set<string> = new Set()
): string {
  const hash = hashString(seed);
  const start = hash % COLOR_PALETTE.length;

  for (let i = 0; i < COLOR_PALETTE.length; i += 1) {
    const index = (start + i * PALETTE_STEP) % COLOR_PALETTE.length;
    const color = COLOR_PALETTE[index];
    if (!usedColors.has(color) && !forbiddenColors.has(color)) {
      return color;
    }
  }

  for (let i = 0; i < 720; i += 1) {
    const color = fallbackColor(hash, i);
    if (!usedColors.has(color) && !forbiddenColors.has(color)) {
      return color;
    }
  }

  return "#c6ff8d";
}
