export function identityColorSeed(alias: string | null, ip: string): string {
  return alias ? `${alias}|${ip}` : ip;
}
