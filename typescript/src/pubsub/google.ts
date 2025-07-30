import 'source-map-support/register';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import type { GoogleSubscriptionMetaData, SubscriptionNotification } from './google-common';
import {
    fetchMetadata,
    parsePayload,
    toDynamoEvent_google_async,
    toSqsSubReference,
} from './google-common';
import { parseStoreAndSend_async } from './pubsub';

export async function handler(request: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    return parseStoreAndSend_async(
        request,
        parsePayload,
        (notification: SubscriptionNotification, metaData?: GoogleSubscriptionMetaData) =>
            toDynamoEvent_google_async(notification, true, metaData),
        toSqsSubReference,
        fetchMetadata,
    );
}
