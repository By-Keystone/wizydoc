import { isIP } from "node:net";

export const HTTP_STATUS = {
  OK: 200,
  NO_CONTENT: 204,
  ACCEPTED: 202,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export interface ApiGatewayEvent {
  body: string | null;
  headers: Record<string, string | undefined> | null;
}

export interface PrivateApiGatewayEvent extends ApiGatewayEvent {
  pathParameters: Record<string, string | undefined> | null;
  requestContext: {
    authorizer?: { claims?: Record<string, unknown> } | null;
  };
}

export interface ApiGatewayResult {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}

export const acceptedResponse = (): ApiGatewayResult => ({
  statusCode: HTTP_STATUS.ACCEPTED,
  body: "",
});

export const noStoreJsonResponse = (body: object): ApiGatewayResult => ({
  statusCode: HTTP_STATUS.OK,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
  body: JSON.stringify(body),
});

export const noContentResponse = (): ApiGatewayResult => ({
  statusCode: HTTP_STATUS.NO_CONTENT,
  body: "",
});

export const messageResponse = (
  statusCode: number,
  message: string,
): ApiGatewayResult => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ message }),
});

export const jsonResponse = (
  statusCode: number,
  body: object,
): ApiGatewayResult => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const parseJsonBody = (body: string | null): unknown => {
  if (!body) return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
};

export const readHeader = (
  event: ApiGatewayEvent,
  name: string,
): string | undefined =>
  Object.entries(event.headers ?? {}).find(
    ([headerName]) => headerName.toLowerCase() === name,
  )?.[1] ?? undefined;

export const readIpAddress = (event: ApiGatewayEvent): string | undefined => {
  const ipAddress = readHeader(event, "x-real-ip")?.trim();
  return ipAddress && isIP(ipAddress) ? ipAddress : undefined;
};
