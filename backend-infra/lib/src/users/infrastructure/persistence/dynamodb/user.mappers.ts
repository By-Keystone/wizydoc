import type { User } from "../../../domain/user.entity";
import { emailSchema } from "../../../domain/value-objects/email.vo";
import { treatmentSchema } from "../../../domain/value-objects/treatment.vo";
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

export const fromDynamoToDomain = (user: UsersDynamoDBSchema): User => {
  return {
    id: user.Id,
    name: user.Name,
    lastName: user.LastName,
    email: emailSchema.parse(user.Email),
    confirmed: user.Confirmed,
    onboardingCompleted: user.OnboardingCompleted,
    phone: user.Phone,
    treatment: treatmentSchema.parse(user.Treatment),
    accountId: user.AccountId,
    cognitoSub: user.CognitoSub,
  };
};

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
    LastName: user.lastName,
    Name: user.name,
    OnboardingCompleted: user.onboardingCompleted,
    Phone: user.phone,
    Treatment: user.treatment,
    AccountId: user.accountId,
    CognitoSub: user.cognitoSub,
  };
};
