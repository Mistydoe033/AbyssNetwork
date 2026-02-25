function isPrivateIpv4(hostname: string): boolean {
  const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!ipv4Match) {
    return false;
  }

  const first = Number(ipv4Match[1]);
  const second = Number(ipv4Match[2]);

  if (first === 10) {
    return true;
  }

  if (first === 172 && second >= 16 && second <= 31) {
    return true;
  }

  if (first === 192 && second === 168) {
    return true;
  }

  return false;
}

export function isOriginAllowed(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (allowedOrigins.includes("*")) {
    return true;
  }

  if (!origin || origin === "null") {
    return true;
  }

  try {
    const url = new URL(origin);
    const hostname = url.hostname;

    if (["localhost", "127.0.0.1", "::1"].includes(hostname)) {
      return true;
    }

    if (isPrivateIpv4(hostname)) {
      return true;
    }

    return allowedOrigins.includes(origin) || allowedOrigins.includes(hostname);
  } catch {
    return false;
  }
}
