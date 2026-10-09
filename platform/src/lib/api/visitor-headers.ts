export const PROXY_SECRET_HEADER = "x-wizydoc-proxy-secret";
export const VISITOR_IP_HEADER = "x-wizydoc-visitor-ip";

// Supone que el proxy de Railway añade la IP que vio al final de x-forwarded-for; lo anterior lo escribe el visitante.
function visitorIpFrom(forwardedFor: string | null): string | null {
  const addresses = forwardedFor?.split(",") ?? [];
  return addresses.at(-1)?.trim() || null;
}

export function visitorHeaders(
  forwardedFor: string | null,
): Record<string, string> {
  const proxySecret = process.env.RATE_LIMIT_PROXY_SECRET;
  const visitorIp = visitorIpFrom(forwardedFor);

  if (!proxySecret || !visitorIp) return {};

  return {
    [PROXY_SECRET_HEADER]: proxySecret,
    [VISITOR_IP_HEADER]: visitorIp,
  };
}
