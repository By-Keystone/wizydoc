import assert from "node:assert/strict";
import { test } from "node:test";
import { senderDomainOf } from "../lib/sender-domain";

test("EMAIL_FROM da el dominio del remitente, con nombre o sin él", () => {
  assert.equal(
    senderDomainOf("WizyDoc <no-reply@support.wizydoc.app>"),
    "support.wizydoc.app",
  );
  assert.equal(
    senderDomainOf("no-reply@Support.Test.wizydoc.app"),
    "support.test.wizydoc.app",
  );
});

test("EMAIL_FROM sin un correo hace fallar la síntesis", () => {
  for (const rejectedSender of ["", "WizyDoc", "WizyDoc <no-reply>"]) {
    assert.throws(() => senderDomainOf(rejectedSender), /EMAIL_FROM/);
  }
});
