import 'source-map-support/register';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  fetchMetadata,
  parsePayload,
  toDynamoEvent,
  toSqsSubReference,
} from './google-common';
import { parseStoreAndSend } from './pubsub';

export async function handler(
  request: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  return parseStoreAndSend(
    request,
    parsePayload,
    toDynamoEvent,
    toSqsSubReference,
    fetchMetadata,
  );
}
