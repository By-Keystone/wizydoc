import {
  AttributeType,
  type ITableV2,
  TableV2,
} from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

const TIME_TO_LIVE_ATTRIBUTE = "DeleteAfter";

export class DynamoTables extends Construct {
  readonly table: ITableV2;
  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.table = new TableV2(this, "MainTable", {
      partitionKey: {
        name: "PK",
        type: AttributeType.STRING,
      },
      sortKey: {
        name: "SK",
        type: AttributeType.STRING,
      },
      timeToLiveAttribute: TIME_TO_LIVE_ATTRIBUTE,
      globalSecondaryIndexes: [
        {
          indexName: "GSI1",
          partitionKey: {
            name: "GSI1PK",
            type: AttributeType.STRING,
          },
          sortKey: {
            name: "GSI1SK",
            type: AttributeType.STRING,
          },
        },
        {
          indexName: "GSI2",
          partitionKey: {
            name: "GSI2PK",
            type: AttributeType.STRING,
          },
          sortKey: {
            name: "GSI2SK",
            type: AttributeType.STRING,
          },
        },
      ],
    });
  }
}
