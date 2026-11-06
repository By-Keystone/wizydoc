const PLAIN_HOSTNAME = /^[a-z0-9.-]+$/;
const LOCAL_HOSTNAME = "localhost";

export const isPlatformOrigin = (frontendUrl: string): boolean => {
  if (!URL.canParse(frontendUrl)) return false;

  const url = new URL(frontendUrl);
  const isSecureOrLocal =
    url.protocol === "https:" ||
    (url.protocol === "http:" && url.hostname === LOCAL_HOSTNAME);
  return (
    url.origin === frontendUrl.replace(/\/$/, "") &&
    PLAIN_HOSTNAME.test(url.hostname) &&
    isSecureOrLocal
  );
};
