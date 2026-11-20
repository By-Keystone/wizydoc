import {
  type DynamoDBDocumentClient,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type {
  IOnboardingRepository,
  OnboardingStepTransition,
} from "../../../domain/repository/onboarding.repository";
import { ONLY_IF_NEW } from "../../../../shared/persistence/dynamodb/conditions";
import { isLostRace } from "../../../../shared/persistence/dynamodb/lost-race";
import type { Subscription } from "../../../../users/domain/subscription.entity";
import type {
  OnboardingStep,
  PersonalData,
} from "../../../../users/domain/user.entity";
import {
  pk,
  sk,
  type UsersDynamoDBSchema,
} from "../../../../users/infrastructure/persistence/dynamodb/user.schema";
import { fromSubscriptionToDynamo } from "../../../../users/infrastructure/persistence/dynamodb/subscription.mappers";

export class OnboardingRepository implements IOnboardingRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async savePersonalData(
    userId: string,
    { givenName, familyName, phone, treatment }: PersonalData,
    transition: OnboardingStepTransition,
  ): Promise<OnboardingStep | undefined> {
    try {
      const { Attributes } = await this.client.send(
        new UpdateCommand({
          ...this.userStepUpdate(userId, transition, {
            GivenName: givenName,
            FamilyName: familyName,
            Phone: phone,
            Treatment: treatment,
          }),
          ReturnValues: "ALL_NEW",
        }),
      );
      return (Attributes as Pick<UsersDynamoDBSchema, "OnboardingStep">)
        .OnboardingStep;
    } catch (error) {
      if (isLostRace(error)) return undefined;
      throw error;
    }
  }

  async savePlan(
    subscription: Subscription,
    userId: string,
    transition: OnboardingStepTransition,
  ): Promise<boolean> {
    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.tableName,
                Item: fromSubscriptionToDynamo(subscription),
                ConditionExpression: ONLY_IF_NEW,
              },
            },
            { Update: this.userStepUpdate(userId, transition, {}) },
          ],
        }),
      );
      return true;
    } catch (error) {
      if (isLostRace(error)) return false;
      throw error;
    }
  }

  private userStepUpdate(
    userId: string,
    { from, to }: OnboardingStepTransition,
    attributesToSet: Record<string, unknown>,
  ) {
    const attributes = Object.entries({
      ...(to ? { OnboardingStep: to } : {}),
      ...attributesToSet,
    });
    const stepsFrom = Object.fromEntries(
      from.map((step, index) => [`:from${index}`, step]),
    );

    return {
      TableName: this.tableName,
      Key: { PK: pk(userId), SK: sk() },
      ConditionExpression: `#OnboardingStep IN (${Object.keys(stepsFrom).join(", ")})`,
      UpdateExpression: `SET ${attributes.map(([name]) => `#${name} = :${name}`).join(", ")}`,
      ExpressionAttributeNames: Object.fromEntries([
        ["#OnboardingStep", "OnboardingStep"],
        ...attributes.map(([name]) => [`#${name}`, name]),
      ]),
      ExpressionAttributeValues: {
        ...stepsFrom,
        ...Object.fromEntries(
          attributes.map(([name, value]) => [`:${name}`, value]),
        ),
      },
    };
  }
}
