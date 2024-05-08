import type {APIGatewayProxyEvent, APIGatewayProxyResult} from "aws-lambda";
import { HTTPResponses } from "../../models/apiGatewayHttp";
import { MetaData,
    SubscriptionNotification,
    fetchMetadata as defaultFetchMetadata,
    parsePayload,
    toDynamoEvent } from "../../pubsub/google-common";
import { Ignorable } from "../../pubsub/ignorable";
import { dynamoMapper } from "../../utils/aws";
import { SubscriptionEvent } from "../../models/subscriptionEvent";

const defaultStoreEventInDynamo = (event: SubscriptionEvent): Promise<void> => {
    return dynamoMapper.put({ event }).then(_ => undefined);
}

export function buildHandler(
    storeEventInDynamo: (event: SubscriptionEvent) => Promise<void> = defaultStoreEventInDynamo,
    fetchMetadata: (notification: SubscriptionNotification) => Promise<MetaData | undefined> = defaultFetchMetadata
): (request: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult> {
    return async (request: APIGatewayProxyEvent) => {
        const secret = process.env.Secret;

        if (secret === undefined) {
            console.error("PubSub secret in env is 'undefined'");
            return HTTPResponses.INTERNAL_ERROR
        }

        if (request.queryStringParameters?.secret === secret) {
            const notification = parsePayload(request.body);
            if (notification instanceof Error) {
                console.log("Parsing the payload failed: ", notification.message);
                return HTTPResponses.INVALID_REQUEST
            } else if (notification instanceof Ignorable) {
                console.log("Ignoring event: ", notification.message);
                return HTTPResponses.OK;
            }

            try {
                // Temporary change
                // Hardcode metaData instead of trying to fetch it from Google
                // to test a fake subscription in CODE
                //const metaData = await fetchMetadata(notification);
                console.log(notification);
                const metaData = { freeTrial: true };
                const dynamoEvent = toDynamoEvent(notification, metaData);
                console.log(dynamoEvent);
                await storeEventInDynamo(dynamoEvent);
            } catch (e) {
                console.error("Internal server error", e);
                return HTTPResponses.INTERNAL_ERROR
            }
            return HTTPResponses.OK;
        } else {
            return HTTPResponses.UNAUTHORISED;
        }
    }
}

export const handler = buildHandler();