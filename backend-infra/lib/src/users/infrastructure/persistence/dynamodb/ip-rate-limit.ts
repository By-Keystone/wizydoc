import { isIPv6 } from "node:net";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import {
  type DynamoDBDocumentClient,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type { IIpRateLimit } from "../../../application/ports/ip-rate-limit.port";

const WINDOW_SECONDS = 10 * 60;
const UNKNOWN_IP_ADDRESS = "unknown";
const IPV6_GROUP_COUNT = 8;
const IPV6_NETWORK_GROUP_COUNT = 4;
const IPV4_MAPPED_IPV6_PREFIX = "::ffff:";

const expandIpv6Groups = (address: string): string[] => {
  const [head, tail] = address.split("::");
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail ? tail.split(":") : [];
  const omittedGroups =
    tail === undefined
      ? []
      : Array<string>(
          IPV6_GROUP_COUNT - headGroups.length - tailGroups.length,
        ).fill("0");
  return [...headGroups, ...omittedGroups, ...tailGroups];
};

const rateLimitSubject = (ipAddress: string | undefined): string => {
  if (!ipAddress) return UNKNOWN_IP_ADDRESS;
  if (!isIPv6(ipAddress)) return ipAddress;

  const normalized = ipAddress.toLowerCase();
  if (
    normalized.startsWith(IPV4_MAPPED_IPV6_PREFIX) &&
    normalized.includes(".")
  ) {
    return normalized.slice(IPV4_MAPPED_IPV6_PREFIX.length);
  }

  const network = expandIpv6Groups(normalized)
    .slice(0, IPV6_NETWORK_GROUP_COUNT)
    .map((group) => group.padStart(4, "0"))
    .join(":");
  return `${network}::/64`;
};

export interface IpRateLimitSettings {
  itemType: string;
  maxAttempts: number;
}

export const EMAIL_SEND_RATE_LIMIT: IpRateLimitSettings = {
  itemType: "EMAIL_SEND_ATTEMPTS",
  maxAttempts: 3,
};

export const SIGN_UP_VERIFY_RATE_LIMIT: IpRateLimitSettings = {
  itemType: "SIGN_UP_VERIFY_ATTEMPTS",
  maxAttempts: 10,
};

export class DynamoDBIpRateLimit implements IIpRateLimit {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly limit: IpRateLimitSettings,
    private readonly nowInMilliseconds: () => number = Date.now,
  ) {}

  async tryRegister(ipAddress: string | undefined): Promise<boolean> {
    const nowInSeconds = Math.floor(this.nowInMilliseconds() / 1000);
    const windowStart = nowInSeconds - (nowInSeconds % WINDOW_SECONDS);

    try {
      await this.client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: {
            PK: `${this.limit.itemType}#${rateLimitSubject(ipAddress)}`,
            SK: String(windowStart),
          },
          UpdateExpression:
            "ADD Attempts :one SET DeleteAfter = :deleteAfter, ItemType = :itemType",
          ConditionExpression:
            "attribute_not_exists(Attempts) OR Attempts < :maxAttempts",
          ExpressionAttributeValues: {
            ":one": 1,
            ":maxAttempts": this.limit.maxAttempts,
            ":deleteAfter": windowStart + WINDOW_SECONDS,
            ":itemType": this.limit.itemType,
          },
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return false;
      throw error;
    }
  }
}
