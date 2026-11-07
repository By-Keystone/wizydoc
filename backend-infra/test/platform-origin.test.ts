import assert from "node:assert/strict";
import { test } from "node:test";
import { isPlatformOrigin } from "../lib/platform-origin";

test("FRONTEND_URL acepta el origen de platform con https, o localhost con http", () => {
  for (const origin of [
    "https://app.wizydoc.app",
    "https://app.wizydoc.app/",
    "https://staging.wizydoc.app:8443",
    "http://localhost:3000",
  ]) {
    assert.equal(isPlatformOrigin(origin), true, origin);
  }
});

test("FRONTEND_URL rechaza lo que no es sólo un origen con https", () => {
  for (const rejectedUrl of [
    "",
    "app.wizydoc.app",
    "http://app.wizydoc.app",
    "https://app.wizydoc.app/login",
    "https://app.wizydoc.app?ref=correo",
    "https://app.wizydoc.app#token=x",
    "https://ana@app.wizydoc.app",
    "javascript:alert(1)",
  ]) {
    assert.equal(isPlatformOrigin(rejectedUrl), false, rejectedUrl);
  }
});

test("FRONTEND_URL rechaza un host con comillas o &, que URL acepta y que cerrarían el href de los botones", () => {
  for (const rejectedUrl of [
    'https://app"onclick="x.wizydoc.app',
    "https://a&b.wizydoc.app",
  ]) {
    assert.equal(isPlatformOrigin(rejectedUrl), false, rejectedUrl);
  }
});
