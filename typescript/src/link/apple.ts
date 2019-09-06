import 'source-map-support/register'
import {Platform} from "../models/platform";
import {parseAndStoreLink, SubscriptionCheckData} from "./link";
import {UserSubscription} from "../models/userSubscription";
import {APIGatewayProxyEvent, APIGatewayProxyResult} from "aws-lambda";

type AppleSubscription = {
    receipt: string
    originalTransactionId: string
}

type AppleLinkPayload = {
    platform: Platform.DailyEdition | Platform.Ios,
    subscriptions: AppleSubscription[]
}

function parseAppleLinkPayload(request: APIGatewayProxyEvent): AppleLinkPayload {
    return JSON.parse(request.body || "") as AppleLinkPayload;
}

function toUserSubscription(userId: string, payload: AppleLinkPayload): UserSubscription[] {
    return payload.subscriptions.map(sub => new UserSubscription(
        userId,
        sub.originalTransactionId,
        new Date().toISOString()
    ));
}

function toSqsPayload(payload: AppleLinkPayload): SubscriptionCheckData[] {
    return payload.subscriptions.map(sub => ({
        subscriptionId: sub.originalTransactionId,
        subscriptionReference: {
            receipt: sub.receipt
        }
    }))
}

export async function handler(httpRequest: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    return parseAndStoreLink(
        httpRequest,
        parseAppleLinkPayload,
        toUserSubscription,
        toSqsPayload
    )
}
