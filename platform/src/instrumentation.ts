export function register() {
  const isProductionServer =
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NODE_ENV === "production";

  if (isProductionServer && !process.env.RATE_LIMIT_PROXY_SECRET) {
    throw new Error(
      "Falta RATE_LIMIT_PROXY_SECRET: sin él el api no distingue a los visitantes y los límites bloquearían a todos a la vez.",
    );
  }
}
