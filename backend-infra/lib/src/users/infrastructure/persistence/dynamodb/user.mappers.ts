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
  userItemSchema,
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
    ...(user.givenName !== undefined && { GivenName: user.givenName }),
    ...(user.familyName !== undefined && { FamilyName: user.familyName }),
    ...(user.phone !== undefined && { Phone: user.phone }),
    ...(user.treatment !== undefined && { Treatment: user.treatment }),
  };
};

export const fromDynamoToDomain = (item: unknown): User => {
  const {
    Id,
    Email,
    Confirmed,
    AccountId,
    OnboardingStep,
    CognitoSub,
    GivenName,
    FamilyName,
    Phone,
    Treatment,
  } = userItemSchema.parse(item);
  return {
    id: Id,
    email: Email,
    confirmed: Confirmed,
    accountId: AccountId,
    onboardingStep: OnboardingStep,
    cognitoSub: CognitoSub,
    givenName: GivenName,
    familyName: FamilyName,
    phone: Phone,
    treatment: Treatment,
  };
};
