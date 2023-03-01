import 'source-map-support/register'

import {parseAndStoreLink, SubscriptionCheckData} from "./link";
import {UserSubscription} from "../models/userSubscription";
import {APIGatewayProxyEvent, APIGatewayProxyResult} from "aws-lambda";
import {parseAppleLinkPayload} from "./apple-utils"
import {AppleLinkPayload} from "./apple-utils"

function toUserSubscription(userId: string, payload: AppleLinkPayload): UserSubscription[] {
    const now = new Date().toISOString()
    return payload.subscriptions.map(sub => new UserSubscription(
        userId,
        sub.originalTransactionId,
        now
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
