const USER_COLOR_PALETTE = [
  "#79d7ff",
  "#ffd57a",
  "#9dff8a",
  "#ff9dcc",
  "#b9a3ff",
  "#73f0d0",
  "#ffb580",
  "#f2ff93",
  "#8ab7ff",
  "#ff9a9a"
];

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

  const index = hashString(seed) % USER_COLOR_PALETTE.length;
  return USER_COLOR_PALETTE[index];
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
