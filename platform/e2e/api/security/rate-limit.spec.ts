import { randomBytes, randomUUID } from "node:crypto";
import { test, expect } from "../../support/test";
import { API_BASE_URL, RATE_LIMIT_E2E_PROXY_SECRET } from "../../support/env";
import { createApiContext } from "../../support/accounts";
import {
  PROXY_SECRET_HEADER,
  VISITOR_IP_HEADER,
} from "../../../src/lib/api/visitor-headers";

const INVITATION_LOOKUP_LIMIT = 20;
const SLOTS_LIMIT = 60;
const APPOINTMENT_LIMIT = 100;
const REQUESTS_PAST_INVITATION_LIMIT = INVITATION_LOOKUP_LIMIT + 5;
const TOO_MANY_REQUESTS_MESSAGE = "Demasiadas solicitudes";

const FIRST_VISITOR_IP = "203.0.113.1";
const SECOND_VISITOR_IP = "203.0.113.2";
const THIRD_VISITOR_IP = "203.0.113.3";
const FOURTH_VISITOR_IP = "203.0.113.4";
const FIFTH_VISITOR_IP = "203.0.113.5";
const SIXTH_VISITOR_IP = "203.0.113.6";
const IPV6_SAME_SUBNET_A = "2001:db8:aaaa:1::1";
const IPV6_SAME_SUBNET_B = "2001:db8:aaaa:1:ffff::2";
const IPV6_OTHER_SUBNET = "2001:db8:aaaa:2::1";

function invitationUrl() {
  return `${API_BASE_URL}/invitations/${randomBytes(32).toString("hex")}`;
}

function slotsUrl() {
  return `${API_BASE_URL}/doctor-profile/${randomUUID()}/slots`;
}

function visitorHeaders(visitorIp: string, proxySecret: string) {
  return {
    [PROXY_SECRET_HEADER]: proxySecret,
    [VISITOR_IP_HEADER]: visitorIp,
  };
}

function trustedVisitor(visitorIp: string) {
  return visitorHeaders(visitorIp, RATE_LIMIT_E2E_PROXY_SECRET);
}

test("un visitante reenviado por platform recibe 429 al pasar el límite de la ruta", async () => {
  const context = await createApiContext();
  const headers = trustedVisitor(FIRST_VISITOR_IP);

  for (let attempt = 0; attempt < INVITATION_LOOKUP_LIMIT; attempt++) {
    const response = await context.get(invitationUrl(), { headers });
    expect(response.status()).not.toBe(429);
  }

  const blocked = await context.get(invitationUrl(), { headers });
  expect(blocked.status()).toBe(429);
  expect((await blocked.json()).message).toContain(TOO_MANY_REQUESTS_MESSAGE);

  const otherVisitor = await context.get(invitationUrl(), {
    headers: trustedVisitor(SECOND_VISITOR_IP),
  });
  expect(otherVisitor.status()).not.toBe(429);
});

test("la IP del visitante con un secreto incorrecto se ignora", async () => {
  const context = await createApiContext();
  const headers = visitorHeaders(THIRD_VISITOR_IP, "secreto-equivocado");

  for (let attempt = 0; attempt < REQUESTS_PAST_INVITATION_LIMIT; attempt++) {
    const response = await context.get(invitationUrl(), { headers });
    expect(response.status()).not.toBe(429);
  }
});

test("los horarios disponibles se limitan por visitante", async () => {
  const context = await createApiContext();
  const headers = trustedVisitor(FOURTH_VISITOR_IP);

  for (let attempt = 0; attempt < SLOTS_LIMIT; attempt++) {
    const response = await context.get(slotsUrl(), { headers });
    expect(response.status()).not.toBe(429);
  }

  const blocked = await context.get(slotsUrl(), { headers });
  expect(blocked.status()).toBe(429);
});

test("reservar una cita se limita por visitante", async () => {
  const context = await createApiContext();
  const headers = trustedVisitor(FIFTH_VISITOR_IP);

  for (let attempt = 0; attempt < APPOINTMENT_LIMIT; attempt++) {
    const response = await context.post(`${API_BASE_URL}/appointment`, {
      headers,
      data: {},
    });
    expect(response.status()).not.toBe(429);
  }

  const blocked = await context.post(`${API_BASE_URL}/appointment`, {
    headers,
    data: {},
  });
  expect(blocked.status()).toBe(429);
});

test("las direcciones IPv6 de un mismo /64 comparten contador", async () => {
  const context = await createApiContext();

  for (let attempt = 0; attempt < INVITATION_LOOKUP_LIMIT; attempt++) {
    const response = await context.get(invitationUrl(), {
      headers: trustedVisitor(IPV6_SAME_SUBNET_A),
    });
    expect(response.status()).not.toBe(429);
  }

  const sameSubnet = await context.get(invitationUrl(), {
    headers: trustedVisitor(IPV6_SAME_SUBNET_B),
  });
  expect(sameSubnet.status()).toBe(429);

  const otherSubnet = await context.get(invitationUrl(), {
    headers: trustedVisitor(IPV6_OTHER_SUBNET),
  });
  expect(otherSubnet.status()).not.toBe(429);
});

test("HEAD en una ruta con límite también se limita", async () => {
  const context = await createApiContext();
  const headers = trustedVisitor(SIXTH_VISITOR_IP);
  const statuses: number[] = [];

  for (let attempt = 0; attempt < REQUESTS_PAST_INVITATION_LIMIT; attempt++) {
    const response = await context.head(invitationUrl(), { headers });
    statuses.push(response.status());
  }

  expect(statuses).toContain(429);
});
