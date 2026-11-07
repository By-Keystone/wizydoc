import assert from "node:assert/strict";
import { test } from "node:test";
import { senderAddressOf } from "../lib/sender-address";

test("EMAIL_FROM da la dirección del remitente, con nombre o sin él", () => {
  assert.equal(
    senderAddressOf("WizyDoc <no-reply@support.wizydoc.app>"),
    "no-reply@support.wizydoc.app",
  );
  assert.equal(
    senderAddressOf("no-reply@support.test.wizydoc.app"),
    "no-reply@support.test.wizydoc.app",
  );
});

test("EMAIL_FROM sin un correo hace fallar la síntesis", () => {
  for (const rejectedSender of ["", "WizyDoc", "WizyDoc <no-reply>"]) {
    assert.throws(() => senderAddressOf(rejectedSender), /EMAIL_FROM/);
  }
});
