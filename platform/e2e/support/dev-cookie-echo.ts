// En `next dev`, React agrega al payload RSC lo que devolvió `cookies()`, con el
// valor de cada cookie, para sus DevTools. Esa fila no existe en producción, y
// el navegador ya tiene esas cookies: no es una fuga del código de platform.
const DEV_COOKIE_ECHO_ROW = /^[0-9a-f]+:\["([^"]+)",\{"name":"\1","value":/;

export function withoutDevCookieEcho(
  responseBody: string,
  browserCookieNames: readonly string[],
): string {
  return responseBody
    .split("\n")
    .filter((row) => {
      const echoedCookie = DEV_COOKIE_ECHO_ROW.exec(row)?.[1];
      return !echoedCookie || !browserCookieNames.includes(echoedCookie);
    })
    .join("\n");
}
