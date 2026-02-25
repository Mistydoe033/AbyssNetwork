const HUE_BUCKETS = 36;
const SATURATION_LEVELS = [74, 82, 90];
const LIGHTNESS_LEVELS = [62, 68, 74];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function getUserColor(seed: string | undefined): string {
  if (!seed) {
    return "#c6ff8d";
  }

  const hash = hashString(seed);
  const hue = (hash % HUE_BUCKETS) * (360 / HUE_BUCKETS);
  const saturation = SATURATION_LEVELS[(hash >>> 8) % SATURATION_LEVELS.length];
  const lightness = LIGHTNESS_LEVELS[(hash >>> 16) % LIGHTNESS_LEVELS.length];

  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

export function formatTimestampSeconds(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "--:--:--";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}
