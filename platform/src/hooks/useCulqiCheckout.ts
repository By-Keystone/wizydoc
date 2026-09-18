"use client";

import { useEffect, useState } from "react";

const CULQI_SCRIPT_URL = "https://js.culqi.com/checkout-js";

interface CulqiInstance {
  open: () => void;
  close: () => void;
  culqi: () => void;
  token?: { id: string };
  error?: { user_message?: string; merchant_message?: string };
}

declare global {
  interface Window {
    CulqiCheckout?: new (publicKey: string, config: object) => CulqiInstance;
  }
}

interface OpenCheckoutInput {
  amountCents: number;
  onToken: (tokenId: string) => void;
  onError: (message: string) => void;
}

export function useCulqiCheckout() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (window.CulqiCheckout) {
      setIsReady(true);
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${CULQI_SCRIPT_URL}"]`,
    );
    const script = existing ?? document.createElement("script");
    const markReady = () => setIsReady(true);

    script.addEventListener("load", markReady);

    if (!existing) {
      script.src = CULQI_SCRIPT_URL;
      script.async = true;
      document.body.appendChild(script);
    }

    return () => script.removeEventListener("load", markReady);
  }, []);

  const open = ({ amountCents, onToken, onError }: OpenCheckoutInput) => {
    if (!window.CulqiCheckout) {
      onError("El formulario de pago todavía no está listo");
      return;
    }

    const culqi = new window.CulqiCheckout(
      process.env.NEXT_PUBLIC_CULQI_PUBLIC_KEY!,
      {
        settings: { title: "WizyDoc", currency: "PEN", amount: amountCents },
        options: {
          lang: "es",
          paymentMethods: {
            tarjeta: true,
            yape: false,
            billetera: false,
            bancaMovil: false,
            agente: false,
            cuotealo: false,
          },
        },
      },
    );

    culqi.culqi = () => {
      if (culqi.token) {
        onToken(culqi.token.id);
        culqi.close();
        return;
      }

      onError(
        culqi.error?.user_message ?? "No se pudo procesar la tarjeta",
      );
    };

    culqi.open();
  };

  return { isReady, open };
}
