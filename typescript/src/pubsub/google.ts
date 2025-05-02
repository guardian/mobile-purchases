import 'source-map-support/register';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  fetchMetadata,
  parsePayload,
  toDynamoEvent_google_async,
  toSqsSubReference,
} from './google-common';
import { parseStoreAndSend_async } from './pubsub';

export async function handler(
  request: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  return parseStoreAndSend_async(
    request,
    parsePayload,
    toDynamoEvent_google_async,
    toSqsSubReference,
    fetchMetadata,
  );
}
