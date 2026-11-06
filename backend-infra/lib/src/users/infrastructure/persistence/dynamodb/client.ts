import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

let documentClient: DynamoDBDocumentClient | undefined;

export const getClient = () => {
  if (!documentClient) {
    documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: {
        removeUndefinedValues: true,
      },
    });

    return documentClient;
  }

  return documentClient;
};
