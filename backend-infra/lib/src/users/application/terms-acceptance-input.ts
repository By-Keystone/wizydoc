import { z } from "zod";
import {
  CURRENT_PRIVACY_POLICY_VERSION,
  CURRENT_TERMS_VERSION,
} from "../domain/legal-documents";

const TERMS_NOT_ACCEPTED =
  "Para crear tu cuenta, acepta los Términos y condiciones.";
const OUTDATED_TERMS =
  "Actualizamos los términos. Recarga la página para verlos.";

export const termsAcceptanceInputShape = {
  acceptedTerms: z.literal(true, { error: TERMS_NOT_ACCEPTED }),
  termsVersion: z.literal(CURRENT_TERMS_VERSION, { error: OUTDATED_TERMS }),
  privacyPolicyVersion: z.literal(CURRENT_PRIVACY_POLICY_VERSION, {
    error: OUTDATED_TERMS,
  }),
};
