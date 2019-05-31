import {HTTPRequest, HTTPResponse, HTTPResponses} from "../models/apiGatewayHttp";
import {DeveloperNotification} from "./developerNotification";
import {SubscriptionEvent} from "../models/subscriptionEvent";
import DynamoDB from 'aws-sdk/clients/dynamodb';
import {CredentialProviderChain, SharedIniFileCredentials, ECSCredentials} from "aws-sdk";
import {DataMapper} from '@aws/dynamodb-data-mapper';
import {Region} from "../utils/appIdentity";

const ONE_YEAR_IN_SECONDS = 31557600;

const GOOGLE_SUBS_EVENT_TYPE: {[_: number]: string} = {
    1: "SUBSCRIPTION_RECOVERED",
    2: "SUBSCRIPTION_RENEWED",
    3: "SUBSCRIPTION_CANCELED",
    4: "SUBSCRIPTION_PURCHASED",
    5: "SUBSCRIPTION_ON_HOLD",
    6: "SUBSCRIPTION_IN_GRACE_PERIOD",
    7: "SUBSCRIPTION_RESTARTED",
    8: "SUBSCRIPTION_PRICE_CHANGE_CONFIRMED",
    9: "SUBSCRIPTION_DEFERRED",
    12: "SUBSCRIPTION_REVOKED",
    13: "SUBSCRIPTION_EXPIRED"
};

const credentialProvider = new CredentialProviderChain([
    function () { return new ECSCredentials(); },
    function () { return new SharedIniFileCredentials({
        profile: "mobile"
    }); }
]);

const dynamo = new DynamoDB({
    region: Region,
    credentialProvider: credentialProvider
});

const dynamoMapper = new DataMapper({ client: dynamo });

function parsePayload(body?: string): Error | DeveloperNotification {
    try {
        let rawNotification = Buffer.from(JSON.parse(body || "").message.data, 'base64');
        let notification = JSON.parse(rawNotification.toString()) as DeveloperNotification;
        return notification;
    } catch (e) {
        console.log("Error during the parsing of the HTTP Payload body: " + e);
        return e;
    }
}

async function catchingServerErrors(block: () => Promise<HTTPResponse>): Promise<HTTPResponse> {
    try {
        return block();
    } catch (e) {
        console.error("Internal server error", e);
        return HTTPResponses.INTERNAL_ERROR
    }
}

function toDynamoSubscriptionEvent(notification: DeveloperNotification): SubscriptionEvent {
    const eventTimestamp = new Date(Number.parseInt(notification.eventTimeMillis)).toISOString();
    const eventType = notification.subscriptionNotification.notificationType;
    const eventTypeString = GOOGLE_SUBS_EVENT_TYPE[eventType] || eventType.toString();
    return new SubscriptionEvent(
        notification.subscriptionNotification.purchaseToken,
        eventTimestamp + "|" + eventTypeString,
        eventTimestamp,
        eventTypeString,
        "android",
        notification,
        null,
        Math.ceil((Number.parseInt(notification.eventTimeMillis) / 1000) + 7 * ONE_YEAR_IN_SECONDS)
    );
}

function storeEvent(event: SubscriptionEvent): Promise<SubscriptionEvent> {
    return dynamoMapper.put({item: event}).then(result => result.item);
}

export async function parseAndStore(request: HTTPRequest, storingFunction: (event: SubscriptionEvent) => Promise<SubscriptionEvent>): Promise<HTTPResponse> {
    const secret = process.env.Secret;
    return catchingServerErrors(async () => {
        if (request.queryStringParameters && request.queryStringParameters.secret === secret) {
            const notification = parsePayload(request.body);
            if (notification instanceof Error) {
                return HTTPResponses.INVALID_REQUEST
            }

            const event = toDynamoSubscriptionEvent(notification);

            return storingFunction(event)
                .then((value) => {
                    return HTTPResponses.OK
                }).catch((error) => {
                    console.error("Unable to store event", error);
                    return HTTPResponses.INTERNAL_ERROR
                });

        } else {
            return HTTPResponses.UNAUTHORISED
        }
    });
}

export async function handler(request: HTTPRequest): Promise<HTTPResponse> {
    return parseAndStore(request, storeEvent)
}


