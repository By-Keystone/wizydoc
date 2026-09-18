import { createServer } from "node:http";
import { CulqiBillingService } from "./src/infrastructure/vendors/billing/culqi/culqi-billing.service";
import { PaymentFailed } from "./src/application/errors/payment-failed.error";

const calls: { path: string; body: Record<string, unknown>; auth?: string }[] = [];
let rejectCard = false;

const fakeCulqi = createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    const body = JSON.parse(raw);
    calls.push({ path: req.url!, body, auth: req.headers.authorization });

    if (req.url === "/v2/cards" && rejectCard) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ user_message: "Tarjeta rechazada", merchant_message: "declined", code: "card_declined" }));
      return;
    }

    const prefix = req.url!.includes("customers") ? "cus" : req.url!.includes("cards") ? "crd" : "sxn";
    res.writeHead(201, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: `${prefix}_test_123` }));
  });
});

async function main() {
  await new Promise<void>((resolve) => fakeCulqi.listen(0, resolve));
  const port = (fakeCulqi.address() as { port: number }).port;

  const billing = new CulqiBillingService({
    baseUrl: `http://127.0.0.1:${port}`,
    privateKey: "sk_test_fake",
    planIds: { CONSULTORIO: "pln_consultorio", CLINICA: "pln_clinica" },
  });

  const customer = { email: "a@b.pe", firstName: "Ana", lastName: "Pérez", phone: "999", address: "Av. Larco 123", city: "Lima", countryCode: "PE" };

  let failures = 0;
  const check = (label: string, ok: boolean) => { console.log(`${ok ? "OK  " : "FAIL"} ${label}`); if (!ok) failures++; };

  // Caso feliz
  const result = await billing.startSubscription({ customer, cardToken: "tkn_abc", plan: "CLINICA" });
  check("orden: customers → cards → subscriptions", calls.map((c) => c.path).join(" → ") === "/v2/customers → /v2/cards → /v2/recurrent/subscriptions/create");
  check("Authorization Bearer con la llave privada", calls.every((c) => c.auth === "Bearer sk_test_fake"));
  check("customer con country_code PE y address_city", calls[0].body.country_code === "PE" && calls[0].body.address_city === "Lima");
  check("card usa el customer creado y el token, sin validate", calls[1].body.customer_id === "cus_test_123" && calls[1].body.token_id === "tkn_abc" && calls[1].body.validate === false);
  check("subscription usa la card creada, el plan_id de CLINICA y tyc", calls[2].body.card_id === "crd_test_123" && calls[2].body.plan_id === "pln_clinica" && calls[2].body.tyc === true);
  check("devuelve los tres ids", result.customerId === "cus_test_123" && result.cardId === "crd_test_123" && result.subscriptionId === "sxn_test_123");

  // Tarjeta rechazada
  calls.length = 0; rejectCard = true;
  try {
    await billing.startSubscription({ customer, cardToken: "tkn_bad", plan: "CONSULTORIO" });
    check("rechazo de tarjeta lanza PaymentFailed", false);
  } catch (error) {
    check("rechazo de tarjeta lanza PaymentFailed con el user_message de Culqi", error instanceof PaymentFailed && error.message === "Tarjeta rechazada" && error.statusCode === 402);
    check("no intenta crear la suscripción tras el rechazo", !calls.some((c) => c.path.includes("subscriptions")));
  }

  // Plan sin id configurado
  try {
    await billing.startSubscription({ customer, cardToken: "tkn_x", plan: "RED" });
    check("plan sin id configurado falla", false);
  } catch (error) {
    check("plan sin id configurado falla antes de llamar a Culqi", (error as Error).message.includes("RED"));
  }

  fakeCulqi.close();
  console.log(failures === 0 ? "\nTODO OK" : `\n${failures} FALLOS`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
