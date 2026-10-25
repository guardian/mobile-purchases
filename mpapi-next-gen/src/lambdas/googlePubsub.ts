import 'source-map-support/register';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import type {
    GoogleSubscriptionMetaData,
    SubscriptionNotification,
} from '../common/pubsub-google-common';
import {
    fetchMetadata,
    parsePayload,
    toDynamoEventGoogleAsync,
    toSqsSubReference,
} from '../common/pubsub-google-common';
import { parseStoreAndSend_async } from '../common/pubsub-pubsub';

export async function handler(
    request: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
    return parseStoreAndSend_async(
        request,
        parsePayload,
        (
            notification: SubscriptionNotification,
            metaData?: GoogleSubscriptionMetaData,
        ) => toDynamoEventGoogleAsync(notification, true, metaData),
        toSqsSubReference,
        fetchMetadata,
    );
}
