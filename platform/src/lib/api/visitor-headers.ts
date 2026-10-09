export const PROXY_SECRET_HEADER = "x-wizydoc-proxy-secret";
export const VISITOR_IP_HEADER = "x-wizydoc-visitor-ip";

// Railway descarta el x-forwarded-for del visitante y pone "IP del visitante, IP del borde": la última entrada es del borde y cambia entre peticiones.
function visitorIpFrom(forwardedFor: string | null): string | null {
  const addresses = forwardedFor?.split(",") ?? [];
  return addresses[0]?.trim() || null;
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
