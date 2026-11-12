import {
  type DynamoDBDocumentClient,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { z } from "zod";
import type { OwnerClinic } from "../../../domain/clinic.entity";
import type {
  IOnboardingRepository,
  OnboardingStepTransition,
} from "../../../domain/repository/onboarding.repository";
import type { Subscription } from "../../../domain/subscription.entity";
import {
  ONBOARDING_STEPS,
  type OnboardingStep,
  type PersonalData,
} from "../../../domain/user.entity";
import { fromClinicToDynamo } from "./clinic.mappers";
import { isLostRace } from "./lost-race";
import { fromNewMembershipToDynamo } from "./membership.mappers";
import { fromOrganizationToDynamo } from "./organization.mappers";
import { fromSubscriptionToDynamo } from "./subscription.mappers";
import { ONLY_IF_NEW } from "./user.repository";
import { pk, sk } from "./user.schema";

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
      return z.enum(ONBOARDING_STEPS).parse(Attributes?.OnboardingStep);
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

  async createClinic(
    { organization, clinic, memberships }: OwnerClinic,
    userId: string,
    transition: OnboardingStepTransition,
  ): Promise<boolean> {
    const newItems = [
      fromOrganizationToDynamo(organization),
      fromClinicToDynamo(clinic),
      ...memberships.map(fromNewMembershipToDynamo),
    ];
    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            ...newItems.map((Item) => ({
              Put: {
                TableName: this.tableName,
                Item,
                ConditionExpression: ONLY_IF_NEW,
              },
            })),
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
