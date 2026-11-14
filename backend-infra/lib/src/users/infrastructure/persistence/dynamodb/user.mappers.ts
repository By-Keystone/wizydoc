import type { User } from "../../../domain/user.entity";
import {
  gsi1pk,
  gsi1sk,
  gsi2pk,
  gsi2sk,
  pk,
  sk,
  USER_ITEM_TYPE,
  type UsersDynamoDBSchema,
} from "./user.schema";

export const fromDomainToDynamo = (user: User): UsersDynamoDBSchema => {
  return {
    PK: pk(user.id),
    SK: sk(),
    ItemType: USER_ITEM_TYPE,
    GSI1PK: gsi1pk(user.email),
    GSI1SK: gsi1sk(),
    ...(user.cognitoSub
      ? { GSI2PK: gsi2pk(user.cognitoSub), GSI2SK: gsi2sk() }
      : {}),
    Id: user.id,
    Confirmed: user.confirmed,
    Email: user.email,
    AccountId: user.accountId,
    OnboardingStep: user.onboardingStep,
    CognitoSub: user.cognitoSub,
  };
};

export const fromDynamoToDomain = ({
  Id,
  Email,
  Confirmed,
  AccountId,
  OnboardingStep,
  CognitoSub,
}: Pick<
  UsersDynamoDBSchema,
  "Id" | "Email" | "Confirmed" | "AccountId" | "OnboardingStep" | "CognitoSub"
>): User => ({
  id: Id,
  email: Email,
  confirmed: Confirmed,
  accountId: AccountId,
  onboardingStep: OnboardingStep,
  cognitoSub: CognitoSub,
});
